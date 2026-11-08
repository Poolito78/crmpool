/**
 * Agent mail — les mails à traiter, triés, résumés, et la demande de devis
 * confiée à l'analyse de document d'un clic.
 *
 * Monté par `CRMLayout` (menu latéral, tableau de bord, `?agentMail=1`).
 * D'où viennent les mails, sans rien demander à Azure :
 *  - le DOSSIER où la macro Outlook `ExporterMailsNonLus` enregistre les non
 *    lus en .msg (`dossierMails.ts`) — la macro ouvre MonCRM sur cette fenêtre ;
 *  - les mails GLISSÉS depuis Outlook dans la fenêtre, ou choisis en .msg/.eml ;
 *  - les mails TRANSFÉRÉS depuis le mobile à l'adresse MonCRM
 *    (`mailsTransferes.ts`) — la seule source qui marche sur téléphone.
 * En option (« Avancé »), la connexion directe Microsoft 365 (`microsoftGraph.ts`),
 * qui exige une inscription d'application dans Entra ID.
 *
 * Le tri est fait par Gemini (`agentMail.ts`) ; le client se retrouve par
 * l'adresse de l'expéditeur, jamais par ce que dit le modèle. « Proposer un
 * devis » confie le mail entier — pièces jointes comprises — à l'analyse de
 * document (`onProposerDevis`) : c'est elle qui chiffre, et le dialogue d'envoi
 * du devis qui répond par Outlook.
 *
 * Un mail du dossier est rangé dans `Traites` quand son devis est proposé (le
 * sous-dossier se vide à la main, rien n'est perdu). Un mail Microsoft 365
 * n'est jamais marqué lu sans clic.
 *
 * Ne reste à l'écran que ce qui attend : la macro range les mails répondus,
 * supprimés ou classés, et une demande dont le devis existe chez Odoo passe en
 * « Déjà réalisés » (`devisOdooMails.ts`) ou propose ce devis s'il n'y a pas de
 * preuve qu'il y répond.
 *
 * Les mails se replient par catégorie : le premier de chaque groupe porte le
 * bouton −, et replié il reste seul, sur une ligne, avec + et le nombre de mails
 * du groupe. Ce choix est mémorisé dans ce navigateur.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Mail, Loader2, RefreshCw, FileText, ExternalLink, Check, EyeOff, Paperclip, LogOut, Copy, Sparkles,
  FolderOpen, Upload, Archive, ChevronRight, Smartphone, X, Plus, Minus,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCRM } from '@/lib/StoreContext';
import { numerosOdooCites, ouvrirDansOdoo, LIBELLE_MODELE } from '@/lib/numerosOdoo';
import { appelerGemini, texteGemini } from '@/lib/modelesIA';
import {
  ConnexionRequise, compteMicrosoft, configMicrosoft, connecterMicrosoft,
  deconnecterMicrosoft, enregistrerConfigMicrosoft, estConnecte, fichierEml, mailsNonLus, marquerLu, uriRetour,
} from '@/lib/microsoftGraph';
import {
  DOSSIER_MAILS, copieEnMemoire, dernierExport, dossierMails, dossierMailsDisponible, fichiersDuDossier,
  idFichier, lienOutlook, lireIndexOutlook, lireMailFichier, nomDossierMails, rangerTraite,
} from '@/lib/dossierMails';
import {
  type MailAgent, type TriMail, CATEGORIE_MAIL, clientDuMail, estFichierMail, invitationTri, lireTri, numerosDevisCites,
  triSansModele,
} from '@/lib/agentMail';
import {
  type AdressesMail, type DevisOdooLu, type ReponseDevisOdoo, ETAT_DEVIS_ODOO, adressesDuMail, lireDevisOdoo, rapprocherMail,
} from '@/lib/devisOdooMails';
import {
  type AdresseAgent, type DonneesTransfert, adresseDeTransfert, classerMailTransfere, enregistrerAdresseAgent,
  fichiersPourAnalyse, lireAdresseAgent, lireMailsTransferes,
} from '@/lib/mailsTransferes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ouvre l'analyse de document sur le mail (et ses classeurs Excel). */
  onProposerDevis: (fichiers: File[]) => void;
}

const CLE_TRAITES = 'agent_mail_traites';
const CLE_ECARTES = 'agent_mail_ecartes';
/** « mail|numéro » : ce devis Odoo ne répond pas à ce mail, décidé à la main. */
const CLE_PAS_CE_DEVIS = 'agent_mail_pas_ce_devis';
/** Les devis Odoo se relisent au plus souvent que cela. */
const RELECTURE_ODOO_MS = 10 * 60 * 1000;
/** Mails envoyés au modèle par appel : au-delà, la réponse se tronque. */
const PAR_LOT = 10;

function lireIds(cle: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(cle) || '{}'); } catch { return {}; }
}
function noterId(cle: string, id: string): Record<string, string> {
  const ids = lireIds(cle);
  ids[id] = new Date().toISOString();
  /* Ne garder que les 300 derniers : un mail traité sort de la liste de toute façon. */
  const garde = Object.fromEntries(Object.entries(ids).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 300));
  try { localStorage.setItem(cle, JSON.stringify(garde)); } catch { /* stockage indisponible */ }
  return garde;
}

/* Le dernier tri survit à la fermeture de la fenêtre : la rouvrir ne doit pas
   relancer le modèle sur les mêmes mails. */
const memoire: {
  mails: MailAgent[]; tri: Map<string, TriMail>; compte?: string;
  odoo?: ReponseDevisOdoo; odooCle?: string; odooHeure?: number;
} = { mails: [], tri: new Map() };

