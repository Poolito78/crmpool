/**
 * Encart « Rechercher dans Odoo » de la fiche client : nom, prénom, société
 * tapés dans n'importe quel ordre → fiches Odoo → fiche relue (société,
 * adresse, TVA, conditions, contacts à cocher) → la fiche MonCRM se remplit.
 * Lecture seule chez Odoo. Règles : `ficheClientOdoo.ts`.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Building2, Loader2, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Client } from '@/lib/store';
import type { PartenaireOdoo } from '@/lib/fournisseurOdoo';
import { natureFicheOdoo } from '@/lib/clientOdoo';
import {
  chercherClientsOdoo, lireFicheClientOdoo, clientDejaConnu, contactsProposes, contactCherche,
  type ContactOdoo, type FicheClientOdoo,
} from '@/lib/ficheClientOdoo';

interface Props {
  clients: Client[];
  /** Fiche neuve : Odoo fait foi. Fiche existante : Odoo ne remplit que le vide. */
  nouveau: boolean;
  /** Client en cours de modification — n'est pas son propre doublon. */
  clientId?: string;
  onRemplir: (fiche: FicheClientOdoo, contacts: ContactOdoo[]) => void;
  onOuvrirExistant: (c: Client) => void;
}

export function RechercheClientOdoo({ clients, nouveau, clientId, onRemplir, onOuvrirExistant }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [terme, setTerme] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [resultats, setResultats] = useState<PartenaireOdoo[] | null>(null);
  const [fiche, setFiche] = useState<FicheClientOdoo | null>(null);
  const [coches, setCoches] = useState<Set<number>>(new Set());

  async function chercher() {
    if (terme.trim().length < 3) { toast.error('Tapez au moins 3 caractères'); return; }
    setEnCours(true);
    setFiche(null);
    try {
      setResultats(await chercherClientsOdoo(terme));
    } catch (e) {
      toast.error(`Odoo injoignable : ${(e as Error).message}`);
    } finally {
      setEnCours(false);
    }
  }

  async function choisir(p: PartenaireOdoo) {
    setEnCours(true);
    try {
      const f = await lireFicheClientOdoo(p);
      setFiche(f);
      const cherche = contactCherche(f);
      setCoches(new Set(cherche ? [cherche.id] : []));
      if (f.partielle) toast.info('Contacts non lus : redéployez odoo-prix (.\\deploy-function.ps1 odoo-prix)');
    } catch (e) {
      toast.error(`Odoo injoignable : ${(e as Error).message}`);
    } finally {
      setEnCours(false);
    }
  }

  function remplir() {
    if (!fiche) return;
    const retenus = contactsProposes(fiche).filter(c => coches.has(c.id));
    onRemplir(fiche, retenus);
    setOuvert(false);
    setFiche(null);
    setResultats(null);
    setTerme('');
  }

  const existant = fiche ? clientDejaConnu(fiche, clients.filter(c => c.id !== clientId)) : undefined;
  const proposes = fiche ? contactsProposes(fiche) : [];

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed border-violet-400/60 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
        onClick={() => { setOuvert(o => !o); setResultats(null); setFiche(null); }}
      >
        <Search className="w-3.5 h-3.5 mr-1.5" />
        {nouveau ? 'Rechercher dans Odoo (nom, prénom, société…)' : 'Compléter depuis Odoo'}
      </Button>

      {ouvert && (
        <div className="rounded-lg border border-violet-400/40 bg-violet-500/5 p-3 space-y-2">
          {!fiche && (
            <>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  className="h-8 text-sm flex-1"
                  placeholder="Ex. : Jean Dupont, Colas, dupont@colas.fr, Rennes…"
                  value={terme}
                  onChange={e => setTerme(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); chercher(); } }}
                />
                <Button type="button" size="sm" className="h-8 px-3" disabled={terme.trim().length < 3 || enCours} onClick={chercher}>
                  {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {resultats && resultats.length === 0 && !enCours && (
                <p className="text-xs text-muted-foreground text-center py-2">Aucune fiche Odoo ne porte tous ces mots.</p>
              )}
              {resultats && resultats.length > 0 && (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {resultats.map(p => {
                    const nature = natureFicheOdoo({ estSociete: p.estSociete, societeMere: p.societeMere, type: p.type });
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={enCours}
                        onClick={() => choisir(p)}
                        className="w-full text-left rounded-md border border-border bg-background hover:bg-accent/50 px-3 py-1.5 transition-colors disabled:opacity-60"
                      >
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          {p.estSociete ? <Building2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                          <span className="truncate">{p.nom}</span>
                          {p.fonction && <span className="text-xs font-normal text-muted-foreground truncate">· {p.fonction}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {[nature, [p.codePostal, p.ville].filter(Boolean).join(' '), p.email].filter(Boolean).join(' · ')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground text-center">Chaque mot est cherché dans le nom, la société, le courriel, la ville et la TVA — lecture seule.</p>
            </>
          )}

          {fiche && (
            <div className="space-y-2">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => setFiche(null)}>
                <ArrowLeft className="w-3 h-3" /> Retour aux résultats
              </button>
              <div className="rounded-md border border-border bg-background p-2.5 text-sm space-y-0.5">
                <p className="font-semibold">{fiche.societe.nom}{fiche.societe.id ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">Odoo #{fiche.societe.id}</span> : null}</p>
                {(fiche.societe.adresse || fiche.societe.ville) && (
                  <p className="text-xs text-muted-foreground">
                    {[fiche.societe.adresse, fiche.societe.adresse2].filter(Boolean).join(', ')}
                    {fiche.societe.codePostal || fiche.societe.ville ? ` — ${[fiche.societe.codePostal, fiche.societe.ville].filter(Boolean).join(' ')}` : ''}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {[
                    fiche.societe.telephone && `Tél. ${fiche.societe.telephone}`,
                    fiche.societe.email,
                    fiche.societe.tva && `TVA ${fiche.societe.tva}`,
                    fiche.societe.siret && `SIRET ${fiche.societe.siret}`,
                    fiche.societe.conditionsReglement && `Règlement : ${fiche.societe.conditionsReglement}`,
                  ].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>

              {existant && (
                <div className="flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1">Déjà dans MonCRM : <b>{existant.societe || existant.nom}</b>{existant.ville ? ` (${existant.ville})` : ''}</span>
                  {nouveau && (
                    <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setOuvert(false); onOuvrirExistant(existant); }}>
                      Ouvrir cette fiche
                    </Button>
                  )}
                </div>
              )}

              {proposes.length > 0 ? (
                <div>
                  <p className="text-xs font-medium mb-1">Contacts à reprendre</p>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {proposes.map(c => (
                      <label key={c.id} className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/40 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={coches.has(c.id)}
                          onChange={e => setCoches(prev => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(c.id); else n.delete(c.id);
                            return n;
                          })}
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{c.nom}</span>
                          {c.fonction && <span className="text-muted-foreground"> · {c.fonction}</span>}
                          <span className="block text-muted-foreground truncate">{[c.email, c.telephone, c.mobile].filter(Boolean).join(' · ') || '—'}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucun contact rattaché chez Odoo.</p>
              )}

              <Button type="button" size="sm" className="w-full" onClick={remplir}>
                {nouveau ? 'Remplir la fiche client' : 'Compléter les champs vides'}
                {coches.size > 0 ? ` (+ ${coches.size} contact${coches.size > 1 ? 's' : ''})` : ''}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
