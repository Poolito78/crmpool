/**
 * Agent mail — les mails non lus d'Outlook, triés, résumés, et la demande de
 * devis confiée à l'analyse de document d'un clic.
 *
 * Monté par `CRMLayout` (menu latéral, bouton du tableau de bord). Le tri est
 * fait par Gemini (`agentMail.ts`) ; le client se retrouve par l'adresse de
 * l'expéditeur, jamais par ce que dit le modèle. « Proposer un devis »
 * télécharge le .eml entier — pièces jointes comprises — et le passe à
 * `onProposerDevis`, qui ouvre l'analyse de document dessus : c'est elle qui
 * chiffre, crée le devis, et le dialogue d'envoi qui répond.
 *
 * Rien n'est marqué lu sans un clic : un devis proposé puis abandonné ne doit
 * pas faire disparaître la demande de la boîte. Le mail est seulement noté
 * « devis proposé » dans ce navigateur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Mail, Loader2, RefreshCw, FileText, ExternalLink, Check, EyeOff, Paperclip, LogOut, Settings, Copy, Sparkles,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCRM } from '@/lib/StoreContext';
import { appelerGemini, texteGemini } from '@/lib/modelesIA';
import {
  type MailOutlook, ConnexionRequise, compteMicrosoft, configMicrosoft, connecterMicrosoft,
  deconnecterMicrosoft, enregistrerConfigMicrosoft, estConnecte, fichierEml, mailsNonLus, marquerLu, uriRetour,
} from '@/lib/microsoftGraph';
import {
  type TriMail, CATEGORIE_MAIL, clientDuMail, invitationTri, lireTri, numerosDevisCites,
} from '@/lib/agentMail';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ouvre l'analyse de document sur le mail téléchargé. */
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
  /* Ne garder que les 300 derniers : un mail lu sort de la liste de toute façon. */
  const garde = Object.fromEntries(Object.entries(ids).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 300));
  try { localStorage.setItem(cle, JSON.stringify(garde)); } catch { /* stockage indisponible */ }
  return garde;
}

/* Le dernier tri survit à la fermeture de la fenêtre : la rouvrir ne doit pas
   relancer le modèle sur les mêmes mails. */
let memoire: { mails: MailOutlook[]; tri: Map<string, TriMail>; compte?: string } | null = null;

const RANG = { demande_devis: 0, suite_devis: 1, commande: 2, autre: 3 } as const;