/* …ni au rechargement de la page : la macro exporte aussi les mails lus sans
   réponse, ceux qui ne sont pas des demandes restent au dossier, et chaque
   ouverture les renverrait au modèle. Un id de fichier change avec le fichier. */
const CLE_TRI = 'agent_mail_tri';
const triGarde: Map<string, TriMail> = (() => {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(CLE_TRI) || '{}')) as [string, TriMail][]); }
  catch { return new Map(); }
})();
function garderTri(id: string, t: TriMail) {
  triGarde.delete(id);
  triGarde.set(id, t);
  const derniers = [...triGarde].slice(-1500);
  try { localStorage.setItem(CLE_TRI, JSON.stringify(Object.fromEntries(derniers))); } catch { /* stockage plein */ }
}
/* Mails partis au modèle : une relecture pendant le tri ne les renvoie pas. */
const enVol = new Set<string>();
/* Déjà soumis : un mail que le modèle a sauté n'est pas renvoyé à chaque relecture,
   et après deux échecs de suite (quota) on laisse le modèle tranquille un moment. */
const triTentes = new Set<string>();
let triEnPauseJusqua = 0;
const PAUSE_TRI_MS = 15 * 60 * 1000;

/** Au-delà, la macro ne tourne plus (un week-end sans mail en fait 63 h). */
const EXPORT_PERIME_MS = 72 * 3600 * 1000;

const RANG = { demande_devis: 0, suite_devis: 1, commande: 2, autre: 3 } as const;

/* Les catégories repliées. La liste est triée par rang : un groupe se suit. */
const CLE_GROUPES_REPLIES = 'agent_mail_groupes_replies';
const groupeDe = (t?: TriMail) => t?.categorie ?? 'non_trie';
function lireGroupesReplies(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLE_GROUPES_REPLIES) || '[]')); } catch { return new Set(); }
}

function dateCourte(iso: string): string {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? heure
    : `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${heure}`;
}

