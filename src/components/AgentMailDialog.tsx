/**
 * Agent mail — les mails à traiter, triés, résumés, et la demande de devis
 * confiée à l'analyse de document d'un clic.
 *
 * Monté par `CRMLayout` (menu latéral, tableau de bord, `?agentMail=1`).
 * D'où viennent les mails, sans rien demander à Azure :
 *  - le DOSSIER où la macro Outlook `ExporterMailsNonLus` enregistre les non
 *    lus en .msg (`dossierMails.ts`) — la macro ouvre MonCRM sur cette fenêtre ;
 *  - les mails GLISSÉS depuis Outlook dans la fenêtre, ou choisis en .msg/.eml.
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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Mail, Loader2, RefreshCw, FileText, ExternalLink, Check, EyeOff, Paperclip, LogOut, Copy, Sparkles,
  FolderOpen, Upload, Archive, ChevronRight,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCRM } from '@/lib/StoreContext';
import { appelerGemini, texteGemini } from '@/lib/modelesIA';
import {
  ConnexionRequise, compteMicrosoft, configMicrosoft, connecterMicrosoft,
  deconnecterMicrosoft, enregistrerConfigMicrosoft, estConnecte, fichierEml, mailsNonLus, marquerLu, uriRetour,
} from '@/lib/microsoftGraph';
import {
  DOSSIER_MAILS, copieEnMemoire, dossierMails, dossierMailsDisponible, fichiersDuDossier, lireMailFichier,
  nomDossierMails, rangerTraite,
} from '@/lib/dossierMails';
import {
  type MailAgent, type TriMail, CATEGORIE_MAIL, clientDuMail, estFichierMail, invitationTri, lireTri, numerosDevisCites,
} from '@/lib/agentMail';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ouvre l'analyse de document sur le mail. */
  onProposerDevis: (fichier: File) => void;
}

const CLE_TRAITES = 'agent_mail_traites';
const CLE_ECARTES = 'agent_mail_ecartes';
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
const memoire: { mails: MailAgent[]; tri: Map<string, TriMail>; compte?: string } = { mails: [], tri: new Map() };

