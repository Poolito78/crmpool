import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ProduitCombobox from '@/components/ProduitCombobox';
import { designationProduit, formatMontant, getPrixPourQuantite, type Produit } from '@/lib/store';
import { produitParId, produitParReference } from '@/lib/indexProduits';
import {
  oublierPrix, prixDuClient, referencePrixClient, retenirPrix, useMemoirePrix, type PrixAppris,
} from '@/lib/memoirePrix';

/**
 * « Prix spécifiques » de l'onglet Tarifs de la fiche client.
 *
 * Un article, un prix convenu avec CE client : le devis le reprend avant le
 * niveau de tarif, la remise de gamme et le palier (`prixDeBase`). Les prix
 * appris d'une offre Odoo (`memoirePrix.ts`) s'y montrent aussi, avec leur
 * offre d'origine — les corriger ici en fait des prix saisis.
 *
 * Écrit en base AUSSITÔT, comme les identifiants du tarif en ligne : la
 * table n'est pas un champ de la fiche, « Annuler » ne la défait pas. D'où
 * l'exigence d'une fiche déjà enregistrée.
 */
export default function PrixSpecifiquesClient({ clientId, produits, estRevendeur, voirAchat }: {
  clientId?: string;
  produits: Produit[];
  estRevendeur?: boolean;
  voirAchat?: boolean;
}) {
  const version = useMemoirePrix();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liste = useMemo(() => prixDuClient(clientId), [clientId, version]);
  const [produitId, setProduitId] = useState('');
  const [prixSaisi, setPrixSaisi] = useState('');
  const [enCours, setEnCours] = useState(false);
  /* Saisie en cours dans une ligne : écrite en quittant le champ. */
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});

  const choisi = produitParId(produits, produitId);
  const prixFiche = (p: Produit) => {
    const palier = getPrixPourQuantite(p, 1);
    return estRevendeur && palier.prixRevendeur > 0 ? palier.prixRevendeur : palier.prixHT;
  };

  const lirePrix = (v: string) => {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
  };

  const enregistrer = async (reference: string, prix: number) => {
    if (!clientId) return false;
    const erreur = await retenirPrix(clientId, [{ reference, prix }]);
    if (erreur) { toast.error(`Prix non enregistré : ${erreur}`); return false; }
    return true;
  };

  const ajouter = async () => {
    if (!choisi) return;
    const reference = referencePrixClient(choisi);
    if (!reference) { toast.error('Cet article n\'a pas de référence : impossible de lui attacher un prix.'); return; }
    const prix = lirePrix(prixSaisi);
    if (prix === null) { toast.error('Prix invalide.'); return; }
    setEnCours(true);
    const ok = await enregistrer(reference, prix);
    setEnCours(false);
    if (!ok) return;
    toast.success(`${designationProduit(choisi)} : ${formatMontant(prix)} HT pour ce client.`);
    setProduitId('');
    setPrixSaisi('');
  };

  const modifier = async (ligne: PrixAppris) => {
    const brut = brouillons[ligne.reference];
    if (brut === undefined) return;
    setBrouillons(prev => { const n = { ...prev }; delete n[ligne.reference]; return n; });
    const prix = lirePrix(brut);
    if (prix === null) { toast.error('Prix invalide.'); return; }
    if (prix === ligne.prix) return;
    await enregistrer(ligne.reference, prix);
  };

  const supprimer = async (ligne: PrixAppris) => {
    if (!clientId) return;
    const erreur = await oublierPrix(clientId, ligne.reference);
    if (erreur) toast.error(`Suppression refusée : ${erreur}`);
  };

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div>
        <h3 className="text-base font-semibold">Prix spécifiques</h3>
        <p className="text-xs text-muted-foreground">
          Prix HT convenu avec ce client pour un article : il passe dans ses devis avant le niveau de tarif, les remises et les paliers.
          Enregistré aussitôt ; les devis déjà établis gardent leurs prix.
        </p>
      </div>

      {!clientId ? (
        <p className="text-xs text-amber-600">Enregistrez d'abord la fiche pour lui attacher des prix.</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 min-w-0">
              <ProduitCombobox
                produits={produits}
                value={produitId}
                onSelect={id => {
                  setProduitId(id);
                  const p = produitParId(produits, id);
                  if (p) setPrixSaisi(String(prixFiche(p)));
                }}
              />
            </div>
            <Input
              className="h-9 w-full sm:w-32 text-right"
              inputMode="decimal"
              placeholder="Prix HT"
              value={prixSaisi}
              onChange={e => setPrixSaisi(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ajouter(); } }}
            />
            <Button type="button" size="sm" className="h-9" disabled={!choisi || !prixSaisi.trim() || enCours} onClick={() => void ajouter()}>
              {enCours ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Ajouter
            </Button>
          </div>
          {choisi && (
            <p className="text-xs text-muted-foreground">
              Prix fiche {estRevendeur ? 'revendeur' : 'public'} : {formatMontant(prixFiche(choisi))}
              {voirAchat && choisi.prixAchat > 0 && <> · achat {formatMontant(choisi.prixAchat)}</>}
              {liste.some(l => l.reference === referencePrixClient(choisi)) && (
                <span className="text-amber-600"> · déjà un prix pour cet article : il sera remplacé</span>
              )}
            </p>
          )}

          {liste.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucun prix spécifique pour ce client.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Article</th>
                    <th className="text-right font-medium px-3 py-2 whitespace-nowrap">Prix fiche</th>
                    {voirAchat && <th className="text-right font-medium px-3 py-2">Achat</th>}
                    <th className="text-right font-medium px-3 py-2 whitespace-nowrap">Prix client HT</th>
                    <th className="text-left font-medium px-3 py-2">Origine</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {liste.map(l => {
                    const p = produitParReference(produits, l.reference);
                    const fiche = p ? prixFiche(p) : undefined;
                    const marge = voirAchat && p && p.prixAchat > 0 && l.prix > 0
                      ? (l.prix - p.prixAchat) / l.prix * 100 : undefined;
                    return (
                      <tr key={l.reference} className="border-t border-border">
                        <td className="px-3 py-1.5 min-w-[200px]">
                          <div className="font-medium">{p ? designationProduit(p) : <span className="text-amber-600">Article introuvable au catalogue</span>}</div>
                          <div className="text-xs text-muted-foreground font-mono">{l.reference}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap text-muted-foreground">
                          {fiche !== undefined ? formatMontant(fiche) : '—'}
                        </td>
                        {voirAchat && (
                          <td className="px-3 py-1.5 text-right whitespace-nowrap text-muted-foreground">
                            {p && p.prixAchat > 0 ? formatMontant(p.prixAchat) : '—'}
                            {marge !== undefined && (
                              <div className={`text-xs ${marge < 0 ? 'text-destructive' : ''}`}>marge {marge.toFixed(0)} %</div>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-right">
                          <Input
                            className="h-7 w-28 text-right ml-auto"
                            inputMode="decimal"
                            value={brouillons[l.reference] ?? String(l.prix)}
                            onChange={e => setBrouillons(prev => ({ ...prev, [l.reference]: e.target.value }))}
                            onBlur={() => void modifier(l)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                          {l.numeroOffre ? `appris de ${l.numeroOffre}` : 'saisi'} · {new Date(l.updatedAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-2 py-1.5">
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Retirer ce prix" onClick={() => void supprimer(l)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
