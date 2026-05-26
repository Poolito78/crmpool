import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { BAREMES_TRANSPORT, calculerFraisPortBareme, formatMontant, generateId, getStandardBareme, saveStandardBareme, DEFAULT_STANDARD_BAREME, type TransporteurType, type BaremePalier, type StandardBareme } from '@/lib/store';
import { analyserDocumentTransport } from '@/lib/analyseTransport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Truck, MapPin, Pencil, Check, X, RotateCcw, Plus, GripVertical, Trash2, TrendingUp, FileText, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Coordonnées approximatives des centres de départements français (lat, lng)
const DEPT_COORDS: Record<string, [number, number]> = {
  '01': [46.2, 5.3], '02': [49.5, 3.6], '03': [46.3, 3.2], '04': [44.1, 6.2], '05': [44.7, 6.3],
  '06': [43.8, 7.2], '07': [44.7, 4.6], '08': [49.6, 4.6], '09': [42.9, 1.6], '10': [48.3, 4.1],
  '11': [43.2, 2.4], '12': [44.3, 2.6], '13': [43.5, 5.1], '14': [49.1, -0.4], '15': [45.0, 2.7],
  '16': [45.7, 0.2], '17': [45.9, -0.8], '18': [47.1, 2.4], '19': [45.3, 1.8], '2A': [41.9, 9.0],
  '2B': [42.5, 9.3], '21': [47.3, 4.8], '22': [48.5, -3.0], '23': [46.1, 2.1], '24': [45.1, 0.7],
  '25': [47.2, 6.3], '26': [44.7, 5.1], '27': [49.1, 1.2], '28': [48.3, 1.3], '29': [48.4, -4.2],
  '30': [44.0, 4.1], '31': [43.5, 1.4], '32': [43.7, 0.6], '33': [44.8, -0.6], '34': [43.6, 3.7],
  '35': [48.2, -1.7], '36': [46.8, 1.7], '37': [47.3, 0.7], '38': [45.2, 5.7], '39': [46.7, 5.7],
  '40': [43.9, -0.8], '41': [47.6, 1.3], '42': [45.6, 4.3], '43': [45.1, 3.7], '44': [47.3, -1.6],
  '45': [47.9, 2.1], '46': [44.6, 1.7], '47': [44.3, 0.5], '48': [44.5, 3.5], '49': [47.4, -0.6],
  '50': [48.9, -1.3], '51': [48.9, 4.0], '52': [48.1, 5.1], '53': [48.1, -0.8], '54': [48.7, 6.2],
  '55': [49.0, 5.4], '56': [47.8, -2.8], '57': [49.0, 6.7], '58': [47.1, 3.5], '59': [50.4, 3.1],
  '60': [49.4, 2.5], '61': [48.6, 0.1], '62': [50.5, 2.3], '63': [45.7, 3.1], '64': [43.3, -0.8],
  '65': [43.1, 0.1], '66': [42.6, 2.5], '67': [48.6, 7.5], '68': [47.9, 7.2], '69': [45.8, 4.8],
  '70': [47.6, 6.2], '71': [46.6, 4.4], '72': [47.9, 0.2], '73': [45.5, 6.4], '74': [46.0, 6.3],
  '75': [48.9, 2.3], '76': [49.5, 1.1], '77': [48.6, 2.9], '78': [48.8, 1.9], '79': [46.5, -0.4],
  '80': [49.9, 2.3], '81': [43.8, 2.2], '82': [44.0, 1.3], '83': [43.5, 6.3], '84': [44.0, 5.1],
  '85': [46.7, -1.3], '86': [46.6, 0.4], '87': [45.9, 1.3], '88': [48.2, 6.5], '89': [47.8, 3.6],
  '90': [47.6, 6.9], '91': [48.5, 2.2], '92': [48.8, 2.2], '93': [48.9, 2.5], '94': [48.8, 2.5],
  '95': [49.1, 2.1], '971': [16.2, -61.5], '972': [14.6, -61.0], '973': [4.0, -53.0], '974': [-21.1, 55.5], '976': [-12.8, 45.2],
};

function estimerDistanceKm(dept1: string, dept2: string): number | null {
  const c1 = DEPT_COORDS[dept1];
  const c2 = DEPT_COORDS[dept2];
  if (!c1 || !c2) return null;
  const R = 6371;
  const dLat = (c2[0] - c1[0]) * Math.PI / 180;
  const dLng = (c2[1] - c1[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const vol = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(vol * 1.3);
}

// ── Barèmes personnalisables ──────────────────────────────────────────────────

type CarrierKey = Exclude<TransporteurType, 'standard'>;
type CustomBaremes = Record<CarrierKey, BaremePalier[]>;
type PageTab = 'standard' | 'calcul' | 'baremes' | 'manuel' | 'achat';

const LS_KEY = 'crm_transport_baremes';

function loadBaremes(): CustomBaremes {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as CustomBaremes;
      if (parsed.ups && parsed.messagerie && parsed.gls) {
        // Rétablir Infinity (JSON.parse le convertit en null)
        const fix = (b: BaremePalier) => ({ ...b, max: b.max === null ? Infinity : b.max });
        return {
          ups: parsed.ups.map(fix),
          messagerie: parsed.messagerie.map(fix),
          gls: parsed.gls.map(fix),
        };
      }
    }
  } catch { /* ignore */ }
  return {
    ups: BAREMES_TRANSPORT.ups.bareme,
    messagerie: BAREMES_TRANSPORT.messagerie.bareme,
    gls: BAREMES_TRANSPORT.gls.bareme,
  };
}

