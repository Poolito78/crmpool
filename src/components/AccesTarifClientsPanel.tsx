import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, KeyRound, Loader2, Mail, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/lib/StoreContext';
import type { Client } from '@/lib/store';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { genererIdentifiantsTarif, mailIdentifiantsTarif, type IdentifiantsTarif } from '@/lib/tarifEnLigne';

interface Acces { client_id: string; identifiant: string; derniere_connexion: string | null }

/** Conditions tarifaires que le tarif en ligne appliquera (règle `prixGamme`). */
function conditions(c: Client): string {
  const remises = Object.entries(c.remisesParCategorie || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k.split('/').pop()?.trim()} ${v} %`);
  if (remises.length) return remises.join(' · ');
  return c.estRevendeur ? 'Revendeur : remise de gamme (ISOFLOOR 30 %)' : 'Prix public';
}

const MAX_LIGNES = 60;

/**
 * Accès des clients au tarif en ligne, client par client — l'identifiant est
 * l'e-mail de la fiche, les prix ceux de ses conditions (fiche client).
 *
 * Cocher ouvre l'accès ; la première fois, les identifiants sont créés et le
 * mot de passe affiché UNE fois, avec un mail prêt à envoyer. Décocher coupe
 * l'accès aussitôt (la fonction relit la case à chaque appel).
 */
export default function AccesTarifClientsPanel() {
  const { clients, updateClients } = useCRM();
  const navigate = useNavigate();
  const [acces, setAcces] = useState<Map<string, Acces>>(new Map());
  const [demandeurs, setDemandeurs] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ client: Client; ids: IdentifiantsTarif } | null>(null);

  const chargerAcces = useCallback(async () => {
    const [{ data, error }, { data: dem }] = await Promise.all([
      supabase.from('tarif_acces').select('client_id, identifiant, derniere_connexion'),
      supabase.from('tarif_demandes').select('client_id').not('client_id', 'is', null),
    ]);
    if (error) toast.error(`Accès tarif : ${error.message}`);
    setAcces(new Map((data || []).map(a => [a.client_id, a as Acces])));
    setDemandeurs(new Set((dem || []).map(d => d.client_id as string)));
  }, []);
  useEffect(() => {
    chargerAcces();
    /* Une demande acceptée dans le panneau voisin rejoint la liste. */
    window.addEventListener('tarif-acces-maj', chargerAcces);
    return () => window.removeEventListener('tarif-acces-maj', chargerAcces);
  }, [chargerAcces]);

  /* La liste : clients venus d'une demande, ou ajoutés ici (identifiants
     créés). Le reste du fichier client n'y figure pas — on l'y ajoute par la
     recherche « Ajouter un client ». */
  const estListe = useCallback((c: Client) => !!c.accesTarif || acces.has(c.id) || demandeurs.has(c.id), [acces, demandeurs]);
  const lignes = useMemo(() => clients
    .filter(estListe)
    .sort((a, b) => Number(!!b.accesTarif) - Number(!!a.accesTarif)
      || (a.societe || a.nom).localeCompare(b.societe || b.nom, 'fr')),
  [clients, estListe]);
  const candidats = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return clients
      .filter(c => !estListe(c) && `${c.societe || ''} ${c.nom} ${c.email} ${c.ville}`.toLowerCase().includes(s))
      .slice(0, 8);
  }, [clients, q, estListe]);
  const nbAvecAcces = useMemo(() => clients.filter(c => c.accesTarif).length, [clients]);

  const genererPour = async (c: Client) => {
    setEnCours(c.id);
    try {
      const ids = await genererIdentifiantsTarif(c.id, c.email);
      updateClients(prev => prev.map(x => x.id === c.id ? { ...x, accesTarif: true } : x));
      setResultat({ client: c, ids });
      await chargerAcces();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnCours(null);
    }
  };

  const basculer = async (c: Client, v: boolean) => {
    if (v && !acces.has(c.id)) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '')) {
        toast.error(`${c.societe || c.nom} : la fiche n'a pas d'e-mail valide, il sert d'identifiant.`);
        return;
      }
      await genererPour(c);
      return;
    }
    updateClients(prev => prev.map(x => x.id === c.id ? { ...x, accesTarif: v } : x));
    toast.success(v ? `Accès rouvert pour ${c.societe || c.nom}` : `Accès coupé pour ${c.societe || c.nom}`);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          Clients — accès au tarif catalogue
          <Badge variant="secondary">{nbAvecAcces}</Badge>
        </h3>
        <p className="text-xs text-muted-foreground">
          Clients ayant fait une demande ou ajoutés ici. Le client se connecte avec l'e-mail de sa fiche et voit le
          catalogue à SES conditions (remises de sa fiche client). Décocher « Tarif catalogue » coupe l'accès immédiatement.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Ajouter un client (société, nom, e-mail, ville)…" className="pl-8 h-9" />
        {candidats.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
            {candidats.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                onClick={async () => { setQ(''); await basculer(c, true); }}
              >
                <span className="min-w-0">
                  <span className="font-medium">{c.societe || c.nom}</span>
                  <span className="block text-xs text-muted-foreground truncate">{c.email || "pas d'e-mail"}{c.ville ? ` · ${c.ville}` : ''}</span>
                </span>
                <span className="text-xs text-primary shrink-0">Ajouter</span>
              </button>
            ))}
          </div>
        )}
        {q.trim().length >= 2 && candidats.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">Aucun autre client trouvé.</p>
        )}
      </div>

      {resultat && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm space-y-1">
          <p className="font-semibold">{resultat.client.societe || resultat.client.nom}</p>
          <p><span className="text-muted-foreground">Identifiant :</span> <strong>{resultat.ids.identifiant}</strong></p>
          <p><span className="text-muted-foreground">Mot de passe :</span> <strong className="font-mono">{resultat.ids.mdp}</strong></p>
          <p className="text-xs text-amber-700">Ce mot de passe ne sera plus affiché : transmettez-le maintenant.</p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" asChild>
              <a href={mailIdentifiantsTarif(resultat.ids, resultat.client.contacts?.[0]?.nom || resultat.client.nom)}>
                <Mail className="w-4 h-4 mr-1.5" /> Préparer le mail
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResultat(null)}>Fermer</Button>
          </div>
        </div>
      )}

      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun client pour l'instant : ils apparaissent ici quand vous acceptez une demande ou que vous en ajoutez un ci-dessus.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Client</th>
                <th className="py-2 pr-3 font-medium">E-mail (identifiant)</th>
                <th className="py-2 pr-3 font-medium">Conditions tarifaires</th>
                <th className="py-2 pr-3 font-medium text-center">Tarif catalogue</th>
                <th className="py-2 font-medium text-right">Identifiants</th>
              </tr>
            </thead>
            <tbody>
              {lignes.slice(0, MAX_LIGNES).map(c => {
                const a = acces.get(c.id);
                const emailDiffere = a && a.identifiant !== (c.email || '').trim().toLowerCase();
                return (
                  <tr key={c.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="font-medium text-left hover:text-primary hover:underline"
                        title="Ouvrir la fiche client"
                        onClick={() => navigate(`/clients?editClient=${encodeURIComponent(c.id)}`)}
                      >{c.societe || c.nom}</button>
                      {c.ville && <p className="text-xs text-muted-foreground">{c.ville}</p>}
                    </td>
                    <td className="py-2 pr-3">
                      {c.email || <span className="text-amber-600 text-xs">pas d'e-mail</span>}
                      {emailDiffere && <p className="text-xs text-amber-600">identifiant actuel : {a.identifiant} — renouveler pour aligner</p>}
                      {a?.derniere_connexion && (
                        <p className="text-xs text-muted-foreground">vu le {new Date(a.derniere_connexion).toLocaleDateString('fr-FR')}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs">{conditions(c)}</td>
                    <td className="py-2 pr-3 text-center">
                      {enCours === c.id
                        ? <Loader2 className="w-4 h-4 animate-spin inline" />
                        : <Checkbox checked={!!c.accesTarif} onCheckedChange={v => basculer(c, v === true)} />}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {c.accesTarif && (
                        <>
                          <Button size="sm" variant="ghost" disabled={enCours === c.id} onClick={() => genererPour(c)} title="Créer / renouveler le mot de passe">
                            <KeyRound className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" asChild title="Voir son tarif">
                            <a href={`/tarif?client=${c.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lignes.length > MAX_LIGNES && (
            <p className="text-xs text-muted-foreground mt-2">{lignes.length - MAX_LIGNES} autres clients — affinez la recherche.</p>
          )}
        </div>
      )}
    </div>
  );
}
