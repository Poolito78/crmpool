import { useState, useRef, Fragment } from 'react';
import { type Devis, type Client, type Produit, calculerTotalLigne, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { Printer, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoIsofloor from '@/assets/logo-isofloor.png';
import { savePdfFromElement, getStoredDirHandle, writeFileToFolder } from '@/lib/pdfFolder';
import { toast } from 'sonner';

interface Props {
  devis: Devis;
  client?: Client;
  produits?: Produit[];
  onEdit?: () => void;
  hideControls?: boolean;
  initialShowConso?: boolean;
  initialShowRemise?: boolean;
  initialShowComposants?: boolean;
  onOptionsChange?: (opts: { showConso: boolean; showRemise: boolean; showComposants: boolean }) => void;
  onPrint?: () => void;
}

export default function DevisPreview({ devis, client, produits = [], onEdit, hideControls = false, initialShowConso = false, initialShowRemise = false, initialShowComposants = false, onOptionsChange, onPrint }: Props) {
  const [showConso, setShowConso] = useState(initialShowConso);
  const [showRemise, setShowRemise] = useState(initialShowRemise);
  const [showComposants, setShowComposants] = useState(initialShowComposants);
  const [printing, setPrinting] = useState(false);
  const [pdfMode, setPdfMode] = useState(false); // masque les inputs pendant la capture
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [surfaceGlobale, setSurfaceGlobale] = useState<number>(devis.surfaceGlobaleM2 || 0);
  // surfacesParLigne : overrides individuels seulement — {} par défaut → fallback sur surfaceGlobale
  const [surfacesParLigne, setSurfacesParLigne] = useState<Record<string, number>>({});

  function getSurfaceLigne(ligneId: string): number {
    return surfacesParLigne[ligneId] ?? surfaceGlobale;
  }
  function setSurface(ligneId: string, val: number) {
    setSurfacesParLigne(prev => ({ ...prev, [ligneId]: val }));
  }
  function updateSurfaceGlobale(val: number) {
    setSurfaceGlobale(val);
    setSurfacesParLigne({}); // réinitialise les overrides → toutes les lignes utilisent val
  }

  // Calcul des totaux avec les surfaces locales (pour recalcul qté si surface mode)
  const lignesEffectives = devis.lignes.map(l => {
    const surface = getSurfaceLigne(l.id);
    if (!showConso || !surface) return l;
    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
    // Pour les produits composites, ne pas recalculer la quantité depuis la surface
    const isComposite = !!(prod?.composants && prod.composants.length > 0);
    if (isComposite) return { ...l, surfaceM2: surface };
    const conso = l.consommation || prod?.consommation || 0;
    const poids = prod?.poids || 1;
    if (conso && poids) {
      const newQty = Math.round(surface * conso / poids * 100) / 100;
      return { ...l, surfaceM2: surface, quantite: newQty > 0 ? newQty : l.quantite };
    }
    return { ...l, surfaceM2: surface };
  });

  const totals = calculerTotalDevis(lignesEffectives, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);

  const poidsTotal = lignesEffectives.reduce((sum, l) => {
    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
    return sum + (prod?.poids || 0) * l.quantite;
  }, 0);

  async function handlePrint() {
    if (!printAreaRef.current) return;
    setPrinting(true);

    // 1. Passer en mode PDF (remplace les inputs par du texte brut)
    setPdfMode(true);

    // 2. Attendre que React re-rende sans les inputs
    await new Promise(resolve => setTimeout(resolve, 80));

    try {
      const fileName = `Devis_${devis.numero}.pdf`;
      const res = await savePdfFromElement(printAreaRef.current, fileName);
      if (res.ok) {
        toast.success(`PDF sauvegardé dans "${res.folderName}"`, { description: fileName, duration: 6000 });
      } else {
        toast.success('PDF téléchargé', { description: fileName, duration: 6000 });
      }
      if (onPrint) onPrint();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      // 3. Restaurer l'affichage normal
      setPdfMode(false);
      setPrinting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* Barre de contrôles — masquée pour la génération PDF */}
      {!hideControls && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card print:hidden flex-wrap sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-wrap flex-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input type="checkbox" checked={showConso} onChange={e => { setShowConso(e.target.checked); onOptionsChange?.({ showConso: e.target.checked, showRemise, showComposants }); }} className="rounded" />
              m²/conso
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input type="checkbox" checked={showRemise} onChange={e => { setShowRemise(e.target.checked); onOptionsChange?.({ showConso, showRemise: e.target.checked, showComposants }); }} className="rounded" />
              Remise
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input type="checkbox" checked={showComposants} onChange={e => { setShowComposants(e.target.checked); onOptionsChange?.({ showConso, showRemise, showComposants: e.target.checked }); }} className="rounded" />
              Composants
            </label>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Modifier
              </Button>
            )}
            <Button size="sm" onClick={handlePrint} disabled={printing}>
              {printing
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Génération…</>
                : <><Printer className="w-3.5 h-3.5 mr-1.5" /> PDF</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* Zone de défilement du document */}
      <div className="overflow-auto bg-muted/40 print:bg-transparent p-4 md:p-8 flex-1">
      {/* Devis document — effet page A4 */}
      <div className="bg-white dark:bg-card shadow-lg rounded-sm mx-auto print:shadow-none print:rounded-none"
           style={{ width: '100%', maxWidth: '794px' }}>
      <div className="px-10 py-10 text-sm" id="devis-print" ref={printAreaRef}>
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <img src={logoIsofloor} alt="ISOFLOOR" className="h-11 mb-2" />
            <p className="text-muted-foreground text-xs">ZA DU MONAY</p>
            <p className="text-muted-foreground text-xs">71210 SAINT-EUSEBE</p>
            <p className="text-muted-foreground text-xs">Tél : 03 85 77 07 25</p>
            <p className="text-muted-foreground text-xs">Mail : contact@isofloor.fr</p>
          </div>
          <div className="text-right">
            <h1 className="font-heading text-3xl font-bold tracking-tight">DEVIS</h1>
            <p className="text-lg font-semibold text-primary mt-1">{devis.numero}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adresse de facturation</p>
            <p className="font-semibold">{client?.nom || '—'}</p>
            {client?.societe && <p className="text-muted-foreground">{client.societe}</p>}
            {client && <p className="text-muted-foreground">{client.adresse}</p>}
            {client && <p className="text-muted-foreground">{client.codePostal} {client.ville}</p>}
            {client?.email && <p className="text-muted-foreground">{client.email}</p>}
          </div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adresse de livraison</p>
            {(() => {
              const adresseLivraison = devis.adresseLivraisonId
                ? client?.adressesLivraison?.find(a => a.id === devis.adresseLivraisonId)
                : null;
              if (adresseLivraison) {
                return (
                  <>
                    <p className="font-semibold">{adresseLivraison.libelle}</p>
                    <p className="text-muted-foreground">{adresseLivraison.adresse}</p>
                    <p className="text-muted-foreground">{adresseLivraison.codePostal} {adresseLivraison.ville}</p>
                    {adresseLivraison.contact && <p className="text-muted-foreground">Contact : {adresseLivraison.contact}</p>}
                    {adresseLivraison.telephone && <p className="text-muted-foreground">Tél : {adresseLivraison.telephone}</p>}
                  </>
                );
              }
              return (
                <>
                  <p className="font-semibold">{client?.nom || '—'}</p>
                  {client?.societe && <p className="text-muted-foreground">{client.societe}</p>}
                  {client && <p className="text-muted-foreground">{client.adresse}</p>}
                  {client && <p className="text-muted-foreground">{client.codePostal} {client.ville}</p>}
                  <p className="text-xs text-muted-foreground italic mt-1">Identique à l'adresse de facturation</p>
                </>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div></div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Informations</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Date :</span><span>{formatDate(devis.dateCreation)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Validité :</span><span>{formatDate(devis.dateValidite)}</span></div>
              {devis.dateEnvoi && <div className="flex justify-between"><span className="text-muted-foreground">Envoyé le :</span><span>{formatDate(devis.dateEnvoi)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Statut :</span><span className="font-medium capitalize">{devis.statut}</span></div>
              {devis.referenceAffaire && <div className="flex justify-between"><span className="text-muted-foreground">Réf. affaire :</span><span className="font-medium">{devis.referenceAffaire}</span></div>}
              {devis.surfaceGlobaleM2 && devis.surfaceGlobaleM2 > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Surface :</span><span className="font-medium">{devis.surfaceGlobaleM2} m²</span></div>
              )}
            </div>
          </div>
        </div>

        {devis.notes && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Objet</p>
            <p>{devis.notes}</p>
          </div>
        )}

        {/* Table */}
        {showConso ? (() => {
          // ── Pré-calcul données composants pour toutes les lignes ──
          type CompData = {
            comp: typeof devis.lignes[0] extends { id: string } ? any : any;
            compProd: typeof produits[0] | undefined;
            consoComp: number;
            totalKgComp: number | null;
            unitesComp: number | null;
            condKgComp: number | null;
            prixUnite: number;
            prixKg: number | null;
            totalHTComp: number;
          };
          type LineData = {
            l: typeof lignesEffectives[0];
            prod: typeof produits[0] | null | undefined;
            conso: number;
            t: ReturnType<typeof calculerTotalLigne>;
            compDatas: CompData[];
            isComposite: boolean;
          };

          const allLines: LineData[] = lignesEffectives.map(l => {
            const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
            const conso = l.consommation || prod?.consommation || 0;
            const t = calculerTotalLigne(l);
            const composants = prod?.composants;
            const isComposite = !!(composants && composants.length > 0);

            // Passe 1 : kg/m² des composants directs (non-%)
            // Formule : quantite_unités × poids_composant / poids_parent × conso_parent
            const poidsParent = prod?.poids || 0;
            const compBase = isComposite ? composants!.map(comp => {
              const compProd = produits.find(p => p.id === comp.produitId);
              const poidsC = compProd?.poids || 0;
              const consoCompDirect = poidsParent > 0 && poidsC > 0 && conso > 0
                ? Math.round(comp.quantite * poidsC / poidsParent * conso * 10000) / 10000
                : comp.quantite;
              return { comp, compProd, consoComp: consoCompDirect };
            }) : [];

            // Passe 2 : kg/m² des composants en % (base_kg/m² × pct/100)
            const surfaceLigneCalc = getSurfaceLigne(l.id) || 0;
            const compDatas: CompData[] = compBase.map(({ comp, compProd, consoComp }) => {
              let finalConsoComp = consoComp;
              if (comp.consommationPct != null && comp.baseComposantId) {
                const base = compBase.find(c => c.comp.produitId === comp.baseComposantId);
                if (base) finalConsoComp = Math.round(base.consoComp * comp.consommationPct / 100 * 10000) / 10000 || 0.0001;
              }
              const totalKgComp = surfaceLigneCalc > 0
                ? Math.round(surfaceLigneCalc * finalConsoComp * 1000) / 1000 : null;
              const poidsC = compProd?.poids || null;
              const unitesComp = totalKgComp != null && poidsC ? Math.ceil(totalKgComp / poidsC) : null;
              const condKgComp = unitesComp != null && poidsC ? Math.round(unitesComp * poidsC * 10) / 10 : null;
              const prixUnite = compProd?.prixRevendeur || compProd?.prixHT || 0;
              const prixKg = poidsC && prixUnite ? Math.round(prixUnite / poidsC * 100) / 100 : null;
              const totalHTComp = unitesComp != null ? unitesComp * prixUnite : 0;
              return { comp, compProd, consoComp: finalConsoComp, totalKgComp, unitesComp, condKgComp, prixUnite, prixKg, totalHTComp };
            });

            // Si produit composite sans consommation globale renseignée → somme des composants
            const consoEffective = isComposite && conso === 0
              ? Math.round(compDatas.reduce((s, c) => s + c.consoComp, 0) * 10000) / 10000
              : conso;
            return { l, prod, conso: consoEffective, t, compDatas, isComposite };
          });

          // ── Totaux ligne récapitulatif ──
          let sumConsoKgM2 = 0, sumTotalKg = 0, sumCondKg = 0, sumCoutConsoHT = 0;
          for (const { conso, isComposite, compDatas, prod, l } of allLines) {
            if (isComposite) {
              if (conso > 0) sumConsoKgM2 += conso;
              // Total KG conditionné = Math.ceil(conso estimée / poids) × poids (cohérent avec la ligne)
              const poidsParentRecap = prod?.poids || 0;
              const totalKgConsoRecap = conso > 0 && surfaceGlobale > 0 ? surfaceGlobale * conso : 0;
              if (poidsParentRecap > 0 && totalKgConsoRecap > 0) {
                const unitesRecap = Math.ceil(totalKgConsoRecap / poidsParentRecap);
                sumCondKg += Math.round(unitesRecap * poidsParentRecap * 10) / 10;
              }
              for (const { totalKgComp, prixKg } of compDatas) {
                // coût conso = total KG estimé × prix/kg
                if (totalKgComp != null && prixKg != null) sumCoutConsoHT += totalKgComp * prixKg;
              }
            } else if (conso > 0) {
              sumConsoKgM2 += conso;
              const poidsP = prod?.poids || null;
              const prixKgP = poidsP && l.prixUnitaireHT ? l.prixUnitaireHT * (1 - l.remise / 100) / poidsP : null;
              const totalKgP = surfaceGlobale > 0 ? surfaceGlobale * conso : null;
              if (totalKgP != null && prixKgP != null) sumCoutConsoHT += totalKgP * prixKgP;
            }
          }
          sumTotalKg = surfaceGlobale > 0 ? Math.round(surfaceGlobale * sumConsoKgM2 * 100) / 100 : 0;
          const coutChantierM2 = surfaceGlobale > 0 && sumCoutConsoHT > 0
            ? Math.round(sumCoutConsoHT / surfaceGlobale * 100) / 100 : null;

          return (
            <table className="w-full mb-6 text-xs border-collapse">
              <thead>
                {/* Ligne 1 : groupes */}
                <tr className="bg-[#CC0000] text-white">
                  <th rowSpan={2} className="text-left py-2 px-2 font-bold uppercase text-xs align-bottom border-r border-white/20">
                    Désignation
                    {/* lien site */}
                    <span className="block text-[10px] font-normal italic text-primary-foreground/70">Fiches système / Produit : www.isofloor.fr</span>
                  </th>
                  <th colSpan={2} className="py-1 text-center font-bold text-xs border-l border-white/20">Conso. Estimée</th>
                  <th colSpan={3} className="py-1 text-center font-bold text-xs border-l border-white/20">Conditionnement</th>
                  <th colSpan={3} className="py-1 text-center font-bold text-xs border-l border-white/20">Prix</th>
                </tr>
                {/* Ligne 2 : sous-colonnes */}
                <tr className="bg-[#CC0000] text-white text-xs">
                  <th className="py-1 px-1 text-right border-l border-white/20 w-14">kg/m²</th>
                  <th className="py-1 px-1 text-right w-16">Total KG</th>
                  <th className="py-1 px-1 text-right border-l border-white/20 w-12">kg</th>
                  <th className="py-1 px-1 text-right w-12">Unité</th>
                  <th className="py-1 px-1 text-right w-16">Total KG</th>
                  <th className="py-1 px-1 text-right border-l border-white/20 w-20">Unité</th>
                  <th className="py-1 px-1 text-right w-16">(Kg)</th>
                  <th className="py-1 px-1 text-right w-20">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {/* Ligne récapitulatif surface + totaux */}
                <tr className="bg-muted/50 border-b-2 border-[#CC0000] text-xs italic font-medium">
                  <td />
                  <td className="py-1.5 px-1 text-right">{sumConsoKgM2 > 0 ? sumConsoKgM2.toFixed(3) : '—'}</td>
                  <td className="py-1.5 px-1 text-right">{sumTotalKg > 0 ? sumTotalKg.toFixed(2) : '—'}</td>
                  <td /><td />
                  <td className="py-1.5 px-1 text-right">{sumCondKg > 0 ? sumCondKg.toFixed(1) : '—'}</td>
                  <td colSpan={3} className="py-1.5 px-1 text-right font-bold text-[#CC0000] not-italic whitespace-nowrap">
                    {coutChantierM2 != null ? `Coût chantier : ${coutChantierM2.toFixed(2)} €/m²` : ''}
                  </td>
                </tr>

                {/* Lignes produits */}
                {allLines.map(({ l, prod, conso, t, compDatas, isComposite }) => (
                  <Fragment key={l.id}>
                    {/* Ligne produit principal */}
                    <tr className="border-b border-border/60">
                      <td className="py-1.5 px-2 font-medium">
                        {l.description}
                        {(hideControls || pdfMode) ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {getSurfaceLigne(l.id) > 0 ? `${getSurfaceLigne(l.id)} m²` : ''}
                          </span>
                        ) : (
                          <span className="ml-2 print:hidden">
                            <input
                              type="number" min={0} step={1}
                              value={getSurfaceLigne(l.id) || ''}
                              onChange={e => setSurface(l.id, parseFloat(e.target.value) || 0)}
                              className="w-12 text-right border border-border rounded px-1 py-0 text-xs font-normal text-foreground bg-background"
                              placeholder="m²"
                            />
                            <span className="text-xs text-muted-foreground ml-0.5">m²</span>
                          </span>
                        )}
                      </td>
                      {isComposite ? (() => {
                        const surfaceLigne = getSurfaceLigne(l.id) || 0;
                        const totalKgConso = conso > 0 && surfaceLigne > 0 ? Math.round(surfaceLigne * conso * 100) / 100 : null;
                        const poidsComp = prod?.poids || null;
                        // Conditionnement basé sur la conso estimée (s'adapte à la surface)
                        const unitesComp = totalKgConso != null && poidsComp ? Math.ceil(totalKgConso / poidsComp) : null;
                        const condKgComp = unitesComp != null && poidsComp ? Math.round(unitesComp * poidsComp * 10) / 10 : null;
                        const prixKgComp = poidsComp && l.prixUnitaireHT ? Math.round(l.prixUnitaireHT * (1 - l.remise / 100) / poidsComp * 100) / 100 : null;
                        return (
                          <>
                            <td className="py-1.5 px-1 text-right font-medium">{conso > 0 ? conso.toFixed(3) : '—'}</td>
                            <td className="py-1.5 px-1 text-right">{totalKgConso != null ? totalKgConso.toFixed(2) : '—'}</td>
                            <td className="py-1.5 px-1 text-right">{poidsComp ?? '—'}</td>
                            <td className="py-1.5 px-1 text-right font-semibold text-primary">{unitesComp ?? '—'}</td>
                            <td className="py-1.5 px-1 text-right">{condKgComp ?? '—'}</td>
                            <td className="py-1.5 px-1 text-right">{formatMontant(l.prixUnitaireHT * (1 - l.remise / 100))}</td>
                            <td className="py-1.5 px-1 text-right text-muted-foreground">({prixKgComp != null ? formatMontant(prixKgComp) : '—'})</td>
                            <td className="py-1.5 px-1 text-right font-bold">{formatMontant(t.totalHT)}</td>
                          </>
                        );
                      })() : (() => {
                        // Produit simple avec conso
                        const kg = conso > 0 && surfaceGlobale > 0 ? Math.round(surfaceGlobale * conso * 1000) / 1000 : null;
                        const poidsC = prod?.poids || null;
                        const unites = kg != null && poidsC ? Math.ceil(kg / poidsC) : null;
                        const condKg = unites != null && poidsC ? unites * poidsC : null;
                        const prixKg = poidsC && l.prixUnitaireHT ? Math.round(l.prixUnitaireHT * (1 - l.remise / 100) / poidsC * 100) / 100 : null;
                        return (
                          <>
                            <td className="py-1.5 px-1 text-right">{conso > 0 ? conso : '—'}</td>
                            <td className="py-1.5 px-1 text-right">{kg ?? '—'}</td>
                            <td className="py-1.5 px-1 text-right">{poidsC ?? '—'}</td>
                            <td className="py-1.5 px-1 text-right font-semibold text-primary">{unites ?? '—'}</td>
                            <td className="py-1.5 px-1 text-right">{condKg ?? '—'}</td>
                            <td className="py-1.5 px-1 text-right">{formatMontant(l.prixUnitaireHT * (1 - l.remise / 100))}</td>
                            <td className="py-1.5 px-1 text-right text-muted-foreground">({prixKg != null ? formatMontant(prixKg) : '—'})</td>
                            <td className="py-1.5 px-1 text-right font-bold">{formatMontant(t.totalHT)}</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* Sous-lignes composants */}
                    {showComposants && compDatas.map(({ comp, compProd, consoComp, totalKgComp, unitesComp, condKgComp, prixUnite, prixKg, totalHTComp }) =>
                      compProd ? (
                        <tr key={`${l.id}-${comp.produitId}`} className="border-b border-border/30 text-muted-foreground">
                          <td className="py-1 px-2 pl-8">
                            {comp.consommationPct != null && (
                              <span className="text-xs font-semibold text-foreground mr-2">{comp.consommationPct}%</span>
                            )}
                            {compProd.description}
                            {compProd.poids ? <span className="ml-1 text-muted-foreground/60 text-[10px]">({compProd.poids} kg)</span> : null}
                          </td>
                          <td className="py-1 px-1 text-right">{consoComp ?? '—'}</td>
                          <td className="py-1 px-1 text-right">{totalKgComp ?? '—'}</td>
                          <td className="py-1 px-1 text-right">{compProd.poids ?? '—'}</td>
                          <td className="py-1 px-1 text-right font-semibold text-primary">{unitesComp ?? '—'}</td>
                          <td className="py-1 px-1 text-right">{condKgComp ?? '—'}</td>
                          <td className="py-1 px-1 text-right text-foreground">{formatMontant(prixUnite)}</td>
                          <td className="py-1 px-1 text-right">({prixKg != null ? formatMontant(prixKg) : '—'})</td>
                          <td className="py-1 px-1 text-right font-semibold text-foreground">{formatMontant(totalHTComp)}</td>
                        </tr>
                      ) : null
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          );
        })() : (
          /* Table simple (sans mode conso) */
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-[#CC0000]">
                <th className="text-left py-2 font-semibold">Description</th>
                <th className="text-right py-2 font-semibold w-16">Qté</th>
                <th className="text-center py-2 font-semibold w-16">Unité</th>
                {showRemise && <th className="text-right py-2 font-semibold w-24">P.U. HT</th>}
                {showRemise && <th className="text-right py-2 font-semibold w-16">Rem.</th>}
                <th className="text-right py-2 font-semibold w-24">P.U. net HT</th>
                <th className="text-right py-2 font-semibold w-28">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {lignesEffectives.map(l => {
                const t = calculerTotalLigne(l);
                const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                const composants = prod?.composants;
                return (
                  <Fragment key={l.id}>
                    <tr className="border-b border-border">
                      <td className="py-2">
                        {l.description}
                        {prod?.descriptionDetaillee && <p className="text-xs text-muted-foreground mt-0.5">{prod.descriptionDetaillee}</p>}
                      </td>
                      <td className="py-2 text-right">{l.quantite}</td>
                      <td className="py-2 text-center">{l.unite || '—'}</td>
                      {showRemise && <td className="py-2 text-right">{formatMontant(l.prixUnitaireHT)}</td>}
                      {showRemise && <td className="py-2 text-right">{l.remise > 0 ? `${l.remise}%` : '—'}</td>}
                      <td className="py-2 text-right">{formatMontant(l.prixUnitaireHT * (1 - l.remise / 100))}</td>
                      <td className="py-2 text-right font-medium">{formatMontant(t.totalHT)}</td>
                    </tr>
                    {showComposants && composants && composants.length > 0 && composants.map(comp => {
                      const compProd = produits.find(p => p.id === comp.produitId);
                      if (!compProd) return null;
                      return (
                        <tr key={`${l.id}-${comp.produitId}`} className="bg-muted/20 text-muted-foreground text-xs">
                          <td className="py-1 pl-8 italic">↳ <span className="font-mono">{compProd.reference}</span> — {compProd.description}</td>
                          <td className="py-1 text-right">{Math.round(comp.quantite * l.quantite * 1000) / 1000}</td>
                          <td className="py-1 text-center">{compProd.unite || '—'}</td>
                          <td colSpan={showRemise ? 3 : 2} />
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="flex justify-between items-end mb-8">
          {poidsTotal > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Poids total :</span> {poidsTotal % 1 === 0 ? poidsTotal : poidsTotal.toFixed(2)} kg
            </div>
          )}
          <div className="w-64 space-y-1 ml-auto">
            <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span>{formatMontant(totals.totalHT)}</span></div>
            {(devis.fraisPortHT || 0) > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">dont frais de port HT</span><span>{formatMontant(devis.fraisPortHT!)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Total TVA</span><span>{formatMontant(totals.totalTVA)}</span></div>
            <div className="flex justify-between border-t-2 border-primary pt-2 mt-2">
              <span className="font-bold text-lg">Total TTC</span>
              <span className="font-heading font-bold text-lg">{formatMontant(totals.totalTTC)}</span>
            </div>
          </div>
        </div>

        {/* Conditions */}
        {devis.conditions && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Conditions</p>
            <p className="text-muted-foreground text-xs">{devis.conditions}</p>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8">
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Signature du client</p>
            <p className="text-xs text-muted-foreground mt-1">Bon pour accord, date et signature</p>
            <div className="h-20"></div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Cachet de l'entreprise</p>
            <div className="h-20"></div>
          </div>
        </div>
      </div>{/* fin printAreaRef */}
      </div>{/* fin page A4 */}
      </div>{/* fin zone défilement */}
    </div>
  );
}