const RANG = { demande_devis: 0, suite_devis: 1, commande: 2, autre: 3 } as const;

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
  const [traites, setTraites] = useState(() => lireIds(CLE_TRAITES));
  const [ecartes, setEcartes] = useState(() => lireIds(CLE_ECARTES));
  const [enCours, setEnCours] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Dossier d'export Outlook */
  const [nomDossier, setNomDossier] = useState<string | null>(null);
  const [dossierOuvert, setDossierOuvert] = useState<FileSystemDirectoryHandle | null>(null);
  /** Bilan de la dernière lecture du dossier — « Relire » qui ne dit rien semble en panne. */
  const [bilanDossier, setBilanDossier] = useState<{ n: number; heure: string } | null>(null);

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
    setTri(t);

    const aTrier = liste.filter(m => !t.has(m.id));
    if (!aTrier.length) return;
    setTriEnCours(true);
    try {
      for (let i = 0; i < aTrier.length; i += PAR_LOT) {
        const lot = aTrier.slice(i, i + PAR_LOT);
        try {
          const rep = texteGemini(await appelerGemini(invitationTri(lot)));
          for (const [id, r] of lireTri(rep, lot.map(m => m.id))) memoire.tri.set(id, r);
          setTri(memoire.tri);
        } catch (e) {
          setErreur(`Tri IA incomplet : ${(e as Error).message}`);
        }
      }
    } finally { setTriEnCours(false); }
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

  const lireDossier = useCallback(async (interactif: boolean, changer = false) => {
    setErreur('');
    try {
      const d = await dossierMails(interactif, changer);
      if (!d) return;
      setDossierOuvert(d);
      setNomDossier(d.name);
      setLecture(true);
      const mailsDossier = await lireFichiers(await fichiersDuDossier(d), true);
      setBilanDossier({ n: mailsDossier.length, heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) });
      setLecture(false);
      await integrer(mailsDossier, m => !!m.duDossier);
    } catch (e) { echec(e); } finally { setLecture(false); }
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

  /* À l'ouverture : relire le dossier (sans demander de droit) et la boîte
     Microsoft 365 si elle est connectée. */
  useEffect(() => {
    if (!open) return;
    nomDossierMails().then(setNomDossier);
    lireDossier(false);
    if (configMicrosoft() && estConnecte()) lireOutlook();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
      let fichier: File;
      if (m.source === 'outlook') {
        fichier = await fichierEml(m);
      } else {
        fichier = await copieEnMemoire(m.fichier!);
        if (m.duDossier && dossierOuvert) {
          try {
            await rangerTraite(dossierOuvert, m.fichier!);
            setMails(memoire.mails.filter(x => x.id !== m.id));
          } catch (e) { toast.error(`Mail non rangé : ${(e as Error).message}`); }
        }
      }
      setTraites(noterId(CLE_TRAITES, m.id));
      onOpenChange(false);
      onProposerDevis(fichier);
    } catch (e) { echec(e); } finally { setEnCours(null); }
  };

  const ranger = async (m: MailAgent) => {
    setEnCours(m.id);
    try {
      if (m.source === 'outlook') await marquerLu(m.id);
      else if (m.duDossier && dossierOuvert) await rangerTraite(dossierOuvert, m.fichier!);
      else setEcartes(noterId(CLE_ECARTES, m.id));
      setMails(memoire.mails.filter(x => x.id !== m.id));
    } catch (e) { echec(e); } finally { setEnCours(null); }
  };

  const ecarter = (m: MailAgent) => setEcartes(noterId(CLE_ECARTES, m.id));

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

  const lignes = useMemo(() => {
    return mails
      .filter(m => !ecartes[m.id])
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
        return { m, t, cl, ouverts, cites };
      })
      .sort((a, b) =>
        (a.t ? RANG[a.t.categorie] : 2.5) - (b.t ? RANG[b.t.categorie] : 2.5)
        || b.m.recuLe.localeCompare(a.m.recuLe));
  }, [mails, tri, ecartes, clients, devis]);

  const utiles = lignes.filter(l => !l.t || l.t.categorie !== 'autre');
  const visibles = toutVoir ? lignes : utiles;
  const nbDemandes = lignes.filter(l => l.t?.categorie === 'demande_devis').length;

  /* ── Rendu ──────────────────────────────────────────────────────────────── */

  const sources = (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-border p-3 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-medium text-sm"><FolderOpen className="w-4 h-4 text-primary" />Mails exportés par Outlook</div>
        {nomDossier ? (
          <>
            <p className="text-muted-foreground">Dossier « <span className="text-foreground">{nomDossier}</span> »
              {bilanDossier && <> · lu à {bilanDossier.heure} : <span className="text-foreground">{bilanDossier.n} mail{bilanDossier.n > 1 ? 's' : ''}</span></>}
            </p>
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
        {dossierMailsDisponible() ? (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 text-xs" disabled={lecture} onClick={() => lireDossier(true)}>
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1', lecture && 'animate-spin')} />
              {nomDossier ? (dossierOuvert ? 'Relire' : 'Lire le dossier') : 'Choisir le dossier'}
            </Button>
            {nomDossier && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => lireDossier(true, true)}>Changer</Button>
            )}
          </div>
        ) : (
          <p className="text-warning">Ce navigateur (mobile ?) ne sait pas ouvrir un dossier : connectez la boîte Microsoft 365 ci-dessous, ou utilisez Chrome / Edge sur ordinateur.</p>
        )}
      </div>

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
        <span className="font-medium text-sm">Glissez des mails depuis Outlook</span>
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
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
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
              {lignes.length} mail{lignes.length > 1 ? 's' : ''} · <strong className="text-foreground">{nbDemandes} demande{nbDemandes > 1 ? 's' : ''} de devis</strong>
            </span>
          )}
          {triEnCours && <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 animate-pulse" />tri en cours…</span>}
          {lignes.length > utiles.length && (
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => setToutVoir(v => !v)}>
              {toutVoir ? 'Masquer les autres' : `Tout voir (${lignes.length - utiles.length} autres)`}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {!lecture && visibles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {lignes.length ? 'Aucune demande parmi ces mails.' : 'Aucun mail à traiter.'}
            </p>
          )}

          {visibles.map(({ m, t, cl, ouverts, cites }) => {
            const cat = t ? CATEGORIE_MAIL[t.categorie] : null;
            const occupe = enCours === m.id;
            return (
              <div key={m.id} className={cn('rounded-lg border p-3 space-y-2', t?.categorie === 'demande_devis' ? 'border-primary/40 bg-primary/[0.03]' : 'border-border')}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {cat
                      ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', cat.couleur)}>{cat.label}{t!.confiance ? ` · ${t!.confiance} %` : ''}</span>
                      : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{triEnCours ? 'tri…' : 'non trié'}</span>}
                    {traites[m.id] && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">Devis proposé</span>}
                    <span className="truncate font-medium text-sm">{m.sujet}</span>
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
                </div>

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
                  {(m.source === 'outlook' || m.duDossier) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={occupe} onClick={() => ranger(m)}
                      title={m.source === 'outlook' ? 'Marquer comme lu dans Outlook' : 'Ranger dans le sous-dossier « Traites »'}>
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
