import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Mail, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type Client } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { genererIdentifiantsTarif, mailIdentifiantsTarif, urlTarif, type IdentifiantsTarif } from '@/lib/tarifEnLigne';

interface DemandeTarif {
  id: string;
  entreprise: string;
  nom: string;
  email: string;
  telephone: string | null;
  siret: string | null;
  ville: string | null;
  message: string | null;
  statut: 'nouvelle' | 'acceptee' | 'refusee';
  client_id: string | null;
  cree_le: string;
}

/* Une fiche créée par `updateClients` part en base sans qu'on l'attende :
   la fonction des identifiants la chercherait avant qu'elle y soit. */
async function attendreClient(id: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const { data } = await supabase.from('clients').select('id').eq('id', id).maybeSingle();
    if (data) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

/**
 * Demandes d'accès au tarif en ligne (formulaire public de `/tarif`).
 *
 * Accepter rattache la demande au client de même e-mail s'il existe, sinon
 * crée la fiche ; puis coche « Accès à son tarif » et génère le mot de passe,
 * affiché une fois avec un mail prêt à envoyer. Les remises du client se
 * règlent ensuite dans sa fiche : sans elles, il voit le prix public.
 */
export default function DemandesTarifPanel() {
  const { clients, updateClients } = useCRM();
  const [demandes, setDemandes] = useState<DemandeTarif[]>([]);
  const [charge, setCharge] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [voirTraitees, setVoirTraitees] = useState(false);
  const [resultat, setResultat] = useState<{ demandeId: string; ids: IdentifiantsTarif; nom: string } | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    const { data, error } = await supabase.from('tarif_demandes').select('*').order('cree_le', { ascending: false });
    if (error) toast.error(`Demandes d'accès : ${error.message}`);
    setDemandes((data || []) as unknown as DemandeTarif[]);
    setCharge(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const accepter = async (d: DemandeTarif) => {
    setEnCours(d.id);
    try {
      const email = d.email.trim().toLowerCase();
      let client = clients.find(c => (c.email || '').trim().toLowerCase() === email);
      if (!client) {
        const nouveau: Client = {
          id: generateId(),
          dateCreation: new Date().toISOString().split('T')[0],
          nom: d.nom, email, telephone: d.telephone || '', telephoneMobile: '',
          adresse: '', ville: d.ville || '', codePostal: '', societe: d.entreprise,
          notes: d.message ? `Demande d'accès au tarif : ${d.message}` : '',
          adressesLivraison: [], estRevendeur: false, remisesParCategorie: {},
          contacts: [{ id: generateId(), nom: d.nom, email, telephone: d.telephone || '' }],
          siret: d.siret || undefined, accesTarif: true,
        };
        updateClients(prev => [...prev, nouveau]);
        if (!(await attendreClient(nouveau.id))) throw new Error("La fiche client n'a pas pu être enregistrée.");
        client = nouveau;
      } else if (!client.accesTarif) {
        const id = client.id;
        updateClients(prev => prev.map(c => c.id === id ? { ...c, accesTarif: true } : c));
      }
      const ids = await genererIdentifiantsTarif(client.id, email);
      const { error } = await supabase.from('tarif_demandes')
        .update({ statut: 'acceptee', client_id: client.id, traitee_le: new Date().toISOString() }).eq('id', d.id);
      if (error) toast.error(error.message);
      setResultat({ demandeId: d.id, ids, nom: d.nom });
      toast.success(`Accès ouvert pour ${d.entreprise}. Réglez ses remises dans sa fiche client.`);
      charger();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnCours(null);
    }
  };

  const refuser = async (d: DemandeTarif) => {
    setEnCours(d.id);
    const { error } = await supabase.from('tarif_demandes')
      .update({ statut: 'refusee', traitee_le: new Date().toISOString() }).eq('id', d.id);
    setEnCours(null);
    if (error) toast.error(error.message); else charger();
  };

  const visibles = demandes.filter(d => voirTraitees || d.statut === 'nouvelle');
  const nbNouvelles = demandes.filter(d => d.statut === 'nouvelle').length;

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            Demandes d'accès au tarif en ligne
            {nbNouvelles > 0 && <Badge>{nbNouvelles}</Badge>}
          </h3>
          <p className="text-xs text-muted-foreground">
            Formulaire public : <a href={`${urlTarif()}?demande`} target="_blank" rel="noopener noreferrer" className="underline">{urlTarif()}?demande</a>
            {' '}— le lien du tarif ne s'envoie qu'aux clients validés.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setVoirTraitees(v => !v)}>
            {voirTraitees ? 'Nouvelles seulement' : 'Voir aussi les traitées'}
          </Button>
          <Button size="sm" variant="ghost" onClick={charger}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/tarif" target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4 mr-1.5" /> Ouvrir le tarif</a>
          </Button>
        </div>
      </div>

      {resultat && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm space-y-1">
          <p><span className="text-muted-foreground">Identifiant :</span> <strong>{resultat.ids.identifiant}</strong></p>
          <p><span className="text-muted-foreground">Mot de passe :</span> <strong className="font-mono">{resultat.ids.mdp}</strong></p>
          <p className="text-xs text-amber-700">Ce mot de passe ne sera plus affiché : transmettez-le maintenant.</p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" asChild>
              <a href={mailIdentifiantsTarif(resultat.ids, resultat.nom)}><Mail className="w-4 h-4 mr-1.5" /> Préparer le mail</a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResultat(null)}>Fermer</Button>
          </div>
        </div>
      )}

      {charge ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande {voirTraitees ? '' : 'en attente'}.</p>
      ) : (
        <div className="divide-y divide-border">
          {visibles.map(d => (
            <div key={d.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm min-w-0">
                <p className="font-semibold">
                  {d.entreprise}
                  {d.statut !== 'nouvelle' && (
                    <Badge variant={d.statut === 'acceptee' ? 'secondary' : 'outline'} className="ml-2 text-[10px]">
                      {d.statut === 'acceptee' ? 'Acceptée' : 'Refusée'}
                    </Badge>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {d.nom} · <a href={`mailto:${d.email}`} className="underline">{d.email}</a>
                  {d.telephone && <> · {d.telephone}</>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[d.ville, d.siret && `SIRET ${d.siret}`, new Date(d.cree_le).toLocaleDateString('fr-FR')].filter(Boolean).join(' · ')}
                </p>
                {d.message && <p className="text-xs mt-1 italic">« {d.message} »</p>}
              </div>
              {d.statut === 'nouvelle' && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" disabled={enCours === d.id} onClick={() => accepter(d)}>
                    {enCours === d.id ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                    Accepter
                  </Button>
                  <Button size="sm" variant="outline" disabled={enCours === d.id} onClick={() => refuser(d)}>
                    <X className="w-4 h-4 mr-1.5" /> Refuser
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