const CARRIERS: { key: CarrierKey; label: string }[] = [
  { key: 'ups', label: 'UPS' },
  { key: 'messagerie', label: 'Messagerie' },
  { key: 'gls', label: 'Affrètement GLS' },
];

// ── Historique achats transport ───────────────────────────────────────────────

const LS_ACHATS_KEY = 'crm_transport_achats';

interface AchatTransport {
  id: string;
  date: string;
  transporteur: string;
  poidsKg: number;
  distanceKm: number | null;
  deptDepart: string;
  deptArrivee: string;
  prixHT: number;
  reference: string;
  note: string;
}

const TRANCHES_POIDS = [
  { label: '1 – 25 kg',     min: 1,   max: 25  },
  { label: '26 – 100 kg',   min: 26,  max: 100 },
  { label: '101 – 700 kg',  min: 101, max: 700 },
  { label: '701 kg et +',   min: 701, max: Infinity },
];

function loadAchats(): AchatTransport[] {
  try {
    const s = localStorage.getItem(LS_ACHATS_KEY);
    return s ? (JSON.parse(s) as AchatTransport[]) : [];
  } catch { return []; }
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function CalculateurUPS() {
  const [pageTab, setPageTab] = useState<PageTab>('standard');

  // Barèmes (persistés en localStorage)
  const [customBaremes, setCustomBaremes] = useState<CustomBaremes>(loadBaremes);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(customBaremes));
  }, [customBaremes]);

  // ── Calculateur ────────────────────────────────────────────────────────────
  const [poids, setPoids] = useState(0);
  const [nbColis, setNbColis] = useState(1);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierKey>('ups');
  const [coeff, setCoeff] = useState(1.4);
  const [express, setExpress] = useState(false);
  const [coeffExpress, setCoeffExpress] = useState(1.8);
  const [deptDepart, setDeptDepart] = useState('76');
  const [deptLivraison, setDeptLivraison] = useState('');

  const calcConfig = useMemo(() => ({
    ...BAREMES_TRANSPORT[selectedCarrier],
    bareme: customBaremes[selectedCarrier],
  }), [selectedCarrier, customBaremes]);

  const resultat = calculerFraisPortBareme(calcConfig.bareme, poids, nbColis);
  const coeffTotal = express ? coeff * coeffExpress : coeff;
  const prixFinal = resultat.prix !== null ? Math.round(resultat.prix * coeffTotal * 100) / 100 : null;
  const distanceKm = useMemo(
    () => deptDepart && deptLivraison ? estimerDistanceKm(deptDepart, deptLivraison) : null,
    [deptDepart, deptLivraison],
  );

  // ── Barèmes — édition ──────────────────────────────────────────────────────
  const [baremeCarrier, setBaremeCarrier] = useState<CarrierKey>('ups');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editPrix, setEditPrix] = useState('');

  const startEdit = (idx: number) => {
    const b = customBaremes[baremeCarrier][idx];
    setEditIdx(idx);
    setEditPrix(b.prix !== null ? String(b.prix) : '');
  };

  const saveEdit = () => {
    if (editIdx === null) return;
    const prix = editPrix.trim() === '' ? null : parseFloat(editPrix.replace(',', '.'));
    if (prix !== null && isNaN(prix)) { toast.error('Valeur invalide'); return; }
    setCustomBaremes(prev => ({
      ...prev,
      [baremeCarrier]: prev[baremeCarrier].map((b, i) => i === editIdx ? { ...b, prix } : b),
    }));
    setEditIdx(null);
    toast.success('Tarif mis à jour');
  };

  const resetBareme = (key: CarrierKey) => {
    setCustomBaremes(prev => ({ ...prev, [key]: BAREMES_TRANSPORT[key].bareme }));
    setEditIdx(null);
    toast.success(`Barème ${BAREMES_TRANSPORT[key].label} réinitialisé`);
  };

  // ── Standard ──────────────────────────────────────────────────────────────
  const [std, setStd] = useState<StandardBareme>(getStandardBareme);
  const [stdEditIdx, setStdEditIdx] = useState<number | null>(null);
  const [stdEditPrix, setStdEditPrix] = useState('');
  const [stdEditFranco, setStdEditFranco] = useState(false);
  const [stdFrancoInput, setStdFrancoInput] = useState('');
  const [stdEditHayon, setStdEditHayon] = useState(false);
  const [stdHayonInput, setStdHayonInput] = useState('');
  const [stdEditReliv, setStdEditReliv] = useState(false);
  const [stdRelivInput, setStdRelivInput] = useState('');
  // Calculateur standard
  const [stdPoids, setStdPoids] = useState('');
  const [stdMontant, setStdMontant] = useState('');
  const [stdHayon, setStdHayon] = useState(false);
  const [stdReliv, setStdReliv] = useState(false);
  const [stdResult, setStdResult] = useState<{ prix: number; franco: boolean; total: number } | null>(null);
  const [stdError, setStdError] = useState('');

  const stdCalculer = () => {
    setStdError(''); setStdResult(null);
    const p = parseFloat(stdPoids.replace(',', '.'));
    if (isNaN(p) || p <= 0) { setStdError('Saisissez un poids valide'); return; }
    const m = parseFloat(stdMontant.replace(',', '.')) || 0;
    const franco = m >= std.seuilFranco;
    const tranche = std.tranches.find(t => t.max === null || p <= t.max);
    if (!tranche) { setStdError('Aucune tranche ne correspond à ce poids'); return; }
    const prixTransport = franco ? 0 : tranche.prix;
    const total = prixTransport + (stdHayon ? std.hayon : 0) + (stdReliv ? std.relivraison : 0);
    setStdResult({ prix: prixTransport, franco, total });
  };

  const stdSaveTranche = () => {
    if (stdEditIdx === null) return;
    const prix = parseFloat(stdEditPrix.replace(',', '.'));
    if (isNaN(prix)) { toast.error('Valeur invalide'); return; }
    const updated = { ...std, tranches: std.tranches.map((t, i) => i === stdEditIdx ? { ...t, prix } : t) };
    setStd(updated); saveStandardBareme(updated); setStdEditIdx(null);
    toast.success('Tarif mis à jour');
  };

  // ── Saisie manuelle ────────────────────────────────────────────────────────
  const [manuelPrix, setManuelPrix] = useState('');
  const [manuelCoeff, setManuelCoeff] = useState('1.4');
  const [manuelNote, setManuelNote] = useState('');

  const manuelPrixNum = parseFloat(manuelPrix.replace(',', '.')) || 0;
  const manuelCoeffNum = parseFloat(manuelCoeff.replace(',', '.')) || 1;
  const manuelTotal = Math.round(manuelPrixNum * manuelCoeffNum * 100) / 100;

  // ── Historique achats transport ────────────────────────────────────────────
  const [achats, setAchats] = useState<AchatTransport[]>(loadAchats);
  const [achatFormOpen, setAchatFormOpen] = useState(false);
  const [achatForm, setAchatForm] = useState<Partial<AchatTransport>>({
    date: new Date().toISOString().split('T')[0],
    transporteur: '',
    poidsKg: undefined,
    distanceKm: null,
    deptDepart: '76',
    deptArrivee: '',
    prixHT: undefined,
    reference: '',
    note: '',
  });
  const [achatSortBy, setAchatSortBy] = useState<'date' | 'poids' | 'distance' | 'prix'>('date');
  const [achatSortAsc, setAchatSortAsc] = useState(false);
  const dragAchatIdx = useRef<number | null>(null);
  const [dragOverAchat, setDragOverAchat] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_ACHATS_KEY, JSON.stringify(achats));
  }, [achats]);

  const achatDistanceCalc = useMemo(
    () => achatForm.deptDepart && achatForm.deptArrivee
      ? estimerDistanceKm(achatForm.deptDepart, achatForm.deptArrivee)
      : null,
    [achatForm.deptDepart, achatForm.deptArrivee],
  );

  const achatsSorted = useMemo(() => {
    return [...achats].sort((a, b) => {
      let va: number, vb: number;
      if (achatSortBy === 'date')     { va = new Date(a.date).getTime(); vb = new Date(b.date).getTime(); }
      else if (achatSortBy === 'poids')    { va = a.poidsKg; vb = b.poidsKg; }
      else if (achatSortBy === 'distance') { va = a.distanceKm ?? -1; vb = b.distanceKm ?? -1; }
      else                              { va = a.prixHT; vb = b.prixHT; }
      return achatSortAsc ? va - vb : vb - va;
    });
  }, [achats, achatSortBy, achatSortAsc]);

  // Stats par tranche
  const achatStats = useMemo(() => TRANCHES_POIDS.map(t => {
    const items = achats.filter(a => a.poidsKg >= t.min && a.poidsKg <= t.max);
    if (items.length === 0) return { ...t, count: 0, avg: null, min: null, max: null };
    const prices = items.map(a => a.prixHT);
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
    return { ...t, count: items.length, avg, min: Math.min(...prices), max: Math.max(...prices) };
  }), [achats]);

  function saveAchat() {
    const p = parseFloat(String(achatForm.poidsKg ?? '')) || 0;
    const prix = parseFloat(String(achatForm.prixHT ?? '')) || 0;
    if (p <= 0) { toast.error('Poids requis'); return; }
    if (prix <= 0) { toast.error('Prix achat requis'); return; }
    const dist = achatDistanceCalc ?? (achatForm.distanceKm ?? null);
    const entry: AchatTransport = {
      id: generateId(),
      date: achatForm.date || new Date().toISOString().split('T')[0],
      transporteur: achatForm.transporteur || '',
      poidsKg: p,
      distanceKm: dist,
      deptDepart: achatForm.deptDepart || '',
      deptArrivee: achatForm.deptArrivee || '',
      prixHT: prix,
      reference: achatForm.reference || '',
      note: achatForm.note || '',
    };
    setAchats(prev => [entry, ...prev]);
    setAchatFormOpen(false);
    setAchatForm({ date: new Date().toISOString().split('T')[0], deptDepart: '76', transporteur: '', reference: '', note: '' });
    toast.success('Entrée ajoutée');
  }

  function deleteAchat(id: string) {
    setAchats(prev => prev.filter(a => a.id !== id));
    toast.success('Entrée supprimée');
  }

  function onDragStartAchat(realIdx: number) {
    dragAchatIdx.current = realIdx;
  }
  function onDragOverAchat(e: React.DragEvent, sortedIdx: number) {
    e.preventDefault();
    setDragOverAchat(sortedIdx);
  }
  function onDropAchat(sortedIdx: number) {
    if (dragAchatIdx.current === null || dragAchatIdx.current === sortedIdx) {
      setDragOverAchat(null);
      dragAchatIdx.current = null;
      return;
    }
    // Reorder in achatsSorted, then apply to achats
    const sorted = [...achatsSorted];
    const [moved] = sorted.splice(dragAchatIdx.current, 1);
    sorted.splice(sortedIdx, 0, moved);
    const idOrder = sorted.map(a => a.id);
    setAchats(idOrder.map(id => achats.find(a => a.id === id)!).filter(Boolean));
    setDragOverAchat(null);
    dragAchatIdx.current = null;
  }

  function toggleSort(col: typeof achatSortBy) {
    if (achatSortBy === col) setAchatSortAsc(v => !v);
    else { setAchatSortBy(col); setAchatSortAsc(col === 'poids' || col === 'distance'); }
  }

  // ── Extraction IA depuis document glissé ──────────────────────────────────
  const [dropZoneDragging, setDropZoneDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedFile, setExtractedFile] = useState<string>('');
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groqKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  const geminiKey2 = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  const openrouterKey2 = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;

  const handleDocumentFile = useCallback(async (file: File) => {
    const allowed = ['application/pdf', 'text/plain', 'application/octet-stream'];
    const ext = file.name.toLowerCase();
    if (!allowed.some(t => file.type.startsWith(t)) && !ext.endsWith('.pdf') && !ext.endsWith('.txt')) {
      toast.error('Format non supporté — PDF ou texte uniquement');
      return;
    }
    setExtracting(true);
    setExtractedFile(file.name);
    try {
      const extrait = await analyserDocumentTransport(file, groqKey, geminiKey2, openrouterKey2);
      // Pré-remplir le formulaire
      setAchatForm(prev => ({
        ...prev,
        transporteur:  extrait.transporteur  ?? prev.transporteur,
        date:          extrait.date          ?? prev.date,
        poidsKg:       extrait.poidsKg       ?? prev.poidsKg,
        prixHT:        extrait.prixHT        ?? prev.prixHT,
        deptDepart:    extrait.deptDepart    ?? prev.deptDepart,
        deptArrivee:   extrait.deptArrivee   ?? prev.deptArrivee,
        distanceKm:    extrait.distanceKm    ?? prev.distanceKm,
        reference:     extrait.reference     ?? prev.reference,
        note:          extrait.note          ?? prev.note,
      }));
      setAchatFormOpen(true);
      toast.success(`Document analysé — vérifiez et complétez les champs`);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'analyse');
    } finally {
      setExtracting(false);
    }
  }, [groqKey, geminiKey2, openrouterKey2]);

  const onDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropZoneDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleDocumentFile(file);
  }, [handleDocumentFile]);

  // ── Helper : sélecteur transporteur ───────────────────────────────────────
  const CarrierSelector = ({ value, onChange }: { value: CarrierKey; onChange: (k: CarrierKey) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {CARRIERS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'px-3 py-1 text-sm rounded border transition-colors',
            value === key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-foreground hover:bg-accent',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl">

      {/* Onglets page */}
      <div className="flex gap-1 border-b">
        {([
          ['standard', 'Standard'],
          ['calcul',   'Transporteurs'],
          ['baremes',  'Barèmes transporteurs'],
          ['manuel',   'Saisie manuelle'],
          ['achat',    'Achat'],
        ] as [PageTab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => { setPageTab(t); setEditIdx(null); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              pageTab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════ STANDARD ══════════ */}
      {pageTab === 'standard' && (
        <div className="space-y-6">
          {/* Conditions résumées */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="w-5 h-5 text-amber-600" />
                Conditions de transport standard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Seuil franco */}
              <div className="flex items-center gap-3 flex-wrap p-3 rounded-md bg-green-50 border border-green-200">
                <span className="text-sm font-semibold text-green-800">Transport offert à partir de</span>
                {stdEditFranco ? (
                  <div className="flex items-center gap-2">
                    <Input value={stdFrancoInput} onChange={e => setStdFrancoInput(e.target.value)}
                      className="h-7 w-28" onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const v = parseFloat(stdFrancoInput.replace(',', '.'));
                          if (!isNaN(v)) { const u = { ...std, seuilFranco: v }; setStd(u); saveStandardBareme(u); toast.success('Seuil franco mis à jour'); }
                          setStdEditFranco(false);
                        }
                        if (e.key === 'Escape') setStdEditFranco(false);
                      }} autoFocus />
                    <span className="text-sm text-green-800">€ HT</span>
                    <button onClick={() => { const v = parseFloat(stdFrancoInput.replace(',', '.')); if (!isNaN(v)) { const u = { ...std, seuilFranco: v }; setStd(u); saveStandardBareme(u); toast.success('Seuil franco mis à jour'); } setStdEditFranco(false); }} className="p-1 text-green-700 hover:bg-green-100 rounded"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setStdEditFranco(false)} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-green-800">{std.seuilFranco.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € HT</span>
                    <button onClick={() => { setStdFrancoInput(String(std.seuilFranco)); setStdEditFranco(true); }} className="p-1 text-green-700 hover:bg-green-100 rounded opacity-60 hover:opacity-100"><Pencil className="w-3 h-3" /></button>
                  </div>
                )}
              </div>

              {/* Tranches */}
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tranche de poids</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Frais HT</th>
                      <th className="w-12 px-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {std.tranches.map((t, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-2">
                          {t.max === null ? `${t.min} kg et plus` : `De ${t.min} à ${t.max} kg`}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {stdEditIdx === i ? (
                            <Input value={stdEditPrix} onChange={e => setStdEditPrix(e.target.value)}
                              className="h-7 w-24 text-right ml-auto"
                              onKeyDown={e => { if (e.key === 'Enter') stdSaveTranche(); if (e.key === 'Escape') setStdEditIdx(null); }}
                              autoFocus />
                          ) : (
                            <span className="font-semibold">{formatMontant(t.prix)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {stdEditIdx === i ? (
                            <div className="flex gap-1">
                              <button onClick={stdSaveTranche} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setStdEditIdx(null)} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ) : (
                            <button onClick={() => { setStdEditIdx(i); setStdEditPrix(String(t.prix)); }}
                              className="p-1 text-muted-foreground hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Suppléments */}
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Supplément</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Montant HT</th>
                      <th className="w-12 px-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {/* Hayon */}
                    <tr className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-2">Hayon</td>
                      <td className="px-4 py-2 text-right">
                        {stdEditHayon ? (
                          <Input value={stdHayonInput} onChange={e => setStdHayonInput(e.target.value)}
                            className="h-7 w-24 text-right ml-auto"
                            onKeyDown={e => {
                              if (e.key === 'Enter') { const v = parseFloat(stdHayonInput.replace(',', '.')); if (!isNaN(v)) { const u = { ...std, hayon: v }; setStd(u); saveStandardBareme(u); toast.success('Hayon mis à jour'); } setStdEditHayon(false); }
                              if (e.key === 'Escape') setStdEditHayon(false);
                            }} autoFocus />
                        ) : <span className="font-semibold">{formatMontant(std.hayon)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {stdEditHayon ? (
                          <div className="flex gap-1">
                            <button onClick={() => { const v = parseFloat(stdHayonInput.replace(',', '.')); if (!isNaN(v)) { const u = { ...std, hayon: v }; setStd(u); saveStandardBareme(u); toast.success('Hayon mis à jour'); } setStdEditHayon(false); }} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setStdEditHayon(false)} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <button onClick={() => { setStdHayonInput(String(std.hayon)); setStdEditHayon(true); }} className="p-1 text-muted-foreground hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                      </td>
                    </tr>
                    {/* Relivraison */}
                    <tr className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-2">Relivraison (absence au rdv)</td>
                      <td className="px-4 py-2 text-right">
                        {stdEditReliv ? (
                          <Input value={stdRelivInput} onChange={e => setStdRelivInput(e.target.value)}
                            className="h-7 w-24 text-right ml-auto"
                            onKeyDown={e => {
                              if (e.key === 'Enter') { const v = parseFloat(stdRelivInput.replace(',', '.')); if (!isNaN(v)) { const u = { ...std, relivraison: v }; setStd(u); saveStandardBareme(u); toast.success('Relivraison mis à jour'); } setStdEditReliv(false); }
                              if (e.key === 'Escape') setStdEditReliv(false);
                            }} autoFocus />
                        ) : <span className="font-semibold">{formatMontant(std.relivraison)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {stdEditReliv ? (
                          <div className="flex gap-1">
                            <button onClick={() => { const v = parseFloat(stdRelivInput.replace(',', '.')); if (!isNaN(v)) { const u = { ...std, relivraison: v }; setStd(u); saveStandardBareme(u); toast.success('Relivraison mis à jour'); } setStdEditReliv(false); }} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setStdEditReliv(false)} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <button onClick={() => { setStdRelivInput(String(std.relivraison)); setStdEditReliv(true); }} className="p-1 text-muted-foreground hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground flex-1">Cliquez sur une ligne pour modifier. Sauvegardé localement et utilisé dans le calcul automatique des devis.</p>

                <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground shrink-0"
                  onClick={() => { setStd(DEFAULT_STANDARD_BAREME); saveStandardBareme(DEFAULT_STANDARD_BAREME); toast.success('Barème réinitialisé'); }}>
                  <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mini calculateur standard */}
          <Card>
            <CardHeader><CardTitle className="text-base">Calculateur standard</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-w-sm">
              <div className="space-y-1.5">
                <Label>Montant commande HT (€) <span className="text-muted-foreground font-normal text-xs">— pour franco</span></Label>
                <Input type="text" inputMode="decimal" placeholder={`ex : ${std.seuilFranco}`} value={stdMontant}
                  onChange={e => { setStdMontant(e.target.value); setStdResult(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Poids total (kg)</Label>
                <div className="flex gap-2">
                  <Input type="text" inputMode="decimal" placeholder="ex : 45" value={stdPoids}
                    onChange={e => { setStdPoids(e.target.value); setStdResult(null); setStdError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') stdCalculer(); }} />
                  <Button onClick={stdCalculer}>Calculer</Button>
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={stdHayon} onChange={e => { setStdHayon(e.target.checked); setStdResult(null); }} className="rounded" />
                  Hayon (+{formatMontant(std.hayon)})
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={stdReliv} onChange={e => { setStdReliv(e.target.checked); setStdResult(null); }} className="rounded" />
                  Relivraison (+{formatMontant(std.relivraison)})
                </label>
              </div>
              {stdError && <p className="text-sm text-destructive">{stdError}</p>}
              {stdResult && (
                <div className="rounded-lg border bg-card p-4 space-y-1">
                  {stdResult.franco ? (
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-green-600" />
                      <span className="text-xl font-bold text-green-600">Transport offert</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-amber-600" />
                      <span className="text-2xl font-bold">{formatMontant(stdResult.prix)}<span className="text-sm font-normal text-muted-foreground ml-1">HT</span></span>
                    </div>
                  )}
                  {(stdHayon || stdReliv) && (
                    <div className="border-t pt-2 mt-1 space-y-0.5">
                      {stdHayon && <div className="flex justify-between text-sm text-muted-foreground"><span>Hayon</span><span>+{formatMontant(std.hayon)}</span></div>}
                      {stdReliv && <div className="flex justify-between text-sm text-muted-foreground"><span>Relivraison</span><span>+{formatMontant(std.relivraison)}</span></div>}
                      <div className="flex justify-between font-bold pt-1 border-t text-sm"><span>Total transport</span><span>{formatMontant(stdResult.total)} HT</span></div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════ CALCULATEUR ══════════ */}
      {pageTab === 'calcul' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-600" />
                Calculateur frais de port
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CarrierSelector
                value={selectedCarrier}
                onChange={k => {
                  setSelectedCarrier(k);
                  setCoeff(BAREMES_TRANSPORT[k].coeffDefaut);
                  setCoeffExpress(BAREMES_TRANSPORT[k].coeffExpressDefaut);
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Poids total (kg)</Label>
                  <Input
                    type="number" step="0.1" min="0"
                    value={poids || ''}
                    onChange={e => setPoids(parseFloat(e.target.value) || 0)}
                    placeholder="Ex: 25"
                  />
                </div>
                <div>
                  <Label>Nombre de colis</Label>
                  <Input
                    type="number" min="1"
                    value={nbColis}
                    onChange={e => setNbColis(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div>
                  <Label>Coefficient</Label>
                  <Input
                    type="number" step="0.1" min="0.1"
                    value={coeff}
                    onChange={e => setCoeff(parseFloat(e.target.value) || 1)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={express} onChange={e => setExpress(e.target.checked)} className="rounded" />
                  <span className="text-sm font-medium">Express J+1</span>
                </label>
                {express && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Coeff. Express</Label>
                    <Input
                      type="number" step="0.1" min="1"
                      value={coeffExpress}
                      onChange={e => setCoeffExpress(parseFloat(e.target.value) || 1)}
                      className="h-8 text-sm w-20"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Département départ</Label>
                  <Input
                    type="text" maxLength={3}
                    value={deptDepart}
                    onChange={e => setDeptDepart(e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase())}
                    placeholder="76"
                  />
                </div>
                <div>
                  <Label>Département livraison</Label>
                  <Input
                    type="text" maxLength={3}
                    value={deptLivraison}
                    onChange={e => setDeptLivraison(e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase())}
                    placeholder="Ex: 13"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <Label className="text-muted-foreground text-xs mb-1">Distance estimée</Label>
                  <div className="h-10 flex items-center gap-1.5 px-3 rounded-md bg-muted text-sm">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {distanceKm !== null
                      ? <span className="font-medium">{distanceKm} km</span>
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col justify-end">
                  <Label className="text-muted-foreground text-xs mb-1">Tarif brut {calcConfig.label}</Label>
                  <div className="h-10 flex items-center px-3 rounded-md bg-muted text-sm">
                    {resultat.prix !== null
                      ? formatMontant(resultat.prix)
                      : <span className="text-amber-600 text-sm font-medium">Hors barème</span>}
                  </div>
                </div>
                <div className="flex flex-col justify-end">
                  <Label className="text-muted-foreground text-xs mb-1">
                    Tarif final (× {coeff}{express ? ` × ${coeffExpress} express` : ''})
                  </Label>
                  <div className="h-10 flex items-center px-3 rounded-md bg-muted font-bold text-lg">
                    {prixFinal !== null
                      ? formatMontant(prixFinal)
                      : <span className="text-amber-600 text-sm font-medium">Sur devis</span>}
                  </div>
                </div>
              </div>
              {nbColis > 1 && poids > 0 && (
                <p className="text-xs text-muted-foreground">
                  Poids par colis : <span className="font-medium">{(poids / nbColis).toFixed(2)} kg</span> · Palier : {resultat.palier} × {nbColis} colis
                </p>
              )}
              {nbColis === 1 && poids > 0 && (
                <p className="text-xs text-muted-foreground">Palier : {resultat.palier}</p>
              )}
            </CardContent>
          </Card>

          {/* Barème affiché en lecture seule sous le calculateur */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Barème {calcConfig.label} (tarifs par colis)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Poids</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Tarif HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcConfig.bareme.map((b, i) => {
                      const isActive = poids > 0 && nbColis >= 1 && (() => {
                        const poidsColis = nbColis > 1 ? poids / nbColis : poids;
                        return poidsColis > b.min && poidsColis <= b.max;
                      })();
                      return (
                        <tr key={i} className={`border-b border-border/50 ${isActive ? 'bg-primary/10 font-semibold' : ''}`}>
                          <td className="py-2 px-3">
                            {b.max === Infinity ? `> ${b.min} kg` : `${b.min} – ${b.max} kg`}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {b.prix !== null ? formatMontant(b.prix) : <span className="text-amber-600">Sur devis</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ══════════ BARÈMES ══════════ */}
      {pageTab === 'baremes' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-600" />
              Barèmes transporteurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CarrierSelector value={baremeCarrier} onChange={k => { setBaremeCarrier(k); setEditIdx(null); }} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetBareme(baremeCarrier)}
                className="gap-1.5 text-muted-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Poids</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Tarif HT</th>
                    <th className="w-20 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customBaremes[baremeCarrier].map((b, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-2 px-3">
                        {b.max === Infinity ? `> ${b.min} kg` : `${b.min} – ${b.max} kg`}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {editIdx === i ? (
                          <Input
                            value={editPrix}
                            onChange={e => setEditPrix(e.target.value)}
                            className="h-7 w-24 text-right ml-auto"
                            placeholder="Sur devis"
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') setEditIdx(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          b.prix !== null
                            ? <span className="font-medium">{formatMontant(b.prix)}</span>
                            : <span className="text-amber-600">Sur devis</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {editIdx === i ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={saveEdit}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditIdx(null)}
                              className="p-1 text-muted-foreground hover:bg-muted rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <button
                              onClick={() => startEdit(i)}
                              className="p-1 text-muted-foreground hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Cliquez sur une ligne pour modifier le tarif. Les modifications sont sauvegardées localement (ce navigateur).
              Utilisez "Réinitialiser" pour revenir aux tarifs par défaut.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ══════════ ACHAT ══════════ */}
      {pageTab === 'achat' && (
        <div className="space-y-6">

          {/* ── Zone glisser-déposer document ── */}
          <div
            ref={dropZoneRef}
            onDragOver={e => { e.preventDefault(); setDropZoneDragging(true); }}
            onDragLeave={() => setDropZoneDragging(false)}
            onDrop={onDropZone}
            onClick={() => !extracting && fileInputRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 transition-all cursor-pointer select-none',
              dropZoneDragging
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
              extracting && 'pointer-events-none opacity-80',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleDocumentFile(f); e.target.value = ''; }}
            />
            {extracting ? (
              <>
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <div className="text-center">
                  <p className="font-medium text-sm">Analyse en cours…</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{extractedFile}</p>
                </div>
              </>
            ) : dropZoneDragging ? (
              <>
                <FileText className="w-10 h-10 text-primary" />
                <p className="font-semibold text-primary">Déposer le document</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <FileText className="w-7 h-7 text-muted-foreground" />
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm">Glissez une facture ou lettre de voiture</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PDF · TXT — l'IA extrait automatiquement transporteur, poids, prix, départements</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1 gap-1.5 pointer-events-none"
                >
                  <Plus className="w-3.5 h-3.5" /> Choisir un fichier
                </Button>
              </>
            )}
          </div>

          {/* ── En-tête + bouton ajouter manuellement ── */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-base">Historique des prix achat transport</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Renseignez les prix réels payés aux transporteurs — classés par poids et distance.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAchatFormOpen(v => !v)} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Saisie manuelle
            </Button>
          </div>

          {/* ── Formulaire ajout ── */}
          {achatFormOpen && (
            <Card className="border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Nouvelle entrée
                  <button onClick={() => setAchatFormOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={achatForm.date || ''} onChange={e => setAchatForm(f => ({ ...f, date: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Transporteur</Label>
                    <Input placeholder="ex : UPS, Heppner…" value={achatForm.transporteur || ''} onChange={e => setAchatForm(f => ({ ...f, transporteur: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Poids (kg) *</Label>
                    <Input type="number" min={0} step={0.1} placeholder="ex : 120" value={achatForm.poidsKg ?? ''} onChange={e => setAchatForm(f => ({ ...f, poidsKg: parseFloat(e.target.value) || undefined }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Prix achat HT (€) *</Label>
                    <Input type="number" min={0} step={0.01} placeholder="ex : 87.00" value={achatForm.prixHT ?? ''} onChange={e => setAchatForm(f => ({ ...f, prixHT: parseFloat(e.target.value) || undefined }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dépt. départ</Label>
                    <Input maxLength={3} placeholder="76" value={achatForm.deptDepart || ''} onChange={e => setAchatForm(f => ({ ...f, deptDepart: e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase() }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dépt. arrivée</Label>
                    <Input maxLength={3} placeholder="ex : 13" value={achatForm.deptArrivee || ''} onChange={e => setAchatForm(f => ({ ...f, deptArrivee: e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase() }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Distance (km)</Label>
                    <div className="h-8 flex items-center gap-1.5 px-3 rounded-md bg-muted text-xs">
                      <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                      {achatDistanceCalc !== null
                        ? <span className="font-medium text-foreground">{achatDistanceCalc} km</span>
                        : <span className="text-muted-foreground">auto</span>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Réf. commande</Label>
                    <Input placeholder="ex : CF-2024-012" value={achatForm.reference || ''} onChange={e => setAchatForm(f => ({ ...f, reference: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-3 md:col-span-4">
                    <Label className="text-xs">Note</Label>
                    <Input placeholder="ex : Tarif négocié hors barème palette…" value={achatForm.note || ''} onChange={e => setAchatForm(f => ({ ...f, note: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => setAchatFormOpen(false)}>Annuler</Button>
                  <Button size="sm" onClick={saveAchat} className="gap-1.5"><Check className="w-3.5 h-3.5" /> Enregistrer</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Tableau historique ── */}
          <Card>
            <CardContent className="p-0">
              {achats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground">
                  <Truck className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Aucune entrée — cliquez sur "Ajouter une entrée" pour commencer.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="w-8 px-2" />
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort('date')}>
                          Date {achatSortBy === 'date' ? (achatSortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Transporteur</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort('poids')}>
                          Poids {achatSortBy === 'poids' ? (achatSortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort('distance')}>
                          Distance {achatSortBy === 'distance' ? (achatSortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Dépt.</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort('prix')}>
                          Prix achat HT {achatSortBy === 'prix' ? (achatSortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">€/kg</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Réf.</th>
                        <th className="w-8 px-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {achatsSorted.map((a, si) => {
                        const realIdx = achats.findIndex(x => x.id === a.id);
                        const eurosPerKg = a.poidsKg > 0 ? a.prixHT / a.poidsKg : null;
                        const tranche = TRANCHES_POIDS.find(t => a.poidsKg >= t.min && a.poidsKg <= t.max);
                        return (
                          <tr
                            key={a.id}
                            draggable
                            onDragStart={() => onDragStartAchat(si)}
                            onDragOver={e => onDragOverAchat(e, si)}
                            onDrop={() => onDropAchat(si)}
                            onDragEnd={() => setDragOverAchat(null)}
                            className={cn(
                              'hover:bg-muted/30 transition-colors group cursor-grab active:cursor-grabbing',
                              dragOverAchat === si && 'bg-primary/5 border-t-2 border-primary',
                            )}
                          >
                            <td className="px-2 py-2 text-center text-muted-foreground/40 group-hover:text-muted-foreground">
                              <GripVertical className="w-3.5 h-3.5" />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{a.date}</td>
                            <td className="px-3 py-2 font-medium">{a.transporteur || <span className="text-muted-foreground italic">—</span>}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <span className="font-medium">{a.poidsKg} kg</span>
                              {tranche && <span className="ml-1 text-muted-foreground opacity-60">({tranche.label})</span>}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {a.distanceKm != null ? <span className="flex items-center justify-end gap-1"><MapPin className="w-3 h-3 text-muted-foreground" />{a.distanceKm} km</span> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {a.deptDepart || a.deptArrivee ? `${a.deptDepart || '?'} → ${a.deptArrivee || '?'}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatMontant(a.prixHT)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                              {eurosPerKg !== null ? `${eurosPerKg.toFixed(2)} €` : '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate" title={[a.reference, a.note].filter(Boolean).join(' — ')}>
                              {[a.reference, a.note].filter(Boolean).join(' — ') || '—'}
                            </td>
                            <td className="px-2 py-2">
                              <button onClick={() => deleteAchat(a.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive rounded transition-opacity">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground px-3 py-2 border-t">
                    {achats.length} entrée{achats.length > 1 ? 's' : ''} — glisser-déposer pour réordonner, cliquer les en-têtes pour trier
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Statistiques par tranche ── */}
          {achats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Moyennes par tranche de poids
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tranche</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Nb entrées</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Min</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Moy.</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Max</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {achatStats.map(s => (
                        <tr key={s.label} className={s.count === 0 ? 'opacity-40' : ''}>
                          <td className="px-4 py-2 font-medium">{s.label}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{s.count}</td>
                          <td className="px-4 py-2 text-right">{s.min !== null ? formatMontant(s.min) : '—'}</td>
                          <td className="px-4 py-2 text-right font-semibold text-primary">{s.avg !== null ? formatMontant(Math.round(s.avg * 100) / 100) : '—'}</td>
                          <td className="px-4 py-2 text-right">{s.max !== null ? formatMontant(s.max) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══════════ SAISIE MANUELLE ══════════ */}
      {pageTab === 'manuel' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-600" />
              Saisie manuelle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-sm">
            <p className="text-sm text-muted-foreground">
              Saisir un tarif transport connu (hors barème, devis transporteur, tarif négocié…).
            </p>
            <div className="space-y-1.5">
              <Label>Prix HT transporteur (€)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="ex : 87.00"
                value={manuelPrix}
                onChange={e => setManuelPrix(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coefficient de marge</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={manuelCoeff}
                onChange={e => setManuelCoeff(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note / référence <span className="text-muted-foreground font-normal text-xs">(optionnel)</span></Label>
              <Input
                placeholder="ex : Devis UPS hors barème, palette 1 200 kg"
                value={manuelNote}
                onChange={e => setManuelNote(e.target.value)}
              />
            </div>

            {manuelPrixNum > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-2 mt-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Prix brut</span>
                  <span>{formatMontant(manuelPrixNum)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Coefficient</span>
                  <span>× {manuelCoeffNum}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total HT</span>
                  <span>{formatMontant(manuelTotal)}</span>
                </div>
                {manuelNote && (
                  <p className="text-xs text-muted-foreground pt-1">{manuelNote}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