export default function AgentMailDialog({ open, onOpenChange, onProposerDevis }: Props) {
  const { clients, devis } = useCRM();
  const navigate = useNavigate();

  const [mails, setMailsEtat] = useState<MailAgent[]>(memoire.mails);
  const [tri, setTriEtat] = useState<Map<string, TriMail>>(memoire.tri);
  const setMails = (m: MailAgent[]) => { memoire.mails = m; setMailsEtat(m); };
  const setTri = (t: Map<string, TriMail>) => { memoire.tri = t; setTriEtat(new Map(t)); };

  const [lecture, setLecture] = useState(false);
  const [triEnCours, setTriEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [toutVoir, setToutVoir] = useState(false);
  const [voirRealises, setVoirRealises] = useState(false);
  const [groupesReplies, setGroupesReplies] = useState(lireGroupesReplies);
  const [odoo, setOdoo] = useState<ReponseDevisOdoo | undefined>(memoire.odoo);
  const [erreurOdoo, setErreurOdoo] = useState('');
  const [pasCeDevis, setPasCeDevis] = useState(() => lireIds(CLE_PAS_CE_DEVIS));
  const [traites, setTraites] = useState(() => lireIds(CLE_TRAITES));
  const [ecartes, setEcartes] = useState(() => lireIds(CLE_ECARTES));
  const [enCours, setEnCours] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Dossier d'export Outlook */
  const [nomDossier, setNomDossier] = useState<string | null>(null);
  const [dossierOuvert, setDossierOuvert] = useState<FileSystemDirectoryHandle | null>(null);
  /** Bilan de la dernière lecture du dossier — « Relire » qui ne dit rien semble en panne. */
  const [bilanDossier, setBilanDossier] = useState<{ n: number; heure: string; dernier: string | null } | null>(null);

  /* Transfert depuis le mobile */
  const [adresseAgent, setAdresseAgent] = useState<AdresseAgent | null>(null);
  const [saisieAdresse, setSaisieAdresse] = useState('');
  const [reglerAdresse, setReglerAdresse] = useState(false);
  const [bilanTransferts, setBilanTransferts] = useState<{ n: number; heure: string } | null>(null);

  /* Microsoft 365 (option avancée) */
  /* Sans accès aux dossiers (mobile), la boîte Microsoft 365 est LA source : ouverte d'emblée. */
  const [avance, setAvance] = useState(() => !dossierMailsDisponible());
  const [config, setConfig] = useState(configMicrosoft);
  const [connecte, setConnecte] = useState(estConnecte);
  const [compte, setCompte] = useState(memoire.compte);
  const [saisieId, setSaisieId] = useState(config?.clientId ?? '');
  const [saisieTenant, setSaisieTenant] = useState(config?.tenant === 'organizations' ? '' : config?.tenant ?? '');

  const echec = useCallback((e: unknown) => {
    if (e instanceof ConnexionRequise) { setConnecte(false); setErreur(e.message); return; }
    if ((e as Error)?.name === 'AbortError') return;
    setErreur((e as Error).message || String(e));
  }, []);

  /** Ajoute des mails à la liste (les remplace par source), puis trie les nouveaux. */
  const integrer = useCallback(async (nouveaux: MailAgent[], remplacer?: (m: MailAgent) => boolean) => {
    const garde = memoire.mails.filter(m => !(remplacer?.(m)) && !nouveaux.some(n => n.id === m.id));
    const liste = [...garde, ...nouveaux];
    setMails(liste);
    const t = new Map([...memoire.tri].filter(([id]) => liste.some(m => m.id === id)));
    for (const m of liste) {
      const g = triGarde.get(m.id) ?? triSansModele(m);
      if (g && !t.has(m.id)) t.set(m.id, g);
    }
    setTri(t);

    /* Les plus récents d'abord : si le quota lâche, ce sont eux qui comptent. */
    const aTrier = liste.filter(m => !t.has(m.id) && !enVol.has(m.id) && !triTentes.has(m.id))
      .sort((a, b) => b.recuLe.localeCompare(a.recuLe));
    if (!aTrier.length || Date.now() < triEnPauseJusqua) return;
    aTrier.forEach(m => enVol.add(m.id));
    setTriEnCours(true);
    let echecs = 0;
    try {
      for (let i = 0; i < aTrier.length; i += PAR_LOT) {
        const lot = aTrier.slice(i, i + PAR_LOT);
        lot.forEach(m => triTentes.add(m.id));
        try {
          const rep = texteGemini(await appelerGemini(invitationTri(lot)));
          for (const [id, r] of lireTri(rep, lot.map(m => m.id))) { memoire.tri.set(id, r); garderTri(id, r); }
          setTri(memoire.tri);
          echecs = 0;
        } catch (e) {
          lot.forEach(m => triTentes.delete(m.id));
          setErreur(`Tri IA incomplet : ${(e as Error).message}`);
          if (++echecs >= 2) {
            triEnPauseJusqua = Date.now() + PAUSE_TRI_MS;
            setErreur(`Tri IA suspendu 15 min : Gemini ne répond plus (quota probablement atteint). ${aTrier.length - i} mail(s) restent à trier.`);
            break;
          }
        }
      }
    } finally {
      aTrier.forEach(m => enVol.delete(m.id));
      setTriEnCours(enVol.size > 0);
    }
  }, []);

  const lireFichiers = useCallback(async (fichiers: File[], duDossier: boolean) => {
    const res: MailAgent[] = [];
    const illisibles: string[] = [];
    for (const f of fichiers.filter(f => estFichierMail(f.name))) {
      try { res.push(await lireMailFichier(f, duDossier)); } catch { illisibles.push(f.name); }
    }
    if (illisibles.length) setErreur(`Illisible : ${illisibles.join(', ')}`);
    return res;
  }, []);

  /** `silencieux` : relecture automatique — ni rouet, ni bandeau d'erreur effacé ou posé. */
  const lireDossier = useCallback(async (interactif: boolean, changer = false, silencieux = false) => {
    if (!silencieux) setErreur('');
    try {
      const d = await dossierMails(interactif, changer);
      if (!d) return;
      setDossierOuvert(d);
      setNomDossier(d.name);
      if (!silencieux) setLecture(true);
      /* Seuls les nouveaux fichiers sont ouverts : le dossier se relit chaque minute. */
      const fichiers = await fichiersDuDossier(d);
      const connus = new Map(memoire.mails.filter(m => m.duDossier).map(m => [m.id, m]));
      const mailsDossier = [
        ...fichiers.flatMap(f => { const c = connus.get(idFichier(f)); return c ? [{ ...c, fichier: f }] : []; }),
        ...await lireFichiers(fichiers.filter(f => !connus.has(idFichier(f))), true),
      ];
      const index = await lireIndexOutlook(d);
      for (const m of mailsDossier) m.entryId = index.get(m.fichier!.name);
      setBilanDossier({
        n: mailsDossier.length,
        heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        dernier: await dernierExport(d).catch(() => null),
      });
      setLecture(false);
      await integrer(mailsDossier, m => !!m.duDossier);
    } catch (e) {
      /* Le choix abandonné ne doit pas ressembler à un bouton en panne. */
      if (interactif && (e as Error)?.name === 'AbortError') setErreur('Aucun dossier choisi : la fenêtre Windows a été fermée sans désigner « Mails a traiter ».');
      else if (!silencieux) echec(e);
    } finally { setLecture(false); }
  }, [echec, integrer, lireFichiers]);

  const lireOutlook = useCallback(async () => {
    setErreur('');
    setLecture(true);
    try {
      const connu = memoire.compte;
      const [liste, moi] = await Promise.all([mailsNonLus(30), connu ? Promise.resolve(null) : compteMicrosoft()]);
      if (moi) { memoire.compte = moi.email || moi.nom; setCompte(memoire.compte); }
      setLecture(false);
      await integrer(liste.map(m => ({ ...m, source: 'outlook' as const })), m => m.source === 'outlook');
    } catch (e) { echec(e); } finally { setLecture(false); }
  }, [echec, integrer]);

  const lireTransferts = useCallback(async () => {
    try {
      const adresse = await lireAdresseAgent();
      setAdresseAgent(adresse);
      if (adresse) setSaisieAdresse(adresse.adresseEntree);
      const liste = await lireMailsTransferes();
      setBilanTransferts({ n: liste.length, heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) });
      await integrer(liste, m => m.source === 'transfert');
    } catch (e) {
      /* Migration pas encore appliquée : la section le dira, sans bandeau rouge. */
      const msg = (e as Error).message || '';
      if (/agent_mail_cles|mails_agent|schema cache|does not exist/i.test(msg)) setAdresseAgent(null);
      else echec(e);
    }
  }, [echec, integrer]);

  /* À l'ouverture : les mails transférés, le dossier (sans demander de droit)
     et la boîte Microsoft 365 si elle est connectée. */
  useEffect(() => {
    if (!open) return;
    lireTransferts();
    nomDossierMails().then(setNomDossier);
    lireDossier(false);
    if (configMicrosoft() && estConnecte()) lireOutlook();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Outlook exporte chaque mail à son arrivée (ThisOutlookSession) : le dossier
     se relit toutes les minutes et au retour sur l'onglet, sans clic. */
  useEffect(() => {
    if (!open || !dossierOuvert) return;
    const relire = () => { if (document.visibilityState === 'visible') lireDossier(false, false, true); };
    const minuterie = window.setInterval(relire, 60_000);
    window.addEventListener('focus', relire);
    return () => { window.clearInterval(minuterie); window.removeEventListener('focus', relire); };
  }, [open, dossierOuvert, lireDossier]);

  const enregistrerAdresse = async () => {
    const a = saisieAdresse.trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)) { toast.error('Adresse de réception invalide'); return; }
    try {
      setAdresseAgent(await enregistrerAdresseAgent(a));
      setReglerAdresse(false);
      toast.success('Adresse MonCRM enregistrée');
    } catch (e) { echec(e); }
  };

  const ajouterFichiers = async (liste: FileList | File[]) => {
    const fichiers = Array.from(liste);
    if (!fichiers.some(f => estFichierMail(f.name))) {
      toast.error('Déposez des mails Outlook (.msg) ou .eml');
      return;
    }
    setErreur('');
    /* Copie en mémoire : un fichier glissé depuis Outlook est temporaire. */
    const copies = await Promise.all(fichiers.map(copieEnMemoire));
    await integrer(await lireFichiers(copies, false));
  };

  const arreter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const proposerDevis = async (m: MailAgent) => {
    setEnCours(m.id);
    try {
      let fichiers: File[];
      if (m.source === 'outlook') {
        fichiers = [await fichierEml(m)];
      } else if (m.source === 'transfert') {
        fichiers = await fichiersPourAnalyse(m as MailAgent & { transfert: DonneesTransfert });
        await classerMailTransfere(m as MailAgent & { transfert: DonneesTransfert }, 'traite');
        setMails(memoire.mails.filter(x => x.id !== m.id));
      } else {
        fichiers = [await copieEnMemoire(m.fichier!)];
        if (m.duDossier && dossierOuvert) {
          try {
            await rangerTraite(dossierOuvert, m.fichier!);
            setMails(memoire.mails.filter(x => x.id !== m.id));
          } catch (e) { toast.error(`Mail non rangé : ${(e as Error).message}`); }
        }
      }
      setTraites(noterId(CLE_TRAITES, m.id));
      onOpenChange(false);
      onProposerDevis(fichiers);
    } catch (e) { echec(e); } finally { setEnCours(null); }
  };

  const ranger = async (m: MailAgent) => {
    setEnCours(m.id);
    try {
      if (m.source === 'outlook') await marquerLu(m.id);
      else if (m.source === 'transfert') await classerMailTransfere(m as MailAgent & { transfert: DonneesTransfert }, 'traite');
      else if (m.duDossier && dossierOuvert) await rangerTraite(dossierOuvert, m.fichier!);
      else setEcartes(noterId(CLE_ECARTES, m.id));
      setMails(memoire.mails.filter(x => x.id !== m.id));
    } catch (e) { echec(e); } finally { setEnCours(null); }
  };

  /* Sans EntryID (mail glissé, ou exporté avant l'index) : une copie du .msg,
     qu'Outlook ouvre — on peut y répondre, mais ce n'est pas le mail de la boîte. */
  const ouvrirCopie = async (m: MailAgent) => {
    try {
      const copie = await copieEnMemoire(m.fichier!);
      const url = URL.createObjectURL(copie);
      const a = document.createElement('a');
      a.href = url;
      a.download = copie.name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { echec(e); }
  };

  const ecarter = async (m: MailAgent) => {
    if (m.source !== 'transfert') { setEcartes(noterId(CLE_ECARTES, m.id)); return; }
    /* Écarté en base : il disparaît aussi sur le téléphone. */
    try {
      await classerMailTransfere(m as MailAgent & { transfert: DonneesTransfert }, 'ecarte');
      setMails(memoire.mails.filter(x => x.id !== m.id));
    } catch (e) { echec(e); }
  };

  const seConnecter = async () => {
    setErreur('');
    try {
      await connecterMicrosoft();
      setConnecte(true);
      memoire.compte = undefined;
      await lireOutlook();
    } catch (e) { echec(e); }
  };

  const enregistrerConfig = () => {
    if (!/^[0-9a-f-]{36}$/i.test(saisieId.trim())) { toast.error("L'ID d'application est un GUID de 36 caractères"); return; }
    enregistrerConfigMicrosoft(saisieId, saisieTenant);
    setConfig(configMicrosoft());
    setConnecte(false);
  };

  const deconnecter = () => {
    deconnecterMicrosoft();
    memoire.compte = undefined;
    setCompte(undefined);
    setConnecte(false);
    setMails(memoire.mails.filter(m => m.source !== 'outlook'));
  };

  /* ── La liste ─────────────────────────────────────────────────────────── */

  const lignesBrutes = useMemo(() => {
    /* Glissé à la main puis exporté par Outlook : un seul, celui du dossier
       (il se range dans Traites). */
    const cle = (m: MailAgent) => `${m.deEmail}|${m.sujet.trim().toLowerCase()}`;
    const duDossier = new Set(mails.filter(m => m.duDossier).map(cle));
    return mails
      .filter(m => !ecartes[m.id])
      .filter(m => m.duDossier || m.source !== 'fichier' || !duDossier.has(cle(m)))
      .map(m => {
        const t = tri.get(m.id);
        const interne = /@(isofloor|isosign|so-signal|sti-fr)\./i.test(m.deEmail);
        const cl = interne ? { comment: 'inconnu' as const, candidats: [] } : clientDuMail(m.deEmail, `${m.deNom}\n${m.corps}`, clients);
        const ouverts = cl.client
          ? devis.filter(d => d.clientId === cl.client!.id && (d.statut === 'brouillon' || d.statut === 'envoyé'))
              .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation)).slice(0, 3)
          : [];
        const cites = numerosDevisCites(`${m.sujet}\n${m.corps}`)
          .map(n => devis.find(d => d.numero.toUpperCase() === n))
          .filter((d): d is NonNullable<typeof d> => !!d);
        /* Les dossiers Odoo nommés dans le mail (« ACHAT P29317- AF041510 »), à ouvrir d'un clic. */
        const dossiersOdoo = numerosOdooCites(`${m.sujet}\n${m.corps}`);
        return { m, t, cl, ouverts, cites, dossiersOdoo, adresses: adressesDuMail(m, cl.client) };
      })
      .sort((a, b) =>
        (a.t ? RANG[a.t.categorie] : 2.5) - (b.t ? RANG[b.t.categorie] : 2.5)
        || b.m.recuLe.localeCompare(a.m.recuLe));
  }, [mails, tri, ecartes, clients, devis]);

  /* Les demandes à rapprocher : une seule lecture Odoo pour toutes, et pas
     tant que le tri tourne (chaque lot changerait la liste). */
  const demandesOdoo = useMemo(() => {
    const demandes = lignesBrutes.filter(l => l.t?.categorie === 'demande_devis' && !isNaN(Date.parse(l.m.recuLe)));
    if (!demandes.length) return null;
    const unir = (cle: keyof AdressesMail) => [...new Set(demandes.flatMap(l => l.adresses[cle]))].sort();
    const depuis = demandes.reduce((min, l) => (l.m.recuLe < min ? l.m.recuLe : min), demandes[0].m.recuLe).slice(0, 10);
    return { emails: unir('emails'), domaines: unir('domaines'), depuis };
  }, [lignesBrutes]);

  useEffect(() => {
    if (!open || triEnCours || !demandesOdoo?.emails.length) return;
    const cle = JSON.stringify(demandesOdoo);
    if (memoire.odooCle === cle && Date.now() - (memoire.odooHeure ?? 0) < RELECTURE_ODOO_MS) return;
    memoire.odooCle = cle;
    memoire.odooHeure = Date.now();
    lireDevisOdoo(demandesOdoo)
      .then(r => { memoire.odoo = r; setOdoo(r); setErreurOdoo(''); })
      .catch(e => setErreurOdoo((e as Error).message || String(e)));
  }, [open, triEnCours, demandesOdoo, bilanDossier]);

  const lignes = useMemo(() => lignesBrutes.map(l => ({
    ...l,
    odoo: odoo ? rapprocherMail({ recuLe: l.m.recuLe, sujet: l.m.sujet, tri: l.t }, l.adresses, odoo, n => !!pasCeDevis[`${l.m.id}|${n}`]) : null,
  })), [lignesBrutes, odoo, pasCeDevis]);

  const realises = lignes.filter(l => l.odoo?.certitude === 'sur');
  const aFaire = lignes.filter(l => l.odoo?.certitude !== 'sur');
  const utiles = aFaire.filter(l => !l.t || l.t.categorie !== 'autre');
  const visibles = toutVoir ? aFaire : utiles;
  const nbDemandes = aFaire.filter(l => l.t?.categorie === 'demande_devis').length;

  const refuserDevis = (m: MailAgent, numero: string) => setPasCeDevis(noterId(CLE_PAS_CE_DEVIS, `${m.id}|${numero}`));

  const basculerGroupe = (groupe: string) => {
    const suivant = new Set(groupesReplies);
    if (!suivant.delete(groupe)) suivant.add(groupe);
    setGroupesReplies(suivant);
    try { localStorage.setItem(CLE_GROUPES_REPLIES, JSON.stringify([...suivant])); } catch { /* stockage indisponible */ }
  };

  const lienDevisOdoo = (d: DevisOdooLu) => (d.lien
    ? <a href={d.lien} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{d.numero}</a>
    : <span className="font-medium">{d.numero}</span>);
  const detailDevisOdoo = (d: DevisOdooLu) => [
    dateCourte(d.creeLe),
    `${d.montantHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT`,
    ETAT_DEVIS_ODOO[d.etat] || d.etat,
    d.vendeur,
  ].filter(Boolean).join(' · ');

  /* ── Rendu ──────────────────────────────────────────────────────────────── */

  const adresseComplete = adresseAgent ? adresseDeTransfert(adresseAgent.adresseEntree, adresseAgent.cle) : '';
  const carteMobile = (
    <div className="rounded-lg border border-border p-3 text-xs space-y-2">
      <div className="flex items-center gap-1.5 font-medium text-sm">
        <Smartphone className="w-4 h-4 text-primary" />Depuis le mobile : transférer à MonCRM
        {adresseAgent && (
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={lireTransferts} title="Relire les mails transférés">
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Relire
          </Button>
        )}
      </div>
      {adresseAgent && !reglerAdresse ? (
        <>
          <p className="text-muted-foreground">Dans Outlook mobile, <strong>Transférer</strong> la demande à :</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground break-all">{adresseComplete}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { navigator.clipboard?.writeText(adresseComplete); toast.success('Adresse copiée'); }}>
              <Copy className="w-3.5 h-3.5 mr-1" />Copier
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReglerAdresse(true)}>Modifier</Button>
          </div>
          {bilanTransferts && (
            <p className="text-muted-foreground">Lu à {bilanTransferts.heure} : <span className="text-foreground">{bilanTransferts.n} mail{bilanTransferts.n > 1 ? 's' : ''} transféré{bilanTransferts.n > 1 ? 's' : ''}</span> à traiter</p>
          )}
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            Saisissez l'adresse de réception de votre service (Cloudflare Email Routing : « agent@votre-domaine.fr » ;
            Postmark : « xxxx@inbound.postmarkapp.com »). MonCRM y ajoute votre clé personnelle.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Input className="h-8 text-xs flex-1 min-w-[200px]" value={saisieAdresse} onChange={e => setSaisieAdresse(e.target.value)} placeholder="agent@votre-domaine.fr" />
            <Button size="sm" className="h-8 text-xs" onClick={enregistrerAdresse}>Enregistrer</Button>
            {adresseAgent && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setReglerAdresse(false)}>Annuler</Button>}
          </div>
        </>
      )}
    </div>
  );

  const sources = (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2">{carteMobile}</div>
      {dossierMailsDisponible() && <div className="rounded-lg border border-border p-3 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-medium text-sm"><FolderOpen className="w-4 h-4 text-primary" />Mails exportés par Outlook</div>
        {nomDossier ? (
          <>
            <p className="text-muted-foreground">Dossier « <span className="text-foreground">{nomDossier}</span> »
              {bilanDossier && <> · lu à {bilanDossier.heure} : <span className="text-foreground">{bilanDossier.n} mail{bilanDossier.n > 1 ? 's' : ''}</span></>}
            </p>
            {bilanDossier?.dernier && (
              Date.now() - new Date(bilanDossier.dernier).getTime() > EXPORT_PERIME_MS ? (
                <p className="text-warning">
                  Outlook n'a rien exporté depuis le mail du {dateCourte(bilanDossier.dernier)}.
                  « Relire » relit le dossier sans interroger Outlook : relancez la macro
                  <strong> ExporterMailsNonLus</strong>, ou installez l'export automatique
                  (<span className="font-mono text-[10px]">outlook_macro\ThisOutlookSession.vba</span>).
                </p>
              ) : (
                <p className="text-muted-foreground">Dernier mail exporté : reçu {dateCourte(bilanDossier.dernier)}</p>
              )
            )}
            {bilanDossier?.n === 0 && (
              <p className="text-warning">
                Aucun .msg dans ce dossier. La macro les enregistre dans
                <span className="block font-mono text-[10px] mt-0.5">{DOSSIER_MAILS}</span>
                Cliquez « Changer » et désignez ce dossier (ou « MonCRM »).
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Lancez la macro Outlook <strong>ExporterMailsNonLus</strong>, puis choisissez le dossier
            <span className="block font-mono text-[10px] text-foreground mt-0.5">{DOSSIER_MAILS}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="h-7 text-xs" disabled={lecture} onClick={() => lireDossier(true)}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1', lecture && 'animate-spin')} />
            {nomDossier ? (dossierOuvert ? 'Relire' : 'Lire le dossier') : 'Choisir le dossier'}
          </Button>
          {nomDossier && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => lireDossier(true, true)}>Changer</Button>
          )}
        </div>
      </div>}

      <div
        className={cn('rounded-lg border-2 border-dashed p-3 text-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-colors',
          survol ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
        onClick={() => inputRef.current?.click()}
        onDragEnter={e => { arreter(e); setSurvol(true); }}
        onDragOver={arreter}
        onDragLeave={e => { arreter(e); setSurvol(false); }}
        onDrop={e => { arreter(e); setSurvol(false); ajouterFichiers(e.dataTransfer.files); }}
      >
        <Upload className="w-5 h-5 text-primary" />
        <span className="font-medium text-sm">{dossierMailsDisponible() ? 'Glissez des mails depuis Outlook' : 'Ouvrir des mails .msg / .eml'}</span>
        <span className="text-muted-foreground">ou cliquez pour choisir des .msg / .eml</span>
        <input ref={inputRef} type="file" multiple accept=".msg,.eml,message/rfc822" className="hidden"
          onChange={e => { if (e.target.files) ajouterFichiers(e.target.files); e.target.value = ''; }} />
      </div>
    </div>
  );

  const avanceBloc = (
    <div className="rounded-lg border border-border p-3 text-xs space-y-3">
      {!config || !connecte ? (
        <>
          <p className="text-muted-foreground">
            Lecture directe de la boîte Microsoft 365, sans macro. Exige une inscription d'application dans Entra ID
            (à demander à l'administrateur Microsoft) : plateforme <strong>Application monopage (SPA)</strong>,
            URI de redirection
            <span className="mx-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {uriRetour()}
              <button type="button" title="Copier" onClick={() => { navigator.clipboard?.writeText(uriRetour()); toast.success('Copié'); }}>
                <Copy className="w-3 h-3" />
              </button>
            </span>,
            autorisations déléguées <strong>Mail.ReadWrite</strong>, <strong>User.Read</strong>, <strong>offline_access</strong>.
            {!config?.depuisEnv && <> L'ID saisi reste dans <strong>ce</strong> navigateur : à saisir une fois sur chaque appareil, ou à poser une fois pour tous dans Vercel (<span className="font-mono">VITE_MS_CLIENT_ID</span>, <span className="font-mono">VITE_MS_TENANT_ID</span>).</>}
          </p>
          {!config?.depuisEnv && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ms-client" className="text-xs">ID d'application (client)</Label>
                <Input id="ms-client" className="h-8 text-xs" value={saisieId} onChange={e => setSaisieId(e.target.value)} placeholder="xxxxxxxx-xxxx-…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ms-tenant" className="text-xs">ID de l'annuaire (locataire)</Label>
                <Input id="ms-tenant" className="h-8 text-xs" value={saisieTenant} onChange={e => setSaisieTenant(e.target.value)} placeholder="xxxxxxxx-xxxx-…" />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            {!config?.depuisEnv && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={enregistrerConfig}>Enregistrer</Button>}
            {config && <Button size="sm" className="h-7 text-xs" onClick={seConnecter}><Mail className="w-3.5 h-3.5 mr-1" />Se connecter</Button>}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <span>Microsoft 365 connecté{compte ? ` : ${compte}` : ''}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" disabled={lecture} onClick={lireOutlook}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Relire
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={deconnecter}><LogOut className="w-3.5 h-3.5 mr-1" />Déconnecter</Button>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)]"
        onDragEnter={arreter}
        onDragOver={arreter}
        onDrop={e => { arreter(e); ajouterFichiers(e.dataTransfer.files); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" />Agent mail</DialogTitle>
          <DialogDescription>
            Mails à traiter, résumés et triés par l'IA. « Proposer un devis » ouvre l'analyse de document sur le mail et ses pièces jointes.
          </DialogDescription>
        </DialogHeader>

        {sources}

        {erreur && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{erreur}</p>}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {lecture ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Lecture des mails…</span>
          ) : (
            <span>
              {aFaire.length} mail{aFaire.length > 1 ? 's' : ''} à traiter · <strong className="text-foreground">{nbDemandes} demande{nbDemandes > 1 ? 's' : ''} de devis</strong>
            </span>
          )}
          {triEnCours && <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 animate-pulse" />tri en cours…</span>}
          {aFaire.length > utiles.length && (
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => setToutVoir(v => !v)}>
              {toutVoir ? 'Masquer les autres' : `Tout voir (${aFaire.length - utiles.length} autres)`}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {!lecture && visibles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {lignes.length ? 'Aucune demande parmi ces mails.' : 'Aucun mail à traiter.'}
            </p>
          )}

          {visibles.map(({ m, t, cl, ouverts, cites, dossiersOdoo, odoo: rapproche }, i) => {
            const cat = t ? CATEGORIE_MAIL[t.categorie] : null;
            const occupe = enCours === m.id;
            const groupe = groupeDe(t);
            const premier = i === 0 || groupeDe(visibles[i - 1].t) !== groupe;
            const replie = groupesReplies.has(groupe);
            if (replie && !premier) return null;
            const pastille = cat
              ? <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', cat.couleur)}>{cat.label}{t!.confiance ? ` · ${t!.confiance} %` : ''}</span>
              : <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{triEnCours ? 'tri…' : 'non trié'}</span>;
            if (replie) {
              const nombre = visibles.filter(l => groupeDe(l.t) === groupe).length;
              return (
                <button key={m.id} type="button" aria-expanded={false}
                  className={cn('flex w-full min-w-0 items-center gap-1.5 rounded-lg border p-2 text-left hover:bg-muted/50', t?.categorie === 'demande_devis' ? 'border-primary/40 bg-primary/[0.03]' : 'border-border')}
                  title={`Développer ce groupe (${nombre} mail${nombre > 1 ? 's' : ''})`}
                  onClick={() => basculerGroupe(groupe)}>
                  <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded border border-border bg-background px-1 text-[11px] font-semibold tabular-nums">
                    <Plus className="w-3 h-3" />{nombre}
                  </span>
                  {pastille}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.sujet}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{dateCourte(m.recuLe)}</span>
                </button>
              );
            }
            return (
              <div key={m.id} className={cn('rounded-lg border p-3 space-y-2', t?.categorie === 'demande_devis' ? 'border-primary/40 bg-primary/[0.03]' : 'border-border')}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {premier && (
                      <button type="button" aria-expanded aria-label="Replier ce groupe" title="Replier ce groupe"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground"
                        onClick={() => basculerGroupe(groupe)}>
                        <Minus className="w-3 h-3" />
                      </button>
                    )}
                    {pastille}
                    {traites[m.id] && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">Devis proposé</span>}
                    <span className="min-w-0 max-w-full truncate font-medium text-sm">{m.sujet}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="truncate" title={m.deEmail}>{m.deNom || m.deEmail || 'expéditeur inconnu'}</span>
                    <span>{dateCourte(m.recuLe)}</span>
                    {m.piecesJointes.length > 0 && (
                      <span className="inline-flex items-center gap-0.5" title={m.piecesJointes.join('\n')}>
                        <Paperclip className="w-3 h-3" />{m.piecesJointes.length}
                      </span>
                    )}
                  </div>
                </div>

                {t?.resume && <p className="text-sm">{t.resume}</p>}
                {t && t.demandes.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                    {t.demandes.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
                {(t?.chantier || t?.delai) && (
                  <p className="text-xs text-muted-foreground">
                    {t.chantier && <>Chantier : <span className="text-foreground">{t.chantier}</span></>}
                    {t.chantier && t.delai && ' · '}
                    {t.delai && <>Délai : <span className="text-foreground">{t.delai}</span></>}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {cl.client ? (
                    <span>Client : <strong>{cl.client.societe || cl.client.nom}</strong>
                      <span className="text-muted-foreground"> ({cl.comment === 'adresse' ? 'adresse connue' : cl.comment === 'personne' ? 'même personne' : 'même domaine'})</span>
                    </span>
                  ) : cl.comment === 'plusieurs' ? (
                    <span className="text-warning">Plusieurs fiches possibles : {cl.candidats.slice(0, 3).map(c => c.societe || c.nom).join(', ')} — à vérifier</span>
                  ) : (
                    <span className="text-muted-foreground">Client inconnu{t?.societe ? ` — se présente comme « ${t.societe} »` : ''}</span>
                  )}
                  {[...cites, ...ouverts.filter(o => !cites.includes(o))].map(d => (
                    <button key={d.id} type="button" className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={() => { onOpenChange(false); navigate(`/devis?editDevis=${d.id}`); }}
                      title={cites.includes(d) ? 'Devis cité dans le mail' : `Devis ${d.statut} du client`}>
                      <FileText className="w-3 h-3" />{d.numero}{cites.includes(d) ? ' (cité)' : ''}
                    </button>
                  ))}
                  {dossiersOdoo.map(n => (
                    <button key={n.numero} type="button"
                      className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/10"
                      title={`Ouvrir ${n.numero} (${LIBELLE_MODELE[n.modele]}) dans Odoo`}
                      onClick={async () => {
                        const r = await ouvrirDansOdoo(n);
                        if (r === 'introuvable') toast.warning(`${n.numero} : aucun(e) ${LIBELLE_MODELE[n.modele]} de ce numéro dans Odoo.`);
                        else if (r === 'liste') toast.info(`Odoo n'a pas répondu : liste ouverte, ${n.numero} copié — collez-le dans la recherche.`);
                        else if (r === 'a-deployer') toast.warning(`Ouverture directe pas encore active : la fonction odoo-devis-mails est à redéployer. En attendant, liste ouverte et ${n.numero} copié.`, { duration: 10000 });
                      }}>
                      <ExternalLink className="w-3 h-3" />{n.numero}
                    </button>
                  ))}
                </div>

                {rapproche && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-warning/10 px-2 py-1.5 text-xs">
                    <span>Devis Odoo possible : {lienDevisOdoo(rapproche.devis)}
                      <span className="text-muted-foreground"> ({detailDevisOdoo(rapproche.devis)}){rapproche.autres > 0 ? ` · ${rapproche.autres} autre${rapproche.autres > 1 ? 's' : ''}` : ''}</span>
                    </span>
                    <Button size="sm" variant="outline" className="h-6 text-xs" disabled={occupe} onClick={() => ranger(m)} title="Ce devis répond à la demande : le mail est rangé comme traité">
                      <Check className="w-3 h-3 mr-1" />C'est lui
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => refuserDevis(m, rapproche.devis.numero)}>
                      <X className="w-3 h-3 mr-1" />Non
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Button size="sm" className="h-7 text-xs" disabled={occupe}
                    variant={t?.categorie === 'demande_devis' || !t ? 'default' : 'outline'}
                    onClick={() => proposerDevis(m)}>
                    {occupe ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Proposer un devis
                  </Button>
                  {m.lienWeb && (
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <a href={m.lienWeb} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1" />Répondre dans Outlook</a>
                    </Button>
                  )}
                  {m.source === 'fichier' && (m.entryId ? (
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <a href={lienOutlook(m.entryId)}
                        title="Rouvre le mail dans Outlook. Rien ne se passe ? Exécuter une fois outlook_macro\lien-outlook.reg sur ce poste.">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />Ouvrir dans Outlook
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => ouvrirCopie(m)}
                      title="Mail sans lien vers la boîte (glissé, ou exporté avant l'index de la macro) : télécharge une copie du .msg, qu'Outlook ouvre.">
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />Ouvrir le .msg
                    </Button>
                  ))}
                  {(m.source === 'outlook' || m.source === 'transfert' || m.duDossier) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={occupe} onClick={() => ranger(m)}
                      title={m.source === 'outlook' ? 'Marquer comme lu dans Outlook' : m.source === 'transfert' ? 'Classer comme traité (sur tous les appareils)' : 'Ranger dans le sous-dossier « Traites »'}>
                      {m.source === 'outlook' ? <><Check className="w-3.5 h-3.5 mr-1" />Marquer lu</> : <><Archive className="w-3.5 h-3.5 mr-1" />Ranger (traité)</>}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => ecarter(m)} title="Ne plus le proposer ici">
                    <EyeOff className="w-3.5 h-3.5 mr-1" />Écarter
                  </Button>
                </div>
              </div>
            );
          })}

          {realises.length > 0 && (
            <div className="rounded-lg border border-border">
              <button type="button" className="flex w-full items-center gap-1.5 p-3 text-left text-sm font-medium" onClick={() => setVoirRealises(v => !v)}>
                <ChevronRight className={cn('w-4 h-4 transition-transform', voirRealises && 'rotate-90')} />
                <Check className="w-4 h-4 text-success" />Déjà réalisés dans Odoo ({realises.length})
              </button>
              {voirRealises && (
                <div className="divide-y divide-border border-t border-border">
                  {realises.map(({ m, odoo: rapproche }) => (
                    <div key={m.id} className="space-y-1 p-3 text-xs">
                      <p className="truncate text-sm font-medium">{m.sujet}</p>
                      <p className="text-muted-foreground">{m.deNom || m.deEmail || 'expéditeur inconnu'} · {dateCourte(m.recuLe)}</p>
                      <p>{lienDevisOdoo(rapproche!.devis)}<span className="text-muted-foreground"> ({detailDevisOdoo(rapproche!.devis)})</span>
                        <span className="text-muted-foreground"> — d'après : {rapproche!.preuves.join(' ; ')}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {(m.source === 'transfert' || m.duDossier) && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={enCours === m.id} onClick={() => ranger(m)}>
                            <Archive className="w-3 h-3 mr-1" />Ranger (traité)
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                          onClick={() => refuserDevis(m, rapproche!.devis.numero)} title="Ce devis ne répond pas à cette demande : le mail revient à traiter">
                          <X className="w-3 h-3 mr-1" />Pas ce devis
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {erreurOdoo && (
            <p className="text-xs text-muted-foreground">Rapprochement avec les devis Odoo indisponible : {erreurOdoo}</p>
          )}
          {odoo?.tronque && (
            <p className="text-xs text-warning">Trop de devis Odoo sur la période : les plus anciens n'ont pas été comparés.</p>
          )}
        </div>

        <div className="pt-1">
          <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setAvance(a => !a)}>
            <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', avance && 'rotate-90')} />
            Avancé : connexion directe Microsoft 365 (Azure)
          </button>
          {avance && <div className="mt-2">{avanceBloc}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
