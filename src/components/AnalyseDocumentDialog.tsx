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
  const [mode, setMode] = useState<'pdf' | 'texte'>('pdf');
  const [texte, setTexte] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DocumentAnalysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setTexte(''); setFichier(null); setResult(null); setMatchedCF(null);
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
      if (mode === 'pdf') {
        if (!fichier) { toast.error('Veuillez sélectionner un fichier PDF'); return; }
        analysis = await analyserDocument({ type: 'pdf', buffer: await fichier.arrayBuffer() }, apiKey);
      } else {
        if (!texte.trim()) { toast.error('Veuillez coller le contenu du document'); return; }
        analysis = await analyserDocument({ type: 'text', texte }, apiKey);
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

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanText className="w-5 h-5 text-primary" />
              Analyse de document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* Mode */}
            <div className="flex gap-2">
              <button onClick={() => setMode('pdf')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${mode === 'pdf' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>
                <FileText className="w-4 h-4" /> Fichier PDF
              </button>
              <button onClick={() => setMode('texte')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${mode === 'texte' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>
                <ScanText className="w-4 h-4" /> Texte / Email
              </button>
            </div>

            {/* Input */}
            {mode === 'pdf' ? (
              <div className="space-y-2">
                <Label>Document (commande, devis, facture, BL, email…)</Label>
                {fichier ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                    <FileText className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-sm flex-1 truncate">{fichier.name}</span>
                    <button onClick={() => setFichier(null)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onClick={() => fileRef.current?.click()}
                    className={`w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors select-none ${dragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary hover:bg-primary/5'}`}>
                    <Upload className={`w-8 h-8 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm text-muted-foreground text-center">{dragging ? 'Relâcher pour importer' : 'Glisser-déposer un PDF ici ou cliquer pour sélectionner'}</span>
                    <span className="text-xs text-muted-foreground">Commande · Devis · Facture · Bon de livraison</span>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFichier(f); e.target.value = ''; }} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="doc-texte">Contenu du document ou email</Label>
                <Textarea id="doc-texte" placeholder="Coller ici le texte : commande fournisseur, devis, commande client, facture, email commercial…" value={texte} onChange={e => setTexte(e.target.value)} className="min-h-[160px] font-mono text-xs" />
              </div>
            )}

            <Button onClick={handleAnalyse} disabled={loading || (mode === 'pdf' ? !fichier : !texte.trim())} className="w-full">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyse en cours…</> : <><ScanText className="w-4 h-4 mr-2" />Analyser le document</>}
            </Button>

            {/* ═══ RÉSULTATS ═══ */}
            {result && (
              <div className="space-y-4 pt-1">
                <div className="h-px bg-border" />

                {/* Badge type */}
                {typeMeta && (
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${typeMeta.color}`}>
                    {result.typeDocument === 'facture_fournisseur' || result.typeDocument === 'facture_client' ? <Receipt className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    {typeMeta.label}
                  </div>
                )}

                {/* Match CF */}
                {matchedCF && (
                  <div className="flex items-center gap-2 rounded-lg bg-success/10 text-success px-4 py-2.5 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Commande trouvée : <span className="font-bold ml-1">{matchedCF.numero}</span>
                    <span className="ml-1 font-normal text-muted-foreground">— {fournisseurMatch?.societe}</span>
                  </div>
                )}
                {noMatchCF && (
                  <div className="flex items-center gap-2 rounded-lg bg-warning/10 text-warning px-4 py-2.5 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {result.numeroDocument ? `N° ${result.numeroDocument} non trouvé dans le CRM` : 'Aucune commande correspondante dans le CRM'}
                  </div>
                )}

                {/* Données extraites */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Données extraites</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {result.numeroDocument && <><span className="text-muted-foreground">N° document</span><span className="font-medium">{result.numeroDocument}</span></>}
                    {result.nomPartenaire && <><span className="text-muted-foreground">{isFournisseurDoc(result.typeDocument) ? 'Fournisseur' : 'Client'}</span><span className="font-medium">{result.nomPartenaire}</span></>}
                    {result.referencePartenaire && <><span className="text-muted-foreground">Réf. partenaire</span><span className="font-medium">{result.referencePartenaire}</span></>}
                    {result.dateDocument && <><span className="text-muted-foreground">Date</span><span className="font-medium">{new Date(result.dateDocument).toLocaleDateString('fr-FR')}</span></>}
                    {result.dateLivraisonPrevue && <><span className="text-muted-foreground">Livraison prévue</span><span className="font-medium">{new Date(result.dateLivraisonPrevue).toLocaleDateString('fr-FR')}</span></>}
                    {result.dateEcheance && <><span className="text-muted-foreground">Échéance</span><span className="font-medium">{new Date(result.dateEcheance).toLocaleDateString('fr-FR')}</span></>}
                    {result.totalHT != null && <><span className="text-muted-foreground">Total HT</span><span className="font-medium">{result.totalHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span></>}
                    {result.totalTTC != null && <><span className="text-muted-foreground">Total TTC</span><span className="font-semibold">{result.totalTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span></>}
                  </div>
                  {result.notes && <p className="text-xs text-muted-foreground italic border-t border-border pt-2">{result.notes}</p>}

                  {result.lignes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">Lignes ({result.lignes.length})</h4>
                      <div className="rounded border border-border overflow-hidden">
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
                                <td className="px-2 py-1.5 font-mono text-muted-foreground">{l.reference || '—'}</td>
                                <td className="px-2 py-1.5">{l.description || '—'}</td>
                                <td className="px-2 py-1.5 text-center font-semibold">{l.quantite}</td>
                                <td className="px-2 py-1.5 text-right">{l.prixUnitaireHT != null ? l.prixUnitaireHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* ═══ ACTION : commande fournisseur existante ═══ */}
                {matchedCF && (
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={reset}>Nouvelle analyse</Button>
                    {matchedCF.statut !== 'recue' && matchedCF.statut !== 'payee' ? (
                      <Button onClick={() => setReceptionOpen(true)}>
                        <Package className="w-4 h-4 mr-2" />Enregistrer la réception
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground px-3">
                        <CheckCircle2 className="w-4 h-4 text-success" />Déjà réceptionnée
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ ACTION : créer commande fournisseur (pas de match) ═══ */}
                {noMatchCF && (
                  <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <PlusCircle className="w-4 h-4 text-primary" />Créer comme nouvelle commande reçue
                      </h3>
                      <button onClick={() => setShowCreerCF(v => !v)} className="text-xs text-primary hover:underline">
                        {showCreerCF ? 'Masquer' : 'Configurer'}
                      </button>
                    </div>
                    {showCreerCF && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Fournisseur *</Label>
                            <Select value={creerCFFournisseurId} onValueChange={setCreerCFFournisseurId}>
                              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                              <SelectContent>{fournisseurs.map(f => <SelectItem key={f.id} value={f.id}>{f.societe || f.nom}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>N° commande *</Label>
                            <Input value={creerCFNumero} onChange={e => setCreerCFNumero(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Date de réception *</Label>
                            <Input type="date" value={creerCFDateReception} onChange={e => setCreerCFDateReception(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Date livraison client prévue</Label>
                            <Input type="date" value={creerCFDateLivraison} onChange={e => setCreerCFDateLivraison(e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Notes</Label>
                          <Input value={creerCFNotes} onChange={e => setCreerCFNotes(e.target.value)} />
                        </div>
                      </div>
                    )}
                    <Button onClick={() => showCreerCF ? handleCreerCF() : setShowCreerCF(true)} className="w-full">
                      <PlusCircle className="w-4 h-4 mr-2" />{showCreerCF ? 'Confirmer la création' : 'Créer la commande reçue'}
                    </Button>
                  </div>
                )}

                {/* ═══ ACTION : commande client / devis ═══ */}
                {isCC && (
                  <div className="rounded-lg border border-dashed border-success/40 bg-success/5 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <PlusCircle className="w-4 h-4 text-success" />
                        {result.typeDocument === 'devis_client' ? 'Créer comme commande client' : 'Créer la commande client'}
                      </h3>
                      <button onClick={() => setShowCreerCC(v => !v)} className="text-xs text-success hover:underline">
                        {showCreerCC ? 'Masquer' : 'Configurer'}
                      </button>
                    </div>
                    {showCreerCC && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Client *</Label>
                            <Select value={creerCCClientId} onValueChange={setCreerCCClientId}>
                              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.societe || c.nom}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>N° commande *</Label>
                            <Input value={creerCCNumero} onChange={e => setCreerCCNumero(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Date *</Label>
                            <Input type="date" value={creerCCDate} onChange={e => setCreerCCDate(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Date livraison prévue</Label>
                            <Input type="date" value={creerCCDateLivraison} onChange={e => setCreerCCDateLivraison(e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Notes</Label>
                          <Input value={creerCCNotes} onChange={e => setCreerCCNotes(e.target.value)} />
                        </div>
                      </div>
                    )}
                    <Button onClick={() => showCreerCC ? handleCreerCC() : setShowCreerCC(true)} className="w-full bg-success hover:bg-success/90 text-white">
                      <PlusCircle className="w-4 h-4 mr-2" />{showCreerCC ? 'Confirmer la création' : 'Créer la commande client'}
                    </Button>
                  </div>
                )}

                {/* ═══ Facture : info uniquement ═══ */}
                {isFact && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-3 text-sm text-muted-foreground">
                    <Receipt className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Facture détectée. Rapprochez-la manuellement de la commande correspondante dans le CRM.</span>
                  </div>
                )}

                {!matchedCF && (
                  <div className="flex justify-start">
                    <Button variant="outline" onClick={reset}>Nouvelle analyse</Button>
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
