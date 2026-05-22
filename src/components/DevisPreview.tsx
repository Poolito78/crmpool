import { useState, useRef, Fragment, useEffect, useCallback } from 'react';
import { type Devis, type Client, type Produit, calculerTotalLigne, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { Printer, Pencil, Loader2, Send, FolderOpen, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logoIsofloor from '@/assets/logo-isofloor.png';
import { savePdfFromElement, getStoredDirHandle, writeFileToFolder, generatePdfFromElement, storeDirHandle } from '@/lib/pdfFolder';
import { toast } from 'sonner';
import { genererScriptOdoo, promptOdooPartnerName } from '@/lib/odooSync';
import { getRalInfo } from '@/lib/ralColors';
import { supabase } from '@/integrations/supabase/client';

// ─── Couleurs RAL Classic — conservé pour compatibilité (utilise ralColors.ts) ─
const RAL_COLORS: Record<string, { hex: string; dark: boolean; white?: boolean }> = {
  '1000':{ hex:'#CDB77F', dark:false }, '1001':{ hex:'#C8A86B', dark:false }, '1002':{ hex:'#C99840', dark:false }, '1003':{ hex:'#F9A800', dark:false },
  '1004':{ hex:'#E49300', dark:false }, '1005':{ hex:'#CB7B28', dark:true  }, '1006':{ hex:'#E2781E', dark:true  }, '1007':{ hex:'#E7831A', dark:true  },
  '1011':{ hex:'#AF7C36', dark:true  }, '1012':{ hex:'#E0C12A', dark:false }, '1013':{ hex:'#EDE3CE', dark:false }, '1014':{ hex:'#DED09E', dark:false },
  '1015':{ hex:'#E6D2AE', dark:false }, '1016':{ hex:'#EACC00', dark:false }, '1017':{ hex:'#F4A100', dark:false }, '1018':{ hex:'#F4DC00', dark:false },
  '1019':{ hex:'#9E8E78', dark:true  }, '1020':{ hex:'#BAAC74', dark:false }, '1021':{ hex:'#F4CA00', dark:false }, '1023':{ hex:'#FFC000', dark:false },
  '1024':{ hex:'#B89050', dark:true  }, '1026':{ hex:'#FFFF00', dark:false }, '1027':{ hex:'#A88332', dark:true  }, '1028':{ hex:'#FF9B00', dark:false },
  '1032':{ hex:'#E4AC00', dark:false }, '1033':{ hex:'#F4800A', dark:true  }, '1034':{ hex:'#EBA850', dark:false }, '1035':{ hex:'#9E8850', dark:true  },
  '1036':{ hex:'#786030', dark:true  }, '1037':{ hex:'#E88000', dark:true  },
  '2000':{ hex:'#D46800', dark:true  }, '2001':{ hex:'#BE3C00', dark:true  }, '2002':{ hex:'#CB2A00', dark:true  }, '2003':{ hex:'#E45C20', dark:true  },
  '2004':{ hex:'#E44800', dark:true  }, '2005':{ hex:'#FF2800', dark:true  }, '2007':{ hex:'#FFA000', dark:false }, '2008':{ hex:'#D04010', dark:true  },
  '2009':{ hex:'#E04400', dark:true  }, '2010':{ hex:'#D05828', dark:true  }, '2011':{ hex:'#E06000', dark:true  }, '2012':{ hex:'#CC5434', dark:true  },
  '2013':{ hex:'#983428', dark:true  },
  '3000':{ hex:'#AA2010', dark:true  }, '3001':{ hex:'#9C1C10', dark:true  }, '3002':{ hex:'#9C1C18', dark:true  }, '3003':{ hex:'#801010', dark:true  },
  '3004':{ hex:'#701014', dark:true  }, '3005':{ hex:'#5C1014', dark:true  }, '3007':{ hex:'#3C0C10', dark:true  }, '3009':{ hex:'#6C3028', dark:true  },
  '3011':{ hex:'#782020', dark:true  }, '3012':{ hex:'#C49080', dark:true  }, '3013':{ hex:'#902820', dark:true  }, '3014':{ hex:'#C48080', dark:true  },
  '3015':{ hex:'#D4A0A0', dark:false }, '3016':{ hex:'#A03428', dark:true  }, '3017':{ hex:'#C44050', dark:true  }, '3018':{ hex:'#C43050', dark:true  },
  '3020':{ hex:'#CC0000', dark:true  }, '3022':{ hex:'#D46858', dark:true  }, '3024':{ hex:'#FF2020', dark:true  }, '3026':{ hex:'#FF2020', dark:true  },
  '3027':{ hex:'#AC1440', dark:true  }, '3028':{ hex:'#CC2020', dark:true  }, '3031':{ hex:'#AC3030', dark:true  }, '3032':{ hex:'#701414', dark:true  },
  '3033':{ hex:'#C44030', dark:true  },
  '4001':{ hex:'#886090', dark:true  }, '4002':{ hex:'#943054', dark:true  }, '4003':{ hex:'#CE4090', dark:true  }, '4004':{ hex:'#641040', dark:true  },
  '4005':{ hex:'#8060A0', dark:true  }, '4006':{ hex:'#982070', dark:true  }, '4007':{ hex:'#4C1048', dark:true  }, '4008':{ hex:'#803080', dark:true  },
  '4009':{ hex:'#A07898', dark:true  }, '4010':{ hex:'#BE3090', dark:true  }, '4011':{ hex:'#806898', dark:true  }, '4012':{ hex:'#6C6080', dark:true  },
  '5000':{ hex:'#2E4D8C', dark:true  }, '5001':{ hex:'#1C4068', dark:true  }, '5002':{ hex:'#1428A0', dark:true  }, '5003':{ hex:'#1E3060', dark:true  },
  '5004':{ hex:'#141828', dark:true  }, '5005':{ hex:'#1040A0', dark:true  }, '5007':{ hex:'#3C6090', dark:true  }, '5008':{ hex:'#243040', dark:true  },
  '5009':{ hex:'#285080', dark:true  }, '5010':{ hex:'#0C4080', dark:true  }, '5011':{ hex:'#1C2444', dark:true  }, '5012':{ hex:'#3478B8', dark:true  },
  '5013':{ hex:'#1C2C60', dark:true  }, '5014':{ hex:'#6078A8', dark:true  }, '5015':{ hex:'#1470C0', dark:true  }, '5017':{ hex:'#0858A0', dark:true  },
  '5018':{ hex:'#3C8888', dark:true  }, '5019':{ hex:'#1C5C90', dark:true  }, '5020':{ hex:'#1C3840', dark:true  }, '5021':{ hex:'#287880', dark:true  },
  '5022':{ hex:'#201C60', dark:true  }, '5023':{ hex:'#3C5888', dark:true  }, '5024':{ hex:'#6090B0', dark:true  }, '5025':{ hex:'#2C6878', dark:true  },
  '5026':{ hex:'#10304C', dark:true  },
  '6000':{ hex:'#3C7060', dark:true  }, '6001':{ hex:'#286030', dark:true  }, '6002':{ hex:'#286428', dark:true  }, '6003':{ hex:'#4C5840', dark:true  },
  '6004':{ hex:'#1C4440', dark:true  }, '6005':{ hex:'#1C3C28', dark:true  }, '6006':{ hex:'#303828', dark:true  }, '6007':{ hex:'#28361C', dark:true  },
  '6008':{ hex:'#30301C', dark:true  }, '6009':{ hex:'#243018', dark:true  }, '6010':{ hex:'#447828', dark:true  }, '6011':{ hex:'#6C8C50', dark:true  },
  '6012':{ hex:'#303C34', dark:true  }, '6013':{ hex:'#8C8C60', dark:true  }, '6014':{ hex:'#484840', dark:true  }, '6015':{ hex:'#3C3C30', dark:true  },
  '6016':{ hex:'#1C7048', dark:true  }, '6017':{ hex:'#487830', dark:true  }, '6018':{ hex:'#5C9030', dark:true  }, '6019':{ hex:'#C0D8A8', dark:false },
  '6020':{ hex:'#304428', dark:true  }, '6021':{ hex:'#7C9868', dark:true  }, '6022':{ hex:'#3C3018', dark:true  }, '6024':{ hex:'#308050', dark:true  },
  '6025':{ hex:'#487038', dark:true  }, '6026':{ hex:'#1C5840', dark:true  }, '6027':{ hex:'#80C8C0', dark:false }, '6028':{ hex:'#2C5430', dark:true  },
  '6029':{ hex:'#1C7830', dark:true  }, '6032':{ hex:'#287850', dark:true  }, '6033':{ hex:'#408880', dark:true  }, '6034':{ hex:'#80C0B8', dark:false },
  '6035':{ hex:'#1C4A20', dark:true  }, '6036':{ hex:'#1C5048', dark:true  }, '6037':{ hex:'#008040', dark:true  }, '6038':{ hex:'#00C840', dark:false },
  '7000':{ hex:'#788C90', dark:true  }, '7001':{ hex:'#8C9898', dark:true  }, '7002':{ hex:'#808070', dark:true  }, '7003':{ hex:'#787868', dark:true  },
  '7004':{ hex:'#989898', dark:true  }, '7005':{ hex:'#686C64', dark:true  }, '7006':{ hex:'#747060', dark:true  }, '7008':{ hex:'#6C6040', dark:true  },
  '7009':{ hex:'#5C6058', dark:true  }, '7010':{ hex:'#585C54', dark:true  }, '7011':{ hex:'#505860', dark:true  }, '7012':{ hex:'#585C60', dark:true  },
  '7013':{ hex:'#585448', dark:true  }, '7015':{ hex:'#50545C', dark:true  }, '7016':{ hex:'#383E44', dark:true  }, '7021':{ hex:'#2C3038', dark:true  },
  '7022':{ hex:'#4C4C48', dark:true  }, '7023':{ hex:'#808078', dark:true  }, '7024':{ hex:'#484C54', dark:true  }, '7026':{ hex:'#384044', dark:true  },
  '7030':{ hex:'#989080', dark:true  }, '7031':{ hex:'#606870', dark:true  }, '7032':{ hex:'#B8B4A0', dark:false }, '7033':{ hex:'#888C7C', dark:true  },
  '7034':{ hex:'#908C70', dark:true  }, '7035':{ hex:'#C8C8C0', dark:false }, '7036':{ hex:'#A0949C', dark:true  }, '7037':{ hex:'#7C7C7C', dark:true  },
  '7038':{ hex:'#B4B4A8', dark:false }, '7039':{ hex:'#6C6860', dark:true  }, '7040':{ hex:'#9898A4', dark:true  }, '7042':{ hex:'#8C8C8C', dark:true  },
  '7043':{ hex:'#545454', dark:true  }, '7044':{ hex:'#C0BCB0', dark:false }, '7045':{ hex:'#909090', dark:true  }, '7046':{ hex:'#808088', dark:true  },
  '7047':{ hex:'#C8C8C8', dark:false }, '7048':{ hex:'#888078', dark:true  },
  '8000':{ hex:'#886040', dark:true  }, '8001':{ hex:'#985028', dark:true  }, '8002':{ hex:'#784848', dark:true  }, '8003':{ hex:'#7C4820', dark:true  },
  '8004':{ hex:'#8C4830', dark:true  }, '8007':{ hex:'#6C4028', dark:true  }, '8008':{ hex:'#7C5030', dark:true  }, '8009':{ hex:'#604034', dark:true  },
  '8010':{ hex:'#5C3828', dark:true  }, '8011':{ hex:'#4C2C20', dark:true  }, '8012':{ hex:'#642424', dark:true  }, '8014':{ hex:'#402820', dark:true  },
  '8015':{ hex:'#602420', dark:true  }, '8016':{ hex:'#482420', dark:true  }, '8017':{ hex:'#402020', dark:true  }, '8019':{ hex:'#382C28', dark:true  },
  '8022':{ hex:'#201818', dark:true  }, '8023':{ hex:'#A04820', dark:true  }, '8024':{ hex:'#7C5038', dark:true  }, '8025':{ hex:'#7C6050', dark:true  },
  '8028':{ hex:'#483828', dark:true  }, '8029':{ hex:'#7C3C28', dark:true  },
  '9001':{ hex:'#ECDCCC', dark:false, white:true }, '9002':{ hex:'#E0D8D0', dark:false }, '9003':{ hex:'#F0EEE8', dark:false, white:true }, '9004':{ hex:'#2C2C2C', dark:true  },
  '9005':{ hex:'#0C0C0C', dark:true  }, '9006':{ hex:'#A0A0A0', dark:false }, '9007':{ hex:'#888888', dark:true  }, '9010':{ hex:'#F4F0E8', dark:false, white:true },
  '9011':{ hex:'#1C1C1C', dark:true  }, '9016':{ hex:'#F4F4F0', dark:false, white:true }, '9017':{ hex:'#1C1C1C', dark:true  }, '9018':{ hex:'#D8D8D0', dark:false },
  '9022':{ hex:'#909088', dark:true  }, '9023':{ hex:'#808080', dark:true  },
};

function getRalStyle(text: string): { backgroundColor: string; color: string; border?: string; ralNum: string } | undefined {
  const m = text.match(/(\d{4})/);
  if (!m) return undefined;
  const c = RAL_COLORS[m[1]];
  if (!c) return undefined;
  return {
    backgroundColor: c.hex,
    color: c.dark ? '#ffffff' : '#1a1a1a',
    ralNum: m[1],
    ...(c.white ? { border: '1px solid #ccc' } : {}),
  };
}

interface Props {
  devis: Devis;
  client?: Client;
  produits?: Produit[];
  onEdit?: () => void;
  hideControls?: boolean;
  initialShowConso?: boolean;
  initialShowRemise?: boolean;
  initialShowComposants?: boolean;
  initialShowKgRecap?: boolean;
  onOptionsChange?: (opts: { showConso: boolean; showRemise: boolean; showComposants: boolean; showKgRecap: boolean }) => void;
  onPrint?: () => void;
  lineImages?: Record<string, { url: string; name: string }[]>;
}

export default function DevisPreview({ devis, client, produits = [], onEdit, hideControls = false, initialShowConso = false, initialShowRemise = false, initialShowComposants = false, initialShowKgRecap = true, onOptionsChange, onPrint, lineImages = {} }: Props) {
  const [showConso, setShowConso] = useState(initialShowConso);
  const [showRemise, setShowRemise] = useState(initialShowRemise);
  const [showComposants, setShowComposants] = useState(initialShowComposants);
  const [showKgRecap, setShowKgRecap] = useState(initialShowKgRecap);
  const [printing, setPrinting] = useState(false);
  const [pdfMode, setPdfMode] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [pdfDialog, setPdfDialog] = useState(false);
  const [pdfFileName, setPdfFileName] = useState('');
  const [savedFolderName, setSavedFolderName] = useState<string | null>(null);
  const [surfaceGlobale, setSurfaceGlobale] = useState<number>(devis.surfaceGlobaleM2 || 0);
  // surfacesParLigne : overrides individuels seulement — {} par défaut → fallback sur surfaceGlobale
  const [surfacesParLigne, setSurfacesParLigne] = useState<Record<string, number>>({});
  // Images associées aux lignes (fetched depuis Supabase + merged avec lineImages prop)
  const [fetchedLineImages, setFetchedLineImages] = useState<Record<string, { url: string; name: string }[]>>({});
  const loadLineImages = useCallback(async () => {
    if (!devis.id || devis.id === 'preview') return;
    const { data } = await supabase
      .from('devis_pieces_jointes')
      .select('ligne_id, fichier_url, fichier_nom, fichier_mime')
      .eq('devis_id', devis.id)
      .eq('type', 'fichier')
      .not('ligne_id', 'is', null);
    if (!data) return;
    const map: Record<string, { url: string; name: string }[]> = {};
    for (const row of data) {
      if (!row.ligne_id || !row.fichier_mime?.startsWith('image/')) continue;
      if (!map[row.ligne_id]) map[row.ligne_id] = [];
      map[row.ligne_id].push({ url: row.fichier_url ?? '', name: row.fichier_nom ?? '' });
    }
    setFetchedLineImages(map);
  }, [devis.id]);
  useEffect(() => { loadLineImages(); }, [loadLineImages]);
  function getSurfaceLigne(ligneId: string): number {
    if (surfacesParLigne[ligneId] !== undefined) return surfacesParLigne[ligneId];
    const ligne = devis.lignes.find(l => l.id === ligneId);
    return ligne?.surfaceM2 || 0;
  }
  function setSurface(ligneId: string, val: number) {
    setSurfacesParLigne(prev => ({ ...prev, [ligneId]: val }));
  }
  function updateSurfaceGlobale(val: number) {
    setSurfaceGlobale(val);
    // Pré-remplit uniquement les lignes sans surface individuelle déjà saisie
    setSurfacesParLigne(prev => {
      const next = { ...prev };
      for (const l of devis.lignes) {
        if (!next[l.id] && !l.surfaceM2) next[l.id] = val;
      }
      return next;
    });
  }

  // Calcul des totaux avec les surfaces locales (pour recalcul qté si surface mode)
  const lignesEffectives = devis.lignes.filter(l => l.type !== 'groupe' && l.type !== 'soustotal' && l.type !== 'texte').map(l => {
    const surface = getSurfaceLigne(l.id);
    if (!showConso || !surface) return l;
    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
    // Pour les produits composites, ne pas recalculer la quantité depuis la surface
    const isComposite = !!(prod?.composants && prod.composants.length > 0);
    if (isComposite) return { ...l, surfaceM2: surface };
    const conso = l.consommation || prod?.consommation || 0;
    const poids = prod?.poids || 1;
    if (conso && poids) {
      // Math.ceil identique à calcQuantiteSurface dans Devis.tsx → totaux cohérents
      const newQty = Math.ceil(surface * conso / poids);
      return { ...l, surfaceM2: surface, quantite: newQty > 0 ? newQty : l.quantite };
    }
    return { ...l, surfaceM2: surface };
  });

  const totals = calculerTotalDevis(lignesEffectives, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);
  // Fusion : prop lineImages (session courante) + fetchedLineImages (Supabase persisté)
  // lineImages prend priorité (contient les URLs fraîches de la session)
  const allLineImages: Record<string, { url: string; name: string }[]> = {};
  for (const [k, v] of Object.entries(fetchedLineImages)) allLineImages[k] = [...v];
  for (const [k, v] of Object.entries(lineImages)) {
    if (v.length > 0) allLineImages[k] = v; // remplace complètement (URLs session = plus à jour)
  }

  const poidsTotal = lignesEffectives.reduce((sum, l) => {
    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
    return sum + (prod?.poids || 0) * l.quantite;
  }, 0);

  const accentMap: Record<string, string> = {
    'é':'e','è':'e','ê':'e','ë':'e','à':'a','â':'a','ä':'a',
    'ù':'u','û':'u','ü':'u','ô':'o','ö':'o','î':'i','ï':'i','ç':'c',
    'É':'E','È':'E','Ê':'E','À':'A','Â':'A','Ù':'U','Û':'U','Ô':'O','Î':'I','Ç':'C',
  };
  const sanitize = (s: string) =>
    s.split('').map(c => accentMap[c] ?? c).join('')
      .replace(/[^a-zA-Z0-9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  function buildFileName() {
    const societe = client?.societe || client?.nom || '';
    const parts: string[] = ['Devis', devis.numero];
    if (societe) parts.push(sanitize(societe));
    if (devis.referenceAffaire) parts.push(sanitize(devis.referenceAffaire));
    return parts.join('_') + '.pdf';
  }

  // Ouvre la dialog de confirmation PDF
  async function handlePrint() {
    const folderHandle = await getStoredDirHandle();
    let folderName: string | null = null;
    if (folderHandle) {
      try {
        // @ts-expect-error – requestPermission pas encore dans les types DOM
        const perm = await folderHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') folderName = folderHandle.name;
      } catch { /* ignore */ }
    }
    setSavedFolderName(folderName);
    setPdfFileName(buildFileName());
    setPdfDialog(true);
  }

  // Sélectionne le dossier — appel direct sans délai pour conserver la transient user activation
  async function handlePickFolder() {
    if (!('showDirectoryPicker' in window)) { toast.error('Non supporté par ce navigateur'); return; }
    try {
      const dirHandle = await (window as typeof window & { showDirectoryPicker: (opts?: object) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await storeDirHandle(dirHandle);
      setSavedFolderName(dirHandle.name);
      toast.success(`Dossier sélectionné : ${dirHandle.name}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      toast.error(`Erreur dossier: ${msg}`);
      console.error('showDirectoryPicker error:', err);
    }
  }

  // Génère et sauvegarde le PDF après confirmation
  async function confirmGeneratePdf(forcePickFolder = false) {
    if (!printAreaRef.current) return;
    setPdfDialog(false);
    setPrinting(true);
    setPdfMode(true);
    await new Promise(resolve => setTimeout(resolve, 80));

    try {
      const fileName = pdfFileName || buildFileName();
      const logoDataUrl: string | null = await fetch(logoIsofloor)
        .then(r => r.blob())
        .then(blob => new Promise<string>(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        }))
        .catch(() => null);
      const refDate = devis.dateEnvoi || devis.dateCreation;

      const base64 = await generatePdfFromElement(printAreaRef.current, {
        devisNumero: devis.numero,
        devisDate: refDate ? formatDate(refDate) : undefined,
        logoDataUrl: logoDataUrl ?? undefined,
      });
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

      const res = await writeFileToFolder(fileName, bytes, forcePickFolder);
      if (res.ok) {
        toast.success(`PDF sauvegardé dans "${res.folderName}"`, { description: fileName, duration: 6000 });
        setSavedFolderName(res.folderName ?? null);
      } else {
        toast.success('PDF généré', { description: fileName, duration: 4000 });
      }
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setPdfMode(false);
      setPrinting(false);
    }

    if (onPrint) onPrint();
  }

  return (
    <div className="flex flex-col min-h-0">

      {/* ── Dialog confirmation PDF ── */}
      <Dialog open={pdfDialog} onOpenChange={setPdfDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Générer le PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Nom du fichier</Label>
              <Input
                value={pdfFileName}
                onChange={e => setPdfFileName(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Dossier d'enregistrement</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-9 rounded-md border border-input bg-muted/40 px-3 flex items-center text-sm text-muted-foreground truncate">
                  {savedFolderName
                    ? <><FolderOpen className="w-4 h-4 mr-2 shrink-0 text-amber-500" />{savedFolderName}</>
                    : <span className="italic">Aucun dossier sélectionné</span>
                  }
                </div>
                <Button variant="outline" size="sm" onClick={handlePickFolder}>
                  <FolderOpen className="w-4 h-4 mr-1.5" />
                  Changer
                </Button>
              </div>
              {!savedFolderName && (
                <p className="text-xs text-muted-foreground mt-1">Un sélecteur de dossier s'ouvrira lors de la génération.</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPdfDialog(false)}>Annuler</Button>
            <Button onClick={() => confirmGeneratePdf(false)}>
              <Printer className="w-4 h-4 mr-1.5" />
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Barre de contrôles — masquée pour la génération PDF */}
      {!hideControls && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card print:hidden flex-wrap sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-wrap flex-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input type="checkbox" checked={showConso} onChange={e => { setShowConso(e.target.checked); onOptionsChange?.({ showConso: e.target.checked, showRemise, showComposants, showKgRecap }); }} className="rounded" />
              m²/conso
            </label>
            {showConso && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Surface :
                  <input
                    type="number" min={0} step={1}
                    value={surfaceGlobale || ''}
                    onChange={e => updateSurfaceGlobale(parseFloat(e.target.value) || 0)}
                    placeholder="m²"
                    className="w-16 text-right border border-border rounded px-1.5 py-0.5 text-xs bg-background text-foreground"
                  />
                  m²
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input type="checkbox" checked={showKgRecap} onChange={e => { setShowKgRecap(e.target.checked); onOptionsChange?.({ showConso, showRemise, showComposants, showKgRecap: e.target.checked }); }} className="rounded" />
                  Récap. KG
                </label>
              </>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input type="checkbox" checked={showRemise} onChange={e => { setShowRemise(e.target.checked); onOptionsChange?.({ showConso, showRemise: e.target.checked, showComposants, showKgRecap }); }} className="rounded" />
              Remise
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input type="checkbox" checked={showComposants} onChange={e => { setShowComposants(e.target.checked); onOptionsChange?.({ showConso, showRemise, showComposants: e.target.checked, showKgRecap }); }} className="rounded" />
              Composants
            </label>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Modifier
              </Button>
            )}
            {client && (
              <Button
                variant="outline"
                size="sm"
                title="Générer le script Odoo et le copier dans le presse-papier"
                onClick={async () => {
                  try {
                    const defaultName = client.societe || client.nom;
                    const odooNom = promptOdooPartnerName(devis.clientId, defaultName);
                    if (odooNom === null) return; // annulé
                    const contact = devis.contactId
                      ? client.contacts?.find(c => c.id === devis.contactId)
                      : undefined;
                    const contactNom = contact
                      ? [contact.prenom, contact.nom].filter(Boolean).join(' ')
                      : undefined;
                    const script = genererScriptOdoo(devis, client, produits, {
                      surface: surfaceGlobale || devis.surfaceGlobaleM2 || 0,
                      contactNom,
                      odooPartnerName: odooNom,
                    });
                    await navigator.clipboard.writeText(script);
                    toast.success('Script Odoo copié !', {
                      description: 'Ouvre Odoo → F12 → Console → Ctrl+V → Ctrl+Entrée',
                      duration: 6000,
                    });
                  } catch (err) {
                    toast.error('Erreur lors de la génération du script');
                    console.error(err);
                  }
                }}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" /> Odoo
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
      <div className="px-10 pb-7 text-sm" style={{ paddingTop: '1rem', position: 'relative' }} id="devis-print" ref={printAreaRef}>
        {/* Espace libre en haut pour impression (entête papier à en-tête) */}
        <div style={{ height: '0.3cm' }} />
        {/* Header */}
        {(() => {
          const refDate = devis.dateEnvoi || devis.dateCreation;
          const displayValidite = (() => {
            if (devis.dateEnvoi && devis.dateCreation && devis.dateValidite) {
              const durationMs = new Date(devis.dateValidite).getTime() - new Date(devis.dateCreation).getTime();
              if (durationMs > 0) {
                return new Date(new Date(devis.dateEnvoi).getTime() + durationMs).toISOString().split('T')[0];
              }
            }
            return devis.dateValidite;
          })();
          return (
            <>
              {/* Ligne 1 : logo + DEVIS / numéro / date / validité */}
              <div className="flex justify-between items-start mb-5">
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
                  <div className="mt-2 space-y-0.5 text-sm">
                    <div className="flex justify-end gap-4"><span className="text-muted-foreground">Date :</span><span>{formatDate(refDate)}</span></div>
                    <div className="flex justify-end gap-4"><span className="text-muted-foreground">Validité :</span><span>{formatDate(displayValidite)}</span></div>
                  </div>
                </div>
              </div>

              {/* Ligne 2 : adresses */}
              {(() => {
                const adresseLivraison = devis.adresseLivraisonId
                  ? client?.adressesLivraison?.find(a => a.id === devis.adresseLivraisonId)
                  : null;
                const factBlock = (
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adresse de facturation</p>
                    <p className="font-semibold">{client?.societe || client?.nom || '—'}</p>
                    {client?.societe && <p className="text-muted-foreground">{client.nom}</p>}
                    {client && <p className="text-muted-foreground">{client.adresse}</p>}
                    {client && <p className="text-muted-foreground">{client.codePostal} {client.ville}</p>}
                    {client?.email && <p className="text-muted-foreground">{client.email}</p>}
                  </div>
                );
                if (adresseLivraison) {
                  return (
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      {factBlock}
                      <div className="bg-muted/30 rounded-lg p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adresse de livraison</p>
                        <p className="font-semibold">{adresseLivraison.libelle}</p>
                        <p className="text-muted-foreground">{adresseLivraison.adresse}</p>
                        <p className="text-muted-foreground">{adresseLivraison.codePostal} {adresseLivraison.ville}</p>
                        {adresseLivraison.contact && <p className="text-muted-foreground">Contact : {adresseLivraison.contact}</p>}
                        {adresseLivraison.telephone && <p className="text-muted-foreground">Tél : {adresseLivraison.telephone}</p>}
                      </div>
                    </div>
                  );
                }
                // Pas d'adresse de livraison distincte → un seul bloc pleine largeur
                return <div className="mb-3">{factBlock}</div>;
              })()}

              {/* Ligne 3 : réf affaire + système (gauche) */}
              {(devis.referenceAffaire || devis.systeme || (devis.surfaceGlobaleM2 || 0) > 0) && (
                <div className="space-y-0.5 mb-4 text-sm">
                  {devis.referenceAffaire && (
                    <div><span className="text-muted-foreground whitespace-nowrap mr-1">Réf. affaire :</span><span className="font-medium">{devis.referenceAffaire}</span></div>
                  )}
                  {devis.systeme && (
                    <div><span className="text-muted-foreground whitespace-nowrap mr-1">Système :</span><span className="font-medium">{devis.systeme}</span></div>
                  )}
                  {(devis.surfaceGlobaleM2 || 0) > 0 && (
                    <div><span className="text-muted-foreground mr-1">Surface :</span><span className="font-medium">{devis.surfaceGlobaleM2} m²</span></div>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {devis.notes && (
          <div className="mb-4">
            <p>{devis.notes}</p>
          </div>
        )}

        {/* Table */}
        {showConso ? (() => {
          // â"€â"€ Pré-calcul données composants pour toutes les lignes â"€â"€
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
            // Formule : quantite_unités Ã— poids_composant / poids_parent Ã— conso_parent
            const poidsParent = prod?.poids || 0;
            const compBase = isComposite ? composants!.map(comp => {
              const compProd = produits.find(p => p.id === comp.produitId);
              const poidsC = compProd?.poids || 0;
              const consoCompDirect = poidsParent > 0 && poidsC > 0 && conso > 0
                ? Math.round(comp.quantite * poidsC / poidsParent * conso * 10000) / 10000
                : comp.quantite;
              return { comp, compProd, consoComp: consoCompDirect };
            }) : [];

            // Passe 2 : kg/m² des composants en % (base_kg/m² Ã— pct/100)
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

          // â"€â"€ Totaux ligne récapitulatif â"€â"€
          let sumConsoKgM2 = 0, sumTotalKg = 0, sumCondKg = 0, sumCoutConsoHT = 0;
          for (const { conso, isComposite, compDatas, prod, l } of allLines) {
            const surfLigne = getSurfaceLigne(l.id);
            if (isComposite) {
              if (conso > 0) {
                sumConsoKgM2 += conso;
                const poidsParentRecap = prod?.poids || 0;
                const totalKgRecap = surfLigne > 0 ? surfLigne * conso : 0;
                if (poidsParentRecap > 0 && totalKgRecap > 0) {
                  const unitesRecap = Math.ceil(totalKgRecap / poidsParentRecap);
                  sumCondKg += Math.round(unitesRecap * poidsParentRecap * 10) / 10;
                  sumTotalKg += Math.round(totalKgRecap * 100) / 100;
                }
              }
              for (const { totalKgComp, prixKg } of compDatas) {
                if (totalKgComp != null && prixKg != null) sumCoutConsoHT += totalKgComp * prixKg;
              }
            } else if (conso > 0) {
              sumConsoKgM2 += conso;
              const poidsP = prod?.poids || null;
              const totalKgP = surfLigne > 0 ? surfLigne * conso : null;
              if (totalKgP != null) {
                sumTotalKg += Math.round(totalKgP * 100) / 100;
                if (poidsP) {
                  sumCondKg += Math.ceil(totalKgP / poidsP) * poidsP;
                }
                const prixKgP = poidsP && l.prixUnitaireHT ? l.prixUnitaireHT * (1 - l.remise / 100) / poidsP : null;
                if (prixKgP != null) sumCoutConsoHT += totalKgP * prixKgP;
              }
            }
          }
          sumTotalKg = Math.round(sumTotalKg * 100) / 100;
          sumCondKg = Math.round(sumCondKg * 10) / 10;
          // refSurface : surface globale du preview en priorité, sinon max des surfaces des lignes
          const surfacesLignes = allLines.map(ld => getSurfaceLigne(ld.l.id)).filter(s => s > 0);
          const maxLineSurface = surfacesLignes.length > 0 ? Math.max(...surfacesLignes) : 0;
          const refSurface = surfaceGlobale > 0 ? surfaceGlobale : maxLineSurface > 0 ? maxLineSurface : null;
          const coutChantierM2 = refSurface && sumCoutConsoHT > 0
            ? Math.round(sumCoutConsoHT / refSurface * 100) / 100 : null;

          return (
            <table className="w-full mb-6 text-xs border-collapse">
              <thead>
                {/* Ligne 1 : groupes */}
                <tr className="bg-[#CC0000] text-white">
                  <th rowSpan={2} className="text-left py-2 px-2 font-bold uppercase text-xs align-bottom border-r border-white/20">
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>Désignation</div>
                    {/* lien site — <div> au lieu de <span class="block"> pour html2canvas */}
                    <div style={{ fontSize: '10px', fontWeight: 'normal', fontStyle: 'italic', opacity: 0.7, marginTop: '2px' }}>Fiches système / Produit : www.isofloor.fr</div>
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
                {showKgRecap && (
                <tr className="bg-muted/50 border-b-2 border-[#CC0000] text-xs italic font-medium">
                  <td />
                  <td className="py-1.5 px-1 text-right">{sumConsoKgM2 > 0 ? sumConsoKgM2.toFixed(3) : ''}</td>
                  <td className="py-1.5 px-1 text-right">{sumTotalKg > 0 ? sumTotalKg.toFixed(2) : ''}</td>
                  <td /><td />
                  <td className="py-1.5 px-1 text-right">{sumCondKg > 0 ? sumCondKg.toFixed(1) : ''}</td>
                  <td colSpan={3} className="py-1.5 px-1 text-right font-bold text-[#CC0000] not-italic whitespace-nowrap">
                    {coutChantierM2 != null ? `Coût chantier : ${coutChantierM2.toFixed(2)} €/m²` : ''}
                  </td>
                </tr>
                )}

                {/* Lignes produits (avec groupes + texte) */}
                {(() => {
                  let curGrp: string | null = null;
                  const lineGroup: Record<string, string | null> = {};
                  const grpTitles: Record<string, string> = {};
                  const subGrpId: Record<string, string | null> = {};
                  for (const l of devis.lignes) {
                    if (l.type === 'groupe') { curGrp = l.id; grpTitles[l.id] = l.description; }
                    else if (l.type === 'soustotal') { subGrpId[l.id] = curGrp; curGrp = null; }
                    else { lineGroup[l.id] = curGrp; }
                  }
                  const grpSub: Record<string, number> = {};
                  for (const { l, t } of allLines) {
                    const gid = lineGroup[l.id];
                    if (gid) grpSub[gid] = (grpSub[gid] || 0) + t.totalHT;
                  }
                  const allLineById: Record<string, typeof allLines[0]> = {};
                  for (const ld of allLines) allLineById[ld.l.id] = ld;
                  let lastGrp: string | null | undefined = undefined;
                  // Iterate over all devis.lignes to preserve order and intercalate text rows
                  return devis.lignes.map((dl, idx) => {
                    // groupe → skip (handled by showHeader below)
                    if (dl.type === 'groupe') return null;
                    // soustotal → render subtotal row
                    if (dl.type === 'soustotal') {
                      const gid = subGrpId[dl.id];
                      const titre = gid ? grpTitles[gid] : '';
                      const montant = gid ? (grpSub[gid] || 0) : 0;
                      return (
                        <tr key={dl.id} className="bg-[#CC0000]/5 border-b-2 border-[#CC0000]">
                          <td colSpan={8} className="py-1.5 px-2 text-xs font-bold text-[#CC0000] text-right italic">Sous-total{titre ? ` — ${titre}` : ''}</td>
                          <td className="py-1.5 px-2 text-xs font-bold text-[#CC0000] text-right">{formatMontant(montant)}</td>
                        </tr>
                      );
                    }
                    // texte → render text-only row
                    if (dl.type === 'texte') {
                      return dl.description ? (
                        <tr key={dl.id} className="border-b border-border/40">
                          <td colSpan={9} className="py-1.5 px-2 text-xs italic text-muted-foreground">{dl.description}</td>
                        </tr>
                      ) : null;
                    }
                    // ligne produit normale
                    const ld = allLineById[dl.id];
                    if (!ld) return null;
                    const { l, prod, conso, t, compDatas, isComposite } = ld;
                    const myGrp = lineGroup[l.id] ?? null;
                    const showHeader = myGrp != null && myGrp !== lastGrp;
                    lastGrp = myGrp;
                    return (
                  <Fragment key={l.id}>
                    {showHeader && (
                      <tr className="bg-primary/[0.03] border-t border-[#CC0000]">
                        <td colSpan={9} className="py-1.5 px-2 font-bold text-xs text-[#CC0000] uppercase tracking-wide">{grpTitles[myGrp!]}</td>
                      </tr>
                    )}
                    {/* Ligne produit principal */}
                    <tr className="border-b border-border/60">
                      <td className="py-1.5 px-2 font-medium">
                        {l.description}
                        {l.variantesChoisies && (() => {
                          const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                          return [...Object.values(l.variantesChoisies)].sort((a, b) => {
                            const rank = (s: string) => getRalStyle(s) ? 2 : /^\d|^TF\d/i.test(s) ? 0 : 1;
                            return rank(a) - rank(b);
                          }).map((label, i) => {
                            const rs = getRalStyle(label);
                            if (rs) return (
                              <span key={i} style={{ backgroundColor: rs.backgroundColor, color: rs.color, padding: '2px 8px 2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', letterSpacing: '0.04em', ...(rs.border ? { border: rs.border } : {}) }}>RAL {rs.ralNum}</span>
                            );
                            const imgUrl = prod?.variantes?.flatMap(d => d.options).find(o => o.label === label)?.imageUrl;
                            if (imgUrl) return (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: '8px', verticalAlign: 'middle' }}>
                                <img src={imgUrl} alt={label} style={{ width: '40px', height: '26px', borderRadius: 3, objectFit: 'cover', border: '1px solid rgba(0,0,0,0.2)', display: 'inline-block', flexShrink: 0 }} />
                                <span className="text-xs text-muted-foreground font-normal">{label}</span>
                              </span>
                            );
                            return <span key={i} className="ml-1.5 text-xs text-muted-foreground font-normal">· {label}</span>;
                          });
                        })()}
                        {(hideControls || pdfMode) ? (
                          getSurfaceLigne(l.id) > 0 ? (
                            <span className="ml-2 text-xs text-muted-foreground">{getSurfaceLigne(l.id)} m²</span>
                          ) : null
                        ) : (
                          <span className="ml-2 print:hidden inline-flex items-center gap-1.5">
                            <input
                              type="number" min={0} step={1}
                              value={getSurfaceLigne(l.id) || ''}
                              onChange={e => setSurface(l.id, parseFloat(e.target.value) || 0)}
                              className="w-12 text-right border border-border rounded px-1 py-0 text-xs font-normal text-foreground bg-background"
                              placeholder="m²"
                            />
                            <span className="text-xs text-muted-foreground">m²</span>
                          </span>
                        )}
                        {/* Note et images intégrées dans la cellule description */}
                        {l.note && (() => {
                          const rsNote = getRalStyle(l.note!);
                          return rsNote ? (
                            <div style={{ marginTop: '5px' }}>
                              <span style={{ backgroundColor: rsNote.backgroundColor, color: rsNote.color, padding: '3px 8px', borderRadius: '3px', fontSize: '0.7rem', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center' }}>{l.note}</span>
                            </div>
                          ) : (
                            <div style={{ marginTop: '3px', fontSize: '0.75rem', fontStyle: 'italic', color: '#888' }}>{l.note}</div>
                          );
                        })()}
                        {(allLineImages[l.id] || []).length > 0 && (
                          <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {(allLineImages[l.id] || []).map((img, i) => (
                              <img key={i} src={img.url} alt={img.name} style={{ maxHeight: '80px', maxWidth: '160px', objectFit: 'contain', borderRadius: '3px', border: '1px solid rgba(0,0,0,0.1)' }} />
                            ))}
                          </div>
                        )}
                      </td>
                      {isComposite ? (() => {
                        const surfaceLigne = getSurfaceLigne(l.id) || 0;
                        const totalKgConso = conso > 0 && surfaceLigne > 0 ? Math.round(surfaceLigne * conso * 100) / 100 : null;
                        const poidsComp = prod?.poids || null;
                        const unitesComp = totalKgConso != null && poidsComp ? Math.ceil(totalKgConso / poidsComp) : null;
                        const condKgComp = unitesComp != null && poidsComp ? Math.round(unitesComp * poidsComp * 10) / 10 : null;
                        const prixKgComp = poidsComp && l.prixUnitaireHT ? Math.round(l.prixUnitaireHT * (1 - l.remise / 100) / poidsComp * 100) / 100 : null;
                        return (
                          <>
                            <td className="py-1.5 px-1 text-right font-medium">{conso > 0 ? conso.toFixed(3) : ''}</td>
                            <td className="py-1.5 px-1 text-right">{totalKgConso != null ? totalKgConso.toFixed(2) : ''}</td>
                            <td className="py-1.5 px-1 text-right">{poidsComp ?? ''}</td>
                            <td className="py-1.5 px-1 text-right font-semibold text-primary">{unitesComp ?? ''}</td>
                            <td className="py-1.5 px-1 text-right">{condKgComp ?? ''}</td>
                            <td className="py-1.5 px-1 text-right">{l.prixUnitaireHT > 0 ? formatMontant(l.prixUnitaireHT * (1 - l.remise / 100)) : ''}</td>
                            <td className="py-1.5 px-1 text-right text-muted-foreground">{prixKgComp != null ? `(${formatMontant(prixKgComp)})` : ''}</td>
                            <td className="py-1.5 px-1 text-right font-bold">{t.totalHT > 0 ? formatMontant(t.totalHT) : ''}</td>
                          </>
                        );
                      })() : (() => {
                        const surfaceLigne = getSurfaceLigne(l.id);
                        const kg = conso > 0 && surfaceLigne > 0 ? Math.round(surfaceLigne * conso * 1000) / 1000 : null;
                        const poidsC = prod?.poids || null;
                        const unites = kg != null && poidsC ? Math.ceil(kg / poidsC) : null;
                        const condKg = unites != null && poidsC ? unites * poidsC : null;
                        const prixKg = poidsC && l.prixUnitaireHT ? Math.round(l.prixUnitaireHT * (1 - l.remise / 100) / poidsC * 100) / 100 : null;
                        return (
                          <>
                            <td className="py-1.5 px-1 text-right">{conso > 0 ? conso : ''}</td>
                            <td className="py-1.5 px-1 text-right">{kg ?? ''}</td>
                            <td className="py-1.5 px-1 text-right">{poidsC ?? ''}</td>
                            <td className="py-1.5 px-1 text-right font-semibold text-primary">{unites ?? ''}</td>
                            <td className="py-1.5 px-1 text-right">{condKg ?? ''}</td>
                            <td className="py-1.5 px-1 text-right">{l.prixUnitaireHT > 0 ? formatMontant(l.prixUnitaireHT * (1 - l.remise / 100)) : ''}</td>
                            <td className="py-1.5 px-1 text-right text-muted-foreground">{prixKg != null ? `(${formatMontant(prixKg)})` : ''}</td>
                            <td className="py-1.5 px-1 text-right font-bold">{t.totalHT > 0 ? formatMontant(t.totalHT) : ''}</td>
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
                          <td className="py-1 px-1 text-right">{consoComp ?? ''}</td>
                          <td className="py-1 px-1 text-right">{totalKgComp ?? ''}</td>
                          <td className="py-1 px-1 text-right">{compProd.poids ?? ''}</td>
                          <td className="py-1 px-1 text-right font-semibold text-primary">{unitesComp ?? ''}</td>
                          <td className="py-1 px-1 text-right">{condKgComp ?? ''}</td>
                          <td className="py-1 px-1 text-right text-foreground">{formatMontant(prixUnite)}</td>
                          <td className="py-1 px-1 text-right">{prixKg != null ? `(${formatMontant(prixKg)})` : ''}</td>
                          <td className="py-1 px-1 text-right font-semibold text-foreground">{formatMontant(totalHTComp)}</td>
                        </tr>
                      ) : null
                    )}
                  </Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          );
        })() : (
          /* Table simple (sans mode conso) */
          <table className="w-full mb-6 text-xs table-fixed">
            <colgroup>
              <col />{/* Description : prend tout l'espace restant */}
              <col className="w-10" />{/* Qté */}
              <col className="w-10" />{/* Unité */}
              {showRemise && <col className="w-20" />}{/* P.U. HT */}
              {showRemise && <col className="w-12" />}{/* Rem. */}
              <col className="w-20" />{/* P.U. net HT */}
              <col className="w-24" />{/* Total HT */}
            </colgroup>
            <thead>
              <tr className="border-b-2 border-[#CC0000]">
                <th className="text-left py-2 font-semibold">Description</th>
                <th className="text-right py-2 font-semibold">Qté</th>
                <th className="text-center py-2 font-semibold">Unité</th>
                {showRemise && <th className="text-right py-2 font-semibold">P.U. HT</th>}
                {showRemise && <th className="text-right py-2 font-semibold">Rem.</th>}
                <th className="text-right py-2 font-semibold">P.U. net HT</th>
                <th className="text-right py-2 font-semibold">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Precompute group membership using explicit soustotal markers
                let curGrpS: string | null = null;
                const lineGroupS: Record<string, string | null> = {};
                const grpTitlesS: Record<string, string> = {};
                const subGrpIdS: Record<string, string | null> = {};
                for (const l of devis.lignes) {
                  if (l.type === 'groupe') { curGrpS = l.id; grpTitlesS[l.id] = l.description; }
                  else if (l.type === 'soustotal') { subGrpIdS[l.id] = curGrpS; curGrpS = null; }
                  else { lineGroupS[l.id] = curGrpS; }
                }
                const grpSubS: Record<string, number> = {};
                for (const l of lignesEffectives) {
                  const gid = lineGroupS[l.id];
                  if (gid) grpSubS[gid] = (grpSubS[gid] || 0) + calculerTotalLigne(l).totalHT;
                }
                const colSpan = showRemise ? 7 : 5;
                const lignesEffByIdS: Record<string, typeof lignesEffectives[0]> = {};
                for (const l of lignesEffectives) lignesEffByIdS[l.id] = l;
                let lastGrpS: string | null | undefined = undefined;
                // Iterate devis.lignes to preserve order and show texte rows
                return devis.lignes.map((dl) => {
                  if (dl.type === 'groupe') return null;
                  if (dl.type === 'soustotal') {
                    const gid = subGrpIdS[dl.id];
                    const titre = gid ? grpTitlesS[gid] : '';
                    const montant = gid ? (grpSubS[gid] || 0) : 0;
                    return (
                      <tr key={dl.id} className="bg-primary/[0.03] border-b-2 border-primary/20">
                        <td colSpan={colSpan - 1} className="py-1.5 px-2 text-xs font-bold text-primary text-right italic">Sous-total{titre ? ` — ${titre}` : ''}</td>
                        <td className="py-1.5 px-2 text-xs font-bold text-primary text-right">{formatMontant(montant)}</td>
                      </tr>
                    );
                  }
                  if (dl.type === 'texte') {
                    return dl.description ? (
                      <tr key={dl.id} className="border-b border-border/40">
                        <td colSpan={colSpan} className="py-1.5 px-2 text-xs italic text-muted-foreground">{dl.description}</td>
                      </tr>
                    ) : null;
                  }
                  const l = lignesEffByIdS[dl.id];
                  if (!l || (!l.description && !l.prixUnitaireHT)) return null;
                  const t = calculerTotalLigne(l);
                  const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                  const composants = prod?.composants;
                  const prixNet = l.prixUnitaireHT * (1 - l.remise / 100);
                  const myGrpS = lineGroupS[l.id] ?? null;
                  const showHeaderS = myGrpS != null && myGrpS !== lastGrpS;
                  lastGrpS = myGrpS;
                  return (
                    <Fragment key={l.id}>
                      {showHeaderS && (
                        <tr className="bg-primary/[0.03] border-t border-[#CC0000]">
                          <td colSpan={colSpan} className="py-1.5 px-2 font-bold text-xs text-[#CC0000] uppercase tracking-wide">{grpTitlesS[myGrpS!]}</td>
                        </tr>
                      )}
                      <tr className="border-b border-border">
                        <td className={`py-2 ${myGrpS ? 'pl-4' : ''}`}>
                          {l.description}
                          {l.variantesChoisies && (() => {
                            const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                            return [...Object.values(l.variantesChoisies)].sort((a, b) => {
                              const rank = (s: string) => getRalStyle(s) ? 2 : /^\d|^TF\d/i.test(s) ? 0 : 1;
                              return rank(a) - rank(b);
                            }).map((label, i) => {
                              const rs = getRalStyle(label);
                              if (rs) return (
                                <span key={i} style={{ backgroundColor: rs.backgroundColor, color: rs.color, padding: '2px 8px 2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', letterSpacing: '0.04em', ...(rs.border ? { border: rs.border } : {}) }}>RAL {rs.ralNum}</span>
                              );
                              const imgUrl = prod?.variantes?.flatMap(d => d.options).find(o => o.label === label)?.imageUrl;
                              if (imgUrl) return (
                                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px', marginTop: '-6px', marginBottom: '-6px', verticalAlign: 'middle', lineHeight: 0 }}>
                                  <img src={imgUrl} alt={label} style={{ width: 'auto', height: 'calc(1.5em + 12px)', borderRadius: 3, objectFit: 'cover', border: '1px solid rgba(0,0,0,0.15)', display: 'block' }} />
                                  <span className="text-xs text-muted-foreground font-normal">{label}</span>
                                </span>
                              );
                              return <span key={i} className="ml-1.5 text-xs text-muted-foreground font-normal">· {label}</span>;
                            });
                          })()}
                          {prod?.descriptionDetaillee && <p className="text-xs text-muted-foreground mt-0.5">{prod.descriptionDetaillee}</p>}
                          {/* Note et images intégrées dans la cellule description */}
                          {l.note && (() => {
                            const rsNote = getRalStyle(l.note!);
                            return rsNote ? (
                              <div style={{ marginTop: '5px' }}>
                                <span style={{ backgroundColor: rsNote.backgroundColor, color: rsNote.color, padding: '3px 8px', borderRadius: '3px', fontSize: '0.7rem', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center' }}>{l.note}</span>
                              </div>
                            ) : (
                              <div style={{ marginTop: '3px', fontSize: '0.75rem', fontStyle: 'italic', color: '#888' }}>{l.note}</div>
                            );
                          })()}
                          {(allLineImages[l.id] || []).length > 0 && (
                            <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {(allLineImages[l.id] || []).map((img, i) => (
                                <img key={i} src={img.url} alt={img.name} style={{ maxHeight: '80px', maxWidth: '160px', objectFit: 'contain', borderRadius: '3px', border: '1px solid rgba(0,0,0,0.1)' }} />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2 text-right">{l.quantite || ''}</td>
                        <td className="py-2 text-center">{l.unite || ''}</td>
                        {showRemise && <td className="py-2 text-right">{l.prixUnitaireHT > 0 ? formatMontant(l.prixUnitaireHT) : ''}</td>}
                        {showRemise && <td className="py-2 text-right">{l.remise > 0 ? `${l.remise}%` : ''}</td>}
                        <td className="py-2 text-right">{prixNet > 0 ? formatMontant(prixNet) : ''}</td>
                        <td className="py-2 text-right font-medium">{t.totalHT > 0 ? formatMontant(t.totalHT) : ''}</td>
                      </tr>
                      {showComposants && composants && composants.length > 0 && composants.map(comp => {
                        const compProd = produits.find(p => p.id === comp.produitId);
                        if (!compProd) return null;
                        return (
                          <tr key={`${l.id}-${comp.produitId}`} className="bg-muted/20 text-muted-foreground text-xs">
                            <td className="py-1 pl-8 italic">↳ <span className="font-mono">{compProd.reference}</span> — {compProd.description}</td>
                            <td className="py-1 text-right">{Math.round(comp.quantite * l.quantite * 1000) / 1000}</td>
                            <td className="py-1 text-center">{compProd.unite || ''}</td>
                            <td colSpan={showRemise ? 3 : 2} />
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="flex justify-between items-end mb-5">
          <div className="text-sm text-muted-foreground space-y-1">
          </div>
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

        <div className="mt-5 grid grid-cols-2 gap-6">
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Signature du client</p>
            <p className="text-xs text-muted-foreground mt-1">Bon pour accord, date et signature</p>
            <div className="h-14"></div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Cachet de l'entreprise</p>
            <div className="h-14"></div>
          </div>
        </div>

        {/* Pied de page */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
            <p>Pour tout renseignement, consultez la fiche technique et fiche de données de sécurité</p>
            <p>La préparation des supports doit être conforme aux normes et DTU en vigueur</p>
            <p>Après toute livraison, il est important de procéder à la répartition des composants par N° de lot</p>
          </div>
          <div className="text-xs">
            <p className="font-semibold">François MOUHOT</p>
            <p>Port : 06.31.61.15.96</p>
            <p>E-mail : f.mouhot@isosign.fr</p>
          </div>
        </div>
      </div>{/* fin printAreaRef */}
      </div>{/* fin page A4 */}
      </div>{/* fin zone défilement */}
    </div>
  );
}