function dateCourte(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  return d.toDateString() === auj.toDateString()
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function AgentMailDialog({ open, onOpenChange, onProposerDevis }: Props) {
  const { clients, devis } = useCRM();
  const navigate = useNavigate();

  const [config, setConfig] = useState(configMicrosoft);
  const [connecte, setConnecte] = useState(estConnecte);
  const [compte, setCompte] = useState(memoire?.compte);
  const [mails, setMails] = useState<MailOutlook[]>(memoire?.mails ?? []);
  const [tri, setTri] = useState<Map<string, TriMail>>(memoire?.tri ?? new Map());
  const [lecture, setLecture] = useState(false);
  const [triEnCours, setTriEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [toutVoir, setToutVoir] = useState(false);
  const [traites, setTraites] = useState(() => lireIds(CLE_TRAITES));
  const [ecartes, setEcartes] = useState(() => lireIds(CLE_ECARTES));
  const [enCours, setEnCours] = useState<string | null>(null);
  const [saisieId, setSaisieId] = useState(config?.clientId ?? '');
  const [saisieTenant, setSaisieTenant] = useState(config?.tenant === 'organizations' ? '' : config?.tenant ?? '');
  const [reglages, setReglages] = useState(false);

  const echec = useCallback((e: unknown) => {
    if (e instanceof ConnexionRequise) { setConnecte(false); setErreur(e.message); return; }
    setErreur((e as Error).message || String(e));
  }, []);

  const charger = useCallback(async () => {
    setLecture(true);
    setErreur('');
    try {
      const connu = memoire?.compte;
      const [liste, moi] = await Promise.all([mailsNonLus(30), connu ? Promise.resolve(null) : compteMicrosoft()]);
      const nomCompte = moi ? (moi.email || moi.nom) : connu;
      if (moi) setCompte(nomCompte);
      setMails(liste);
      setLecture(false);

      /* Seuls les mails pas encore triés partent au modèle. */
      const anciens = memoire?.tri ?? new Map<string, TriMail>();
      const neuf = new Map([...anciens].filter(([id]) => liste.some(m => m.id === id)));
      setTri(new Map(neuf));
      const aTrier = liste.filter(m => !neuf.has(m.id));
      memoire = { mails: liste, tri: neuf, compte: nomCompte };
      if (!aTrier.length) return;

      setTriEnCours(true);
      for (let i = 0; i < aTrier.length; i += PAR_LOT) {
        const lot = aTrier.slice(i, i + PAR_LOT);
        try {
          const rep = texteGemini(await appelerGemini(invitationTri(lot)));
          for (const [id, t] of lireTri(rep, lot.map(m => m.id))) neuf.set(id, t);
          setTri(new Map(neuf));
          memoire = { mails: liste, tri: neuf, compte: nomCompte };
        } catch (e) {
          setErreur(`Tri IA incomplet : ${(e as Error).message}`);
        }
      }
    } catch (e) {
      echec(e);
    } finally {
      setLecture(false);
      setTriEnCours(false);
    }
  }, [echec]);

  useEffect(() => {
    if (open && config && connecte && !memoire) charger();
  }, [open, config, connecte]); // eslint-disable-line react-hooks/exhaustive-deps

  const seConnecter = async () => {
    setErreur('');
    try {
      await connecterMicrosoft();
      setConnecte(true);
      memoire = null;
      setCompte(undefined);
      await charger();
    } catch (e) { echec(e); }
  };

  const enregistrerConfig = () => {
    if (!/^[0-9a-f-]{36}$/i.test(saisieId.trim())) { toast.error("L'ID d'application est un GUID de 36 caractères"); return; }
    enregistrerConfigMicrosoft(saisieId, saisieTenant);
    setConfig(configMicrosoft());
    setConnecte(false);
    setReglages(false);
    memoire = null;
  };

  const proposerDevis = async (m: MailOutlook) => {
    setEnCours(m.id);
    try {
      const fichier = await fichierEml(m);
      setTraites(noterId(CLE_TRAITES, m.id));
      onOpenChange(false);
      onProposerDevis(fichier);
    } catch (e) { echec(e); } finally { setEnCours(null); }
  };

  const lu = async (m: MailOutlook) => {
    setEnCours(m.id);
    try {
      await marquerLu(m.id);
      setMails(ms => ms.filter(x => x.id !== m.id));
      if (memoire) memoire.mails = memoire.mails.filter(x => x.id !== m.id);
    } catch (e) { echec(e); } finally { setEnCours(null); }
  };

  const ecarter = (m: MailOutlook) => setEcartes(noterId(CLE_ECARTES, m.id));

  const lignes = useMemo(() => {
    const domaineMoi = compte?.split('@')[1];
    return mails
      .filter(m => !ecartes[m.id])
      .map(m => {
        const t = tri.get(m.id);
        const interne = !!domaineMoi && m.deEmail.endsWith('@' + domaineMoi);
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
  }, [mails, tri, ecartes, clients, devis, compte]);

  const utiles = lignes.filter(l => !l.t || l.t.categorie !== 'autre');
  const visibles = toutVoir ? lignes : utiles;
  const nbDemandes = lignes.filter(l => l.t?.categorie === 'demande_devis').length;

  /* ── Rendu ──────────────────────────────────────────────────────────────── */

  const ecranConfig = (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        L'agent lit votre boîte Outlook par Microsoft Graph. Il faut, une fois, une inscription d'application
        dans Entra ID (portail Azure → <em>Inscriptions d'applications</em>) :
      </p>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>Type de comptes : <strong>cet annuaire uniquement</strong>.</li>
        <li>Plateforme <strong>Application monopage (SPA)</strong>, URI de redirection :
          <span className="ml-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {uriRetour()}
            <button type="button" title="Copier" onClick={() => { navigator.clipboard?.writeText(uriRetour()); toast.success('Copié'); }}>
              <Copy className="w-3 h-3" />
            </button>
          </span>
        </li>
        <li>Autorisations déléguées Microsoft Graph : <strong>Mail.ReadWrite</strong>, <strong>User.Read</strong>, <strong>offline_access</strong>.</li>
      </ol>
      {config?.depuisEnv ? (
        <p className="text-xs text-muted-foreground">Configuration fournie par le déploiement (VITE_MS_CLIENT_ID).</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ms-client">ID d'application (client)</Label>
            <Input id="ms-client" value={saisieId} onChange={e => setSaisieId(e.target.value)} placeholder="xxxxxxxx-xxxx-…" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-tenant">ID de l'annuaire (locataire)</Label>
            <Input id="ms-tenant" value={saisieTenant} onChange={e => setSaisieTenant(e.target.value)} placeholder="xxxxxxxx-xxxx-…" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            {config && <Button variant="ghost" onClick={() => setReglages(false)}>Annuler</Button>}
            <Button onClick={enregistrerConfig}>Enregistrer</Button>
          </div>
        </div>
      )}
    </div>
  );

  const ecranConnexion = (
    <div className="flex flex-col items-center gap-3 py-8 text-center text-sm">
      <Mail className="w-10 h-10 text-primary" />
      <p className="text-muted-foreground max-w-sm">
        Connectez votre boîte Outlook : l'agent lira les mails non lus de la boîte de réception et repérera les demandes de devis.
      </p>
      <Button onClick={seConnecter}><Mail className="w-4 h-4 mr-1.5" />Se connecter à Outlook</Button>
    </div>
  );

  const ecranListe = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {lecture ? (
          <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Lecture de la boîte…</span>
        ) : (
          <span>
            {mails.length} non lu{mails.length > 1 ? 's' : ''} · <strong className="text-foreground">{nbDemandes} demande{nbDemandes > 1 ? 's' : ''} de devis</strong>
          </span>
        )}
        {triEnCours && <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 animate-pulse" />tri en cours…</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setToutVoir(v => !v)}>
            {toutVoir ? 'Masquer les autres' : `Tout voir (${lignes.length - utiles.length} autres)`}
          </Button>
          <Button variant="ghost" size="sm" className="h-7" title="Relire la boîte" disabled={lecture || triEnCours} onClick={charger}>
            <RefreshCw className={cn('w-3.5 h-3.5', lecture && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {!lecture && visibles.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {mails.length ? 'Aucune demande parmi les mails non lus.' : 'Aucun mail non lu dans la boîte de réception.'}
        </p>
      )}

      {visibles.map(({ m, t, cl, ouverts, cites }) => {
        const cat = t ? CATEGORIE_MAIL[t.categorie] : null;
        const occupe = enCours === m.id;
        return (
          <div key={m.id} className={cn('rounded-lg border p-3 space-y-2', t?.categorie === 'demande_devis' ? 'border-primary/40 bg-primary/[0.03]' : 'border-border')}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {cat
                    ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', cat.couleur)}>{cat.label}{t!.confiance ? ` · ${t!.confiance} %` : ''}</span>
                    : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{triEnCours ? 'tri…' : 'non trié'}</span>}
                  {traites[m.id] && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">Devis proposé</span>}
                  <span className="truncate font-medium text-sm">{m.sujet}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="truncate" title={m.deEmail}>{m.deNom || m.deEmail}</span>
                  <span>{dateCourte(m.recuLe)}</span>
                  {m.piecesJointes.length > 0 && (
                    <span className="inline-flex items-center gap-0.5" title={m.piecesJointes.join('\n')}>
                      <Paperclip className="w-3 h-3" />{m.piecesJointes.length}
                    </span>
                  )}
                </div>
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
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={occupe} onClick={() => lu(m)} title="Marquer comme lu dans Outlook">
                <Check className="w-3.5 h-3.5 mr-1" />Marquer lu
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => ecarter(m)} title="Ne plus le proposer ici (reste non lu dans Outlook)">
                <EyeOff className="w-3.5 h-3.5 mr-1" />Écarter
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />Agent mail
            {config && !reglages && (
              <span className="ml-auto mr-6 flex items-center gap-1">
                {compte && <span className="text-xs font-normal text-muted-foreground">{compte}</span>}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Réglages Microsoft" onClick={() => setReglages(true)}>
                  <Settings className="w-3.5 h-3.5" />
                </Button>
                {connecte && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Déconnecter Outlook"
                    onClick={() => { deconnecterMicrosoft(); memoire = null; setConnecte(false); setMails([]); setTri(new Map()); setCompte(undefined); }}>
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                )}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Mails non lus de la boîte de réception, résumés et triés. « Proposer un devis » ouvre l'analyse de document sur le mail et ses pièces jointes.
          </DialogDescription>
        </DialogHeader>

        {erreur && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{erreur}</p>}

        {!config || reglages ? ecranConfig : !connecte ? ecranConnexion : ecranListe}
      </DialogContent>
    </Dialog>
  );
}
