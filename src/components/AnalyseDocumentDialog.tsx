import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScanText, Upload, Loader2, CheckCircle2, AlertTriangle, FileText, X, PlusCircle, Package, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { analyserDocument, type DocumentAnalysis, type TypeDocument, TYPE_LABELS } from '@/lib/analyseDocument';
import { useCRM } from '@/lib/StoreContext';
import {
  type CommandeFournisseur, type LigneReception, type CommandeClient,
  generateId, calculerDateEcheance,
} from '@/lib/store';
import ReceptionCommandeDialog from '@/components/ReceptionCommandeDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const today = () => new Date().toISOString().split('T')[0];
const nextYear = () => new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

export default function AnalyseDocumentDialog({ open, onOpenChange }: Props) {
  const {
    commandesFournisseur, fournisseurs, produits, clients,
    updateCommandesFournisseur, updateCommandesClient,
  } = useCRM();

  /* ── état analyse ── */
  const [texte, setTexte] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DocumentAnalysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  /* ── état commande fournisseur ── */
  const [matchedCF, setMatchedCF] = useState<CommandeFournisseur | null>(null);
  const [receptionOpen, setReceptionOpen] = useState(false);
  const [showCreerCF, setShowCreerCF] = useState(false);
  const [creerCFFournisseurId, setCreerCFFournisseurId] = useState('');
  const [creerCFNumero, setCreerCFNumero] = useState('');
  const [creerCFDateReception, setCreerCFDateReception] = useState('');
  const [creerCFDateLivraison, setCreerCFDateLivraison] = useState('');
  const [creerCFNotes, setCreerCFNotes] = useState('');

  /* ── état commande client / devis ── */
  const [showCreerCC, setShowCreerCC] = useState(false);
  const [creerCCClientId, setCreerCCClientId] = useState('');
  const [creerCCNumero, setCreerCCNumero] = useState('');
  const [creerCCDate, setCreerCCDate] = useState('');
  const [creerCCDateLivraison, setCreerCCDateLivraison] = useState('');
  const [creerCCNotes, setCreerCCNotes] = useState('');

  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;

  /* ── helpers ── */
  const isFournisseurDoc = (t?: TypeDocument) =>
    t === 'commande_fournisseur' || t === 'bon_livraison' || t === 'facture_fournisseur';
  const isClientDoc = (t?: TypeDocument) =>
    t === 'commande_client' || t === 'devis_client' || t === 'facture_client';

  /* ── pré-remplissage formulaire CF ── */
  useEffect(() => {
    if (!result || matchedCF || !isFournisseurDoc(result.typeDocument)) return;
    const year = new Date().getFullYear();
    const nextNum = String(commandesFournisseur.length + 1).padStart(3, '0');
    const foundFourn = result.nomPartenaire
      ? fournisseurs.find(f =>
          f.societe?.toLowerCase().includes(result.nomPartenaire!.toLowerCase()) ||
          result.nomPartenaire!.toLowerCase().includes(f.societe?.toLowerCase() ?? ''))
      : undefined;
    setCreerCFFournisseurId(foundFourn?.id ?? '');
    setCreerCFNumero(result.numeroDocument || `CF-${year}-${nextNum}`);
    setCreerCFDateReception(result.dateDocument || today());
    setCreerCFDateLivraison(result.dateLivraisonPrevue || '');
    setCreerCFNotes(result.referencePartenaire ? `Réf. fournisseur : ${result.referencePartenaire}` : '');
  }, [result, matchedCF]);

  /* ── pré-remplissage formulaire CC ── */
  useEffect(() => {
    if (!result || !isClientDoc(result.typeDocument)) return;
    const year = new Date().getFullYear();
    const nextNum = String((commandesFournisseur.length + 1)).padStart(3, '0');
    const foundClient = result.nomPartenaire
      ? clients.find(c =>
          c.nom?.toLowerCase().includes(result.nomPartenaire!.toLowerCase()) ||
          c.societe?.toLowerCase().includes(result.nomPartenaire!.toLowerCase()) ||
          result.nomPartenaire!.toLowerCase().includes(c.nom?.toLowerCase() ?? '') ||
          result.nomPartenaire!.toLowerCase().includes(c.societe?.toLowerCase() ?? ''))
      : undefined;
    setCreerCCClientId(foundClient?.id ?? '');
    setCreerCCNumero(result.numeroDocument || `CC-${year}-${nextNum}`);
    setCreerCCDate(result.dateDocument || today());
    setCreerCCDateLivraison(result.dateLivraisonPrevue || '');
    setCreerCCNotes(result.notes || result.referencePartenaire || '');
  }, [result]);

  /* ── drag & drop ── */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.type === 'application/pdf') { setFichier(f); setMode('pdf'); }
    else if (f) toast.error('Seuls les fichiers PDF sont acceptés');
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); }, []);

  function reset() {
    setTexte(''); setFichier(null); setResult(null); setMatchedCF(null); setDragging(false);
    setReceptionOpen(false); setShowCreerCF(false); setShowCreerCC(false);
    setCreerCFFournisseurId(''); setCreerCFNumero(''); setCreerCFDateReception('');
    setCreerCFDateLivraison(''); setCreerCFNotes('');
    setCreerCCClientId(''); setCreerCCNumero(''); setCreerCCDate('');
    setCreerCCDateLivraison(''); setCreerCCNotes('');
  }

  /* ── analyse ── */
  async function handleAnalyse() {
    if (!apiKey) { toast.error('Clé API Groq manquante (VITE_GROQ_API_KEY)'); return; }
    setLoading(true); setResult(null); setMatchedCF(null); setShowCreerCF(false); setShowCreerCC(false);
    try {
      let analysis: DocumentAnalysis;
      // PDF prioritaire, sinon texte
      if (fichier) {
        analysis = await analyserDocument({ type: 'pdf', buffer: await fichier.arrayBuffer() }, apiKey);
      } else if (texte.trim()) {
        analysis = await analyserDocument({ type: 'text', texte }, apiKey);
      } else {
        toast.error('Glissez un PDF ou collez du texte'); return;
      }
      setResult(analysis);

      // Tenter de matcher une commande fournisseur
      if (isFournisseurDoc(analysis.typeDocument) && analysis.numeroDocument) {
        const match = commandesFournisseur.find(cf =>
          cf.numero.toLowerCase().includes(analysis.numeroDocument!.toLowerCase()) ||
          analysis.numeroDocument!.toLowerCase().includes(cf.numero.toLowerCase())
        );
        if (match) { setMatchedCF(match); toast.success(`Commande fournisseur ${match.numero} trouvée`); }
        else toast.info('Aucune commande fournisseur correspondante — vous pouvez la créer');
      } else {
        toast.success(`Document analysé : ${TYPE_LABELS[analysis.typeDocument]?.label}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  }

  /* ── réception commande fournisseur existante ── */
  function handleReception(data: { dateReception: string; dateLivraisonClientPrevue: string; dateEcheance: string; lignesRecues: LigneReception[] }) {
    if (!matchedCF) return;
    updateCommandesFournisseur(prev =>
      prev.map(cf => cf.id === matchedCF.id ? { ...cf, statut: 'recue' as const, ...data } : cf)
    );
    setReceptionOpen(false);
    toast.success('Réception enregistrée');
    onOpenChange(false);
  }

  /* ── créer nouvelle commande fournisseur reçue ── */
  function handleCreerCF() {
    if (!creerCFFournisseurId) { toast.error('Veuillez sélectionner un fournisseur'); return; }
    if (!creerCFNumero.trim()) { toast.error('Veuillez saisir un numéro de commande'); return; }
    if (!creerCFDateReception) { toast.error('Veuillez saisir la date de réception'); return; }
    const fourn = fournisseurs.find(f => f.id === creerCFFournisseurId);
    const dateEch = calculerDateEcheance(creerCFDateReception, fourn?.delaiReglement || '45j FDM').toISOString().split('T')[0];
    const lignes = (result?.lignes ?? []).map(l => {
      const p = produits.find(p => p.reference?.toLowerCase() === l.reference?.toLowerCase());
      const id = p?.id ?? generateId();
      return { produitId: id, description: l.description || '', reference: l.reference || '', quantite: l.quantite, prixAchat: p?.prixAchat ?? l.prixUnitaireHT ?? 0, total: (p?.prixAchat ?? l.prixUnitaireHT ?? 0) * l.quantite };
    });
    const totalHT = result?.totalHT ?? lignes.reduce((s, l) => s + l.total, 0);
    const nouvelleCommande: CommandeFournisseur = {
      id: generateId(), fournisseurId: creerCFFournisseurId, numero: creerCFNumero.trim(),
      dateCreation: creerCFDateReception, statut: 'recue', lignes, totalHT, fraisTransport: 0, totalTTC: result?.totalTTC ?? totalHT,
      notes: creerCFNotes || undefined, dateReception: creerCFDateReception,
      dateLivraisonClientPrevue: creerCFDateLivraison || undefined, dateEcheance: dateEch,
      lignesRecues: lignes.map(l => ({ produitId: l.produitId, description: l.description, reference: l.reference, quantiteCommandee: l.quantite, quantiteRecue: l.quantite })),
    };
    updateCommandesFournisseur(prev => [nouvelleCommande, ...prev]);
    toast.success(`Commande ${creerCFNumero} créée et réceptionnée`);
    onOpenChange(false);
  }

  /* ── créer commande client ── */
  function handleCreerCC() {
    if (!creerCCClientId) { toast.error('Veuillez sélectionner un client'); return; }
    if (!creerCCNumero.trim()) { toast.error('Veuillez saisir un numéro'); return; }
    if (!creerCCDate) { toast.error('Veuillez saisir la date'); return; }
    const lignes = (result?.lignes ?? []).map(l => {
      const p = produits.find(p => p.reference?.toLowerCase() === l.reference?.toLowerCase());
      return {
        id: generateId(), produitId: p?.id, description: l.description || p?.description || '',
        quantite: l.quantite, unite: 'u', prixUnitaireHT: l.prixUnitaireHT ?? p?.prixVente ?? 0,
        tva: l.tva ?? 20, remise: 0,
      };
    });
    const totalHT = result?.totalHT ?? lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT, 0);
    const totalTVA = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT * l.tva / 100, 0);
    const nouvelleCC: CommandeClient = {
      id: generateId(), clientId: creerCCClientId, numero: creerCCNumero.trim(),
      dateCreation: creerCCDate, statut: 'a_traiter', lignes,
      totalHT, totalTVA, totalTTC: result?.totalTTC ?? totalHT + totalTVA, fraisPortHT: 0,
      dateLivraisonPrevue: creerCCDateLivraison || undefined,
      notes: creerCCNotes || undefined,
    };
    updateCommandesClient(prev => [nouvelleCC, ...prev]);
    toast.success(`Commande client ${creerCCNumero} créée`);
    onOpenChange(false);
  }

  /* ── quantités pré-remplies pour réception ── */
  function buildQuantitesRecues(): Record<string, number> {
    if (!matchedCF || !result) return {};
    const map: Record<string, number> = {};
    for (const ligne of matchedCF.lignes) {
      const al = result.lignes.find(l =>
        (l.reference && ligne.reference && l.reference.toLowerCase() === ligne.reference.toLowerCase()) ||
        (l.description && ligne.description && l.description.toLowerCase().includes(ligne.description.toLowerCase()))
      );
      if (al) map[ligne.produitId] = al.quantite;
    }
    return map;
  }

  const fournisseurMatch = matchedCF ? fournisseurs.find(f => f.id === matchedCF.fournisseurId) : undefined;
  const noMatchCF = result && isFournisseurDoc(result.typeDocument) && !matchedCF;
  const isCC = result && isClientDoc(result.typeDocument);
  const isFact = result && (result.typeDocument === 'facture_fournisseur' || result.typeDocument === 'facture_client');

  const typeMeta = result ? TYPE_LABELS[result.typeDocument] : null;

  /* ── correction manuelle du type ── */
  function handleChangeType(newType: TypeDocument) {
    setResult(prev => prev ? { ...prev, typeDocument: newType } : prev);
    setMatchedCF(null);
    setShowCreerCF(false);
    setShowCreerCC(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ScanText className="w-5 h-5 text-primary" />
              Analyse de document
            </DialogTitle>
          </DialogHeader>

          {/* ── Layout 2 colonnes sur desktop ── */}
          <div className="flex flex-col md:flex-row gap-0 flex-1 min-h-0 pt-2">

            {/* ══ COLONNE GAUCHE : zone unifiée PDF + texte ══ */}
            <div className={`flex flex-col gap-3 shrink-0 ${result ? 'md:w-[300px] md:border-r md:border-border md:pr-5' : 'w-full'}`}>

              {/* Zone combinée drag-and-drop + textarea */}
              <div
                ref={zoneRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative flex flex-col gap-2 rounded-xl border-2 transition-colors p-3 ${
                  dragging ? 'border-primary bg-primary/10' : 'border-dashed border-border hover:border-primary/50'
                }`}
              >
                {/* Overlay drag */}
                {dragging && (
                  <div className="absolute inset-0 rounded-xl bg-primary/10 border-2 border-primary flex flex-col items-center justify-center gap-2 z-10 pointer-events-none">
                    <Upload className="w-8 h-8 text-primary" />
                    <span className="text-sm font-semibold text-primary">Relâcher pour importer le PDF</span>
                  </div>
                )}

                {/* Badge PDF si chargé */}
                {fichier && (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-medium text-primary flex-1 truncate">{fichier.name}</span>
                    <button onClick={() => setFichier(null)} className="text-primary/60 hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {/* Textarea */}
                <Textarea
                  placeholder={fichier ? 'Texte complémentaire (optionnel)…' : 'Coller le texte : email, commande, devis, facture…\n\nou glisser-déposer un PDF ci-dessus'}
                  value={texte}
                  onChange={e => setTexte(e.target.value)}
                  className={`font-mono text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 resize-none p-0 placeholder:text-muted-foreground/60 ${result ? 'min-h-[100px]' : 'min-h-[160px]'}`}
                />

                {/* Bouton parcourir PDF */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {fichier ? 'Changer le PDF' : 'Parcourir un PDF…'}
                </button>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFichier(f); e.target.value = ''; }} />
              </div>

              <Button onClick={handleAnalyse} disabled={loading || (!fichier && !texte.trim())} className="w-full">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyse en cours…</> : <><ScanText className="w-4 h-4 mr-2" />Analyser</>}
              </Button>

              {result && (
                <Button variant="outline" onClick={reset} className="w-full">
                  <X className="w-4 h-4 mr-2" />Nouvelle analyse
                </Button>
              )}
            </div>

            {/* ══ COLONNE DROITE : résultats ══ */}
            {result && (
              <div className="flex flex-col gap-4 flex-1 min-h-0 md:pl-5 md:overflow-y-auto mt-4 md:mt-0">

                {/* Badge type + corriger */}
                {typeMeta && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${typeMeta.color}`}>
                      {result.typeDocument === 'facture_fournisseur' || result.typeDocument === 'facture_client' ? <Receipt className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      {typeMeta.label}
                    </span>
                    <Select value={result.typeDocument} onValueChange={v => handleChangeType(v as TypeDocument)}>
                      <SelectTrigger className="h-7 text-xs w-auto px-2 border-dashed">
                        <span className="text-muted-foreground">Corriger le type</span>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(TYPE_LABELS) as [TypeDocument, { label: string; color: string }][]).map(([key, meta]) => (
                          <SelectItem key={key} value={key}>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Match / no-match banner */}
                {matchedCF && (
                  <div className="flex items-center gap-2 rounded-lg bg-success/10 text-success px-3 py-2 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Commande trouvée : <strong>{matchedCF.numero}</strong> — {fournisseurMatch?.societe}</span>
                  </div>
                )}
                {noMatchCF && (
                  <div className="flex items-center gap-2 rounded-lg bg-warning/10 text-warning px-3 py-2 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {result.numeroDocument ? `N° ${result.numeroDocument} non trouvé dans le CRM` : 'Aucune commande correspondante'}
                  </div>
                )}

                {/* Métadonnées */}
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {result.numeroDocument && <><span className="text-muted-foreground text-xs">N° document</span><span className="font-medium text-xs">{result.numeroDocument}</span></>}
                    {result.nomPartenaire && <><span className="text-muted-foreground text-xs">{isFournisseurDoc(result.typeDocument) ? 'Fournisseur' : 'Client'}</span><span className="font-medium text-xs">{result.nomPartenaire}</span></>}
                    {result.referencePartenaire && <><span className="text-muted-foreground text-xs">Réf. partenaire</span><span className="font-medium text-xs">{result.referencePartenaire}</span></>}
                    {result.dateDocument && <><span className="text-muted-foreground text-xs">Date</span><span className="font-medium text-xs">{new Date(result.dateDocument).toLocaleDateString('fr-FR')}</span></>}
                    {result.dateLivraisonPrevue && <><span className="text-muted-foreground text-xs">Livraison prévue</span><span className="font-medium text-xs">{new Date(result.dateLivraisonPrevue).toLocaleDateString('fr-FR')}</span></>}
                    {result.dateEcheance && <><span className="text-muted-foreground text-xs">Échéance</span><span className="font-medium text-xs">{new Date(result.dateEcheance).toLocaleDateString('fr-FR')}</span></>}
                    {result.totalHT != null && <><span className="text-muted-foreground text-xs">Total HT</span><span className="font-medium text-xs">{result.totalHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span></>}
                    {result.totalTTC != null && <><span className="text-muted-foreground text-xs">Total TTC</span><span className="font-semibold text-xs">{result.totalTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span></>}
                  </div>
                  {result.notes && <p className="text-xs text-muted-foreground italic border-t border-border pt-2">{result.notes}</p>}
                </div>

                {/* Lignes */}
                {result.lignes.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Réf.</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Description</th>
                          <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Qté</th>
                          <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">P.U. HT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.lignes.map((l, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="px-2 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{l.reference || '—'}</td>
                            <td className="px-2 py-1.5">{l.description || '—'}</td>
                            <td className="px-2 py-1.5 text-center font-semibold">{l.quantite}</td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">{l.prixUnitaireHT != null ? l.prixUnitaireHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ═══ ACTION commande fournisseur existante ═══ */}
                {matchedCF && (
                  <div className="flex gap-2 justify-end pt-1">
                    {matchedCF.statut !== 'recue' && matchedCF.statut !== 'payee' ? (
                      <Button onClick={() => setReceptionOpen(true)} className="w-full">
                        <Package className="w-4 h-4 mr-2" />Enregistrer la réception
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-success" />Déjà réceptionnée
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ ACTION créer commande fournisseur ═══ */}
                {noMatchCF && (
                  <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold flex items-center gap-2"><PlusCircle className="w-4 h-4 text-primary" />Créer comme commande reçue</h3>
                      <button onClick={() => setShowCreerCF(v => !v)} className="text-xs text-primary hover:underline">{showCreerCF ? 'Masquer' : 'Configurer'}</button>
                    </div>
                    {showCreerCF && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label className="text-xs">Fournisseur *</Label>
                            <Select value={creerCFFournisseurId} onValueChange={setCreerCFFournisseurId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                              <SelectContent>{fournisseurs.map(f => <SelectItem key={f.id} value={f.id}>{f.societe || f.nom}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs">N° commande *</Label><Input className="h-8 text-xs" value={creerCFNumero} onChange={e => setCreerCFNumero(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Date réception *</Label><Input className="h-8 text-xs" type="date" value={creerCFDateReception} onChange={e => setCreerCFDateReception(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Livraison client</Label><Input className="h-8 text-xs" type="date" value={creerCFDateLivraison} onChange={e => setCreerCFDateLivraison(e.target.value)} /></div>
                        </div>
                        <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-8 text-xs" value={creerCFNotes} onChange={e => setCreerCFNotes(e.target.value)} /></div>
                      </div>
                    )}
                    <Button onClick={() => showCreerCF ? handleCreerCF() : setShowCreerCF(true)} className="w-full" size="sm">
                      <PlusCircle className="w-4 h-4 mr-2" />{showCreerCF ? 'Confirmer la création' : 'Créer la commande reçue'}
                    </Button>
                  </div>
                )}

                {/* ═══ ACTION commande client ═══ */}
                {isCC && (
                  <div className="rounded-lg border border-dashed border-success/40 bg-success/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold flex items-center gap-2"><PlusCircle className="w-4 h-4 text-success" />{result.typeDocument === 'devis_client' ? 'Créer comme commande client' : 'Créer la commande client'}</h3>
                      <button onClick={() => setShowCreerCC(v => !v)} className="text-xs text-success hover:underline">{showCreerCC ? 'Masquer' : 'Configurer'}</button>
                    </div>
                    {showCreerCC && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label className="text-xs">Client *</Label>
                            <Select value={creerCCClientId} onValueChange={setCreerCCClientId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.societe || c.nom}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs">N° commande *</Label><Input className="h-8 text-xs" value={creerCCNumero} onChange={e => setCreerCCNumero(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Date *</Label><Input className="h-8 text-xs" type="date" value={creerCCDate} onChange={e => setCreerCCDate(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Livraison prévue</Label><Input className="h-8 text-xs" type="date" value={creerCCDateLivraison} onChange={e => setCreerCCDateLivraison(e.target.value)} /></div>
                        </div>
                        <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-8 text-xs" value={creerCCNotes} onChange={e => setCreerCCNotes(e.target.value)} /></div>
                      </div>
                    )}
                    <Button onClick={() => showCreerCC ? handleCreerCC() : setShowCreerCC(true)} className="w-full bg-success hover:bg-success/90 text-white" size="sm">
                      <PlusCircle className="w-4 h-4 mr-2" />{showCreerCC ? 'Confirmer la création' : 'Créer la commande client'}
                    </Button>
                  </div>
                )}

                {/* ═══ Facture ═══ */}
                {isFact && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-3 text-sm text-muted-foreground">
                    <Receipt className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Facture détectée. Rapprochez-la manuellement de la commande correspondante dans le CRM.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {matchedCF && (
        <ReceptionCommandeDialog
          open={receptionOpen}
          onOpenChange={setReceptionOpen}
          commande={matchedCF}
          fournisseur={fournisseurMatch}
          initialQuantitesRecues={result ? buildQuantitesRecues() : undefined}
          initialDateLivraison={result?.dateLivraisonPrevue ?? undefined}
          onConfirm={handleReception}
        />
      )}
    </>
  );
}
