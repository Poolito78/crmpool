import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScanText, Upload, Loader2, CheckCircle2, AlertTriangle, FileText, X, PlusCircle, Package, Receipt, Mail, Users, Truck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { analyserDocument, type DocumentAnalysis, type TypeDocument, TYPE_LABELS } from '@/lib/analyseDocument';
import { parseEml } from '@/lib/parseEml';
import { extrairePDFsDeMsg, extrairePJsDeMsg } from '@/lib/parseMsgPdf';
import { parseExcel } from '@/lib/parseExcel';
import { useCRM } from '@/lib/StoreContext';
import {
  type CommandeFournisseur, type LigneReception, type CommandeClient,
  generateId, calculerDateEcheance, formatDateISO,
} from '@/lib/store';
import ReceptionCommandeDialog from '@/components/ReceptionCommandeDialog';
import EmailToContactDialog, { type ExtractedContact } from '@/components/EmailToContactDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fichiers pré-chargés depuis le drag-and-drop du tableau de bord */
  initialFiles?: File[];
}

const today = () => new Date().toISOString().split('T')[0];
const nextYear = () => new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

export default function AnalyseDocumentDialog({ open, onOpenChange, initialFiles }: Props) {
  const {
    commandesFournisseur, fournisseurs, produits, clients,
    updateCommandesFournisseur, updateCommandesClient, updateClients, updateFournisseurs,
  } = useCRM();

  /* ── état analyse ── */
  const [texte, setTexte] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DocumentAnalysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const [emlPdfs, setEmlPdfs] = useState<{ name: string; buffer: ArrayBuffer }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  /* ── état import contact depuis email ── */
  const [emailContactOpen, setEmailContactOpen] = useState(false);
  const [emailContactType, setEmailContactType] = useState<'client' | 'fournisseur'>('client');

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

  /* ── cœur de l'analyse (données en paramètre pour appel immédiat après drop) ── */
  const lancerAnalyse = useCallback(async (
    pdfFile: File | null,
    texteCtx: string,
    pdfsCtx: { name: string; buffer: ArrayBuffer }[]
  ) => {
    if (!apiKey) { toast.error('Clé API Groq manquante (VITE_GROQ_API_KEY)'); return; }
    setLoading(true); setResult(null); setMatchedCF(null); setShowCreerCF(false); setShowCreerCC(false);
    try {
      let analysis: DocumentAnalysis;
      if (pdfFile) {
        const texteSuppl = pdfsCtx.length > 0 && texteCtx.trim() ? texteCtx : undefined;
        analysis = await analyserDocument({ type: 'pdf', buffer: await pdfFile.arrayBuffer(), texteSupplementaire: texteSuppl }, apiKey);
      } else if (texteCtx.trim()) {
        analysis = await analyserDocument({ type: 'text', texte: texteCtx }, apiKey);
      } else {
        toast.error('Glissez un PDF ou collez du texte'); return;
      }
      setResult(analysis);
      if (isFournisseurDoc(analysis.typeDocument) && analysis.numeroDocument) {
        const match = commandesFournisseur.find(cf =>
          cf.numero.toLowerCase().includes(analysis.numeroDocument!.toLowerCase()) ||
          analysis.numeroDocument!.toLowerCase().includes(cf.numero.toLowerCase())
        );
        if (match) { setMatchedCF(match); toast.success(`Commande trouvée : ${match.numero}`); }
        else toast.info('Aucune commande correspondante — vous pouvez la créer');
      } else {
        toast.success(`Document analysé : ${TYPE_LABELS[analysis.typeDocument]?.label}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  }, [apiKey, commandesFournisseur]);

  /* ── traitement des fichiers pré-chargés depuis le dashboard ── */
  useEffect(() => {
    if (!open || !initialFiles || initialFiles.length === 0) return;
    processFiles(initialFiles);
  }, [open, initialFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Traitement commun fichiers (drop interne ou depuis dashboard) */
  const processFiles = useCallback(async (files: File[]) => {
    const isExcel = (f: File) => /\.(xlsx|xls|csv|ods)$/i.test(f.name) ||
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel', 'text/csv', 'application/vnd.oasis.opendocument.spreadsheet'].includes(f.type);

    const pdfFiles  = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    const emlFiles  = files.filter(f => f.name.toLowerCase().endsWith('.eml') || f.type === 'message/rfc822');
    const msgFiles  = files.filter(f => f.name.toLowerCase().endsWith('.msg'));
    const xlsxFiles = files.filter(isExcel);

    const allPdfBuffers: { name: string; buffer: ArrayBuffer }[] = [];
    let emailTexte = '';

    for (const f of emlFiles) {
      try {
        const eml = await parseEml(f);
        if (eml.texte) emailTexte += (emailTexte ? '\n\n' : '') + eml.texte;
        allPdfBuffers.push(...eml.pdfBuffers);
      } catch { /* ignore */ }
    }
    for (const f of msgFiles) {
      try {
        const { extraireTexteDeMsg } = await import('@/lib/parseMsgPdf');
        const msgTxt = await extraireTexteDeMsg(f);
        if (msgTxt) emailTexte += (emailTexte ? '\n\n' : '') + msgTxt;
        const pjs = await extrairePJsDeMsg(f);
        // PDF → pile normale
        allPdfBuffers.push(...pjs.filter(p => p.type === 'pdf'));
        // Excel embarqué → extraire le texte tabulaire directement
        for (const xls of pjs.filter(p => p.type === 'xlsx')) {
          try {
            const xlFile = new File([xls.buffer], xls.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const parsed = await parseExcel(xlFile);
            console.log('[msg→xlsx]', xls.name, '→ chars:', parsed.texte.length);
            if (parsed.texte) {
              // Excel prioritaire : analyser directement
              setTexte(parsed.texte); setFichier(null); setEmlPdfs([]);
              lancerAnalyse(null, parsed.texte, []);
              return;
            }
          } catch (err) {
            console.error('[msg→xlsx] erreur:', err);
          }
        }
      } catch (err) {
        console.error('[parseMsgPdf] erreur:', err);
      }
    }
    for (const f of pdfFiles) {
      allPdfBuffers.push({ name: f.name, buffer: await f.arrayBuffer() });
    }
    if (xlsxFiles.length > 0) {
      let xlTexte = '';
      for (const f of xlsxFiles) {
        try {
          const xls = await parseExcel(f);
          console.log('[parseExcel]', f.name, '→ feuilles:', xls.feuilles, 'chars:', xls.texte.length);
          if (xls.texte) xlTexte += (xlTexte ? '\n\n' : '') + xls.texte;
        } catch (err) {
          console.error('[parseExcel] erreur:', err);
          toast.error(`Impossible de lire ${f.name} : ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (xlTexte) {
        setTexte(xlTexte);
        setFichier(null); setEmlPdfs([]);
        lancerAnalyse(null, xlTexte, []);
        return;
      } else if (xlsxFiles.length > 0) {
        toast.error('Le fichier Excel semble vide ou illisible');
        return;
      }
    }
    if (allPdfBuffers.length > 0) {
      if (emailTexte) setTexte(emailTexte);
      setEmlPdfs(allPdfBuffers);
      const blob = new Blob([allPdfBuffers[0].buffer], { type: 'application/pdf' });
      const firstFile = new File([blob], allPdfBuffers[0].name, { type: 'application/pdf' });
      setFichier(firstFile);
      lancerAnalyse(firstFile, emailTexte, allPdfBuffers);
    } else if (emailTexte) {
      setTexte(emailTexte);
      lancerAnalyse(null, emailTexte, []);
    } else if (files.length > 0) {
      toast.error('Format non reconnu — utilisez PDF, Excel (.xlsx), email (.eml/.msg)');
    }
  }, [lancerAnalyse]);

  /* ── drag & drop ── */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      // Texte glissé directement (sélection dans mail)
      const txtPlain = e.dataTransfer.getData('text/plain');
      const txtHtml  = e.dataTransfer.getData('text/html');
      if (txtPlain) { setTexte(txtPlain); lancerAnalyse(null, txtPlain, []); return; }
      if (txtHtml) {
        const div = document.createElement('div');
        div.innerHTML = txtHtml;
        const t = (div.innerText || div.textContent || '').trim();
        if (t) { setTexte(t); lancerAnalyse(null, t, []); return; }
      }
      toast.error('Rien à importer'); return;
    }
    await processFiles(files);
  }, [lancerAnalyse, processFiles]);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); }, []);

  function reset() {
    setTexte(''); setFichier(null); setEmlPdfs([]); setResult(null); setMatchedCF(null); setDragging(false);
    setReceptionOpen(false); setShowCreerCF(false); setShowCreerCC(false); setEmailContactOpen(false);
    setCreerCFFournisseurId(''); setCreerCFNumero(''); setCreerCFDateReception('');
    setCreerCFDateLivraison(''); setCreerCFNotes('');
    setCreerCCClientId(''); setCreerCCNumero(''); setCreerCCDate('');
    setCreerCCDateLivraison(''); setCreerCCNotes('');
  }

  /* ── analyse manuelle (bouton) → délègue à lancerAnalyse avec le state courant ── */
  function handleAnalyse() {
    lancerAnalyse(fichier, texte, emlPdfs);
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
    const dateEch = formatDateISO(calculerDateEcheance(creerCFDateReception, fourn?.delaiReglement || '45j FDM'));
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
  const isAutre = result && result.typeDocument === 'autre';

  const typeMeta = result ? TYPE_LABELS[result.typeDocument] : null;

  function handleContactExtracted(contact: ExtractedContact) {
    const now = new Date().toISOString();
    const name = contact.societe || contact.nom || '—';
    if (emailContactType === 'client') {
      updateClients(prev => [{
        id: generateId(), nom: contact.nom, email: contact.email, telephone: contact.telephone,
        telephoneMobile: contact.telephoneMobile || undefined,
        adresse: contact.adresse, ville: contact.ville, codePostal: contact.codePostal,
        societe: contact.societe, notes: contact.notes, dateCreation: now, adressesLivraison: [],
      }, ...prev]);
      toast.success(`Client "${name}" créé`);
    } else {
      updateFournisseurs(prev => [{
        id: generateId(), nom: contact.nom, email: contact.email, telephone: contact.telephone,
        telephoneMobile: contact.telephoneMobile || undefined,
        adresse: contact.adresse, ville: contact.ville, codePostal: contact.codePostal,
        societe: contact.societe || contact.nom, notes: contact.notes, dateCreation: now,
        francoPort: 0, coutTransport: 0, delaiReglement: '30j',
      }, ...prev]);
      toast.success(`Fournisseur "${name}" créé`);
    }
    setEmailContactOpen(false);
    onOpenChange(false);
  }

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
        <DialogContent className="w-[98vw] sm:w-[95vw] sm:max-w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-5 [&>button]:z-20">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ScanText className="w-5 h-5 text-primary" />
              Analyse de document
            </DialogTitle>
          </DialogHeader>

          {/* ── Layout 2 colonnes sur desktop ── */}
          <div className="flex flex-col lg:flex-row gap-0 flex-1 min-h-0 pt-3">

            {/* ══ COLONNE GAUCHE : zone unifiée PDF + texte ══ */}
            <div className={`flex flex-col gap-3 shrink-0 ${result ? 'lg:w-[380px] lg:border-r lg:border-border lg:pr-6' : 'w-full max-w-2xl mx-auto'}`}>

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
                    <span className="text-sm font-semibold text-primary">Relâcher pour importer</span>
                  </div>
                )}

                {/* Badge PDF / Email importé */}
                {fichier && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs font-medium text-primary flex-1 truncate">{fichier.name}</span>
                      <button onClick={() => { setFichier(null); setEmlPdfs([]); }} className="text-primary/60 hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {/* PDF supplémentaires de l'email */}
                    {emlPdfs.length > 1 && emlPdfs.slice(1).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/50 border border-border">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">pj {i + 2}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Textarea */}
                <Textarea
                  placeholder={fichier ? 'Texte complémentaire (optionnel)…' : 'Coller le texte : email, commande, devis, facture…\n\nou glisser-déposer un PDF, Excel (.xlsx) ou email'}
                  value={texte}
                  onChange={e => setTexte(e.target.value)}
                  className={`font-mono text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 resize-none p-0 placeholder:text-muted-foreground/60 ${result ? 'min-h-[120px]' : 'min-h-[200px]'}`}
                />

                {/* Bouton parcourir PDF */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {fichier ? 'Changer le fichier' : 'Parcourir PDF, Excel, email (.eml)…'}
                </button>
                <input ref={fileRef} type="file"
                  accept="application/pdf,.eml,message/rfc822,.xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0]; e.target.value = '';
                    if (!f) return;
                    if (f.name.toLowerCase().endsWith('.eml') || f.type === 'message/rfc822') {
                      const eml = await parseEml(f);
                      if (eml.texte) setTexte(eml.texte);
                      if (eml.pdfBuffers.length > 0) {
                        setEmlPdfs(eml.pdfBuffers);
                        const blob = new Blob([eml.pdfBuffers[0].buffer], { type: 'application/pdf' });
                        setFichier(new File([blob], eml.pdfBuffers[0].name, { type: 'application/pdf' }));
                      }
                    } else if (/\.(xlsx|xls|csv|ods)$/i.test(f.name) || f.type.includes('spreadsheet') || f.type.includes('excel') || f.type === 'text/csv') {
                      try {
                        const xls = await parseExcel(f);
                        if (xls.texte) {
                          setTexte(xls.texte);
                          setFichier(null); setEmlPdfs([]);
                          toast.success(`Excel importé : ${f.name} (${xls.feuilles.length} feuille${xls.feuilles.length > 1 ? 's' : ''})`);
                          lancerAnalyse(null, xls.texte, []);
                        }
                      } catch { toast.error('Impossible de lire le fichier Excel'); }
                    } else {
                      setFichier(f);
                      lancerAnalyse(f, texte, emlPdfs);
                    }
                  }} />
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

            {/* ══ COLONNE DROITE : résultats / loading ══ */}
            {(result || loading) && (
              <div className="flex flex-col gap-4 flex-1 min-h-0 lg:pl-6 lg:overflow-y-auto mt-4 lg:mt-0">

                {/* ── Skeleton pendant l'analyse ── */}
                {loading && !result && (
                  <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-sm font-medium">Analyse IA en cours…</p>
                    <p className="text-xs text-center max-w-xs">Le document est lu et interprété par le modèle.</p>
                  </div>
                )}

                {result && (<>

                {/* ── En-tête : type + sélecteur correction ── */}
                {typeMeta && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide ${typeMeta.color}`}>
                      {result.typeDocument === 'facture_fournisseur' || result.typeDocument === 'facture_client'
                        ? <Receipt className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      {typeMeta.label}
                    </span>
                    <Select value={result.typeDocument} onValueChange={v => handleChangeType(v as TypeDocument)}>
                      <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2.5 border-dashed text-muted-foreground hover:text-foreground">
                        <span>Corriger le type</span>
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

                {/* ── Bandeaux match / no-match ── */}
                {matchedCF && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-success/10 border border-success/20 text-success px-4 py-2.5 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-semibold">Commande trouvée</span>
                      <span className="text-success/80"> · {matchedCF.numero}{fournisseurMatch ? ` — ${fournisseurMatch.societe}` : ''}</span>
                    </div>
                  </div>
                )}
                {noMatchCF && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 text-sm font-medium dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{result.numeroDocument ? `N° ${result.numeroDocument} non trouvé dans le CRM` : 'Aucune commande correspondante'}</span>
                  </div>
                )}

                {/* ── Strip montants (si présents) ── */}
                {(result.totalHT != null || result.totalTTC != null) && (
                  <div className="grid grid-cols-2 gap-3">
                    {result.totalHT != null && (
                      <div className="rounded-lg bg-muted/50 border border-border px-4 py-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">Total HT</p>
                        <p className="text-lg font-bold tabular-nums">{result.totalHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                      </div>
                    )}
                    {result.totalTTC != null && (
                      <div className="rounded-lg bg-primary/8 border border-primary/20 px-4 py-3">
                        <p className="text-[10px] text-primary/70 uppercase tracking-widest font-semibold mb-0.5">Total TTC</p>
                        <p className="text-lg font-bold text-primary tabular-nums">{result.totalTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Métadonnées ── */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 border-b border-border">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Informations extraites</p>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-px bg-border">
                    {([
                      result.numeroDocument  && ['N° document',   result.numeroDocument],
                      result.nomPartenaire   && [isFournisseurDoc(result.typeDocument) ? 'Fournisseur' : 'Client', result.nomPartenaire],
                      result.referencePartenaire && ['Réf. partenaire', result.referencePartenaire],
                      result.dateDocument    && ['Date',          new Date(result.dateDocument).toLocaleDateString('fr-FR')],
                      result.dateLivraisonPrevue && ['Livraison',  new Date(result.dateLivraisonPrevue).toLocaleDateString('fr-FR')],
                      result.dateEcheance    && ['Échéance',       new Date(result.dateEcheance).toLocaleDateString('fr-FR')],
                    ] as ([string, string] | false)[]).filter(Boolean).map(([label, value], i) => (
                      <div key={i} className="bg-background px-4 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">{label}</p>
                        <p className="text-sm font-semibold truncate" title={value}>{value}</p>
                      </div>
                    ))}
                  </div>
                  {result.notes && (
                    <div className="bg-background px-4 py-2.5 border-t border-border">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Notes</p>
                      <p className="text-xs text-muted-foreground italic">{result.notes}</p>
                    </div>
                  )}
                </div>

                {/* ── Lignes ── */}
                {result.lignes.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2 border-b border-border flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Lignes ({result.lignes.length})</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-[11px] whitespace-nowrap">Réf.</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-[11px]">Description</th>
                            <th className="text-center px-3 py-2 font-semibold text-muted-foreground text-[11px]">Qté</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-[11px] whitespace-nowrap">P.U. HT</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-[11px] whitespace-nowrap">Total HT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {result.lignes.map((l, i) => {
                            const total = l.prixUnitaireHT != null ? l.prixUnitaireHT * l.quantite : null;
                            return (
                              <tr key={i} className="hover:bg-muted/20 transition-colors">
                                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{l.reference || '—'}</td>
                                <td className="px-3 py-2.5 max-w-[240px]">{l.description || '—'}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-sm">{l.quantite}</td>
                                <td className="px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground">{l.prixUnitaireHT != null ? l.prixUnitaireHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
                                <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold">{total != null ? total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ═══ ACTION : commande fournisseur existante ═══ */}
                {matchedCF && (
                  matchedCF.statut !== 'recue' && matchedCF.statut !== 'payee' ? (
                    <Button onClick={() => setReceptionOpen(true)} size="lg" className="w-full">
                      <Package className="w-4 h-4 mr-2" />Enregistrer la réception
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground py-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />Déjà réceptionnée
                    </div>
                  )
                )}

                {/* ═══ ACTION : créer commande fournisseur ═══ */}
                {noMatchCF && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                          <PlusCircle className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Créer comme commande reçue</p>
                          <p className="text-[11px] text-muted-foreground">Enregistrer dans les achats fournisseurs</p>
                        </div>
                      </div>
                      <button onClick={() => setShowCreerCF(v => !v)} className="text-xs text-primary hover:underline shrink-0">{showCreerCF ? 'Masquer' : 'Configurer'}</button>
                    </div>
                    {showCreerCF && (
                      <div className="space-y-2 pt-1">
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

                {/* ═══ ACTION : commande client ═══ */}
                {isCC && (
                  <div className="rounded-xl border border-success/30 bg-success/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-success/15 flex items-center justify-center shrink-0">
                          <PlusCircle className="w-4 h-4 text-success" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{result.typeDocument === 'devis_client' ? 'Créer comme commande client' : 'Créer la commande client'}</p>
                          <p className="text-[11px] text-muted-foreground">Enregistrer dans les ventes</p>
                        </div>
                      </div>
                      <button onClick={() => setShowCreerCC(v => !v)} className="text-xs text-success hover:underline shrink-0">{showCreerCC ? 'Masquer' : 'Configurer'}</button>
                    </div>
                    {showCreerCC && (
                      <div className="space-y-2 pt-1">
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
                  <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-0.5">Facture détectée</p>
                      <p className="text-xs text-muted-foreground">Rapprochez-la manuellement de la commande correspondante dans le CRM.</p>
                    </div>
                  </div>
                )}

                {/* ═══ Autre document → import contact ═══ */}
                {isAutre && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Importer le contact</p>
                        <p className="text-[11px] text-muted-foreground">L'IA va extraire les coordonnées depuis ce texte</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => { setEmailContactType('client'); setEmailContactOpen(true); }}
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Créer client
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        size="sm"
                        onClick={() => { setEmailContactType('fournisseur'); setEmailContactOpen(true); }}
                      >
                        <Truck className="w-4 h-4 mr-2" />
                        Créer fournisseur
                      </Button>
                    </div>
                  </div>
                )}

                </>)}
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

      <EmailToContactDialog
        open={emailContactOpen}
        onOpenChange={setEmailContactOpen}
        type={emailContactType}
        onExtracted={handleContactExtracted}
        initialText={texte || undefined}
      />
    </>
  );
}
