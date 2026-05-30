import { useState, useEffect, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import { useCRM } from '@/lib/StoreContext';
import {
  generateId, formatMontant, formatDate,
  STATUTS_FACTURE_FOURNISSEUR, type FactureFournisseur, type StatutFactureFournisseur,
} from '@/lib/store';
import { Plus, Search, Trash2, Pencil, ShoppingCart, CheckCircle2, AlertCircle, Euro, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const allStatuts = Object.keys(STATUTS_FACTURE_FOURNISSEUR) as StatutFactureFournisseur[];

type FFColKey = 'numero' | 'numFacture' | 'fournisseur' | 'bc' | 'reception' | 'echeance' | 'paiement' | 'montant' | 'statut';
const FF_COLS: { key: FFColKey; label: string; cls: string }[] = [
  { key: 'numero', label: 'N° interne', cls: 'text-left' },
  { key: 'numFacture', label: 'N° Facture', cls: 'text-left' },
  { key: 'fournisseur', label: 'Fournisseur', cls: 'text-left' },
  { key: 'bc', label: 'BC lié', cls: 'text-left hidden sm:table-cell' },
  { key: 'reception', label: 'Réception', cls: 'text-left hidden md:table-cell' },
  { key: 'echeance', label: 'Échéance', cls: 'text-left hidden lg:table-cell' },
  { key: 'paiement', label: 'Paiement', cls: 'text-left hidden lg:table-cell' },
  { key: 'montant', label: 'Montant TTC', cls: 'text-right' },
  { key: 'statut', label: 'Statut', cls: 'text-center' },
];

export default function FacturesFournisseur() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { facturesFournisseur, updateFacturesFournisseur, fournisseurs, commandesFournisseur, devis } = useCRM();
  const ffCols = useTableColumns<FFColKey>('factures_fourn_table', FF_COLS.map(c => c.key));

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterStatut, setFilterStatut] = useState<string>('tous');

  // Auto-open dialog pre-filled if ?cf=<commandeFournisseurId> is in URL
  useEffect(() => {
    const cfId = searchParams.get('cf');
    if (cfId) openNew(cfId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [paiementDialogOpen, setPaiementDialogOpen] = useState(false);
  const [paiementFacture, setPaiementFacture] = useState<FactureFournisseur | null>(null);
  const [paiementDate, setPaiementDate] = useState('');

  // Form state
  const [fournisseurId, setFournisseurId] = useState('');
  const [commandeFournisseurId, setCommandeFournisseurId] = useState('');
  const [numero, setNumero] = useState('');
  const [numeroFacture, setNumeroFacture] = useState('');
  const [dateReception, setDateReception] = useState(new Date().toISOString().split('T')[0]);
  const [dateEcheance, setDateEcheance] = useState('');
  const [statut, setStatut] = useState<StatutFactureFournisseur>('reçue');
  const [montantHT, setMontantHT] = useState('');
  const [montantTVA, setMontantTVA] = useState('');
  const [montantTTC, setMontantTTC] = useState('');
  const [notes, setNotes] = useState('');

  function nextNumero() {
    const year = new Date().getFullYear();
    const n = facturesFournisseur.filter(f => f.numero.startsWith(`FACF-${year}`)).length + 1;
    return `FACF-${year}-${String(n).padStart(3, '0')}`;
  }

  function resetForm() {
    setFournisseurId('');
    setCommandeFournisseurId('');
    setNumero(nextNumero());
    setNumeroFacture('');
    setDateReception(new Date().toISOString().split('T')[0]);
    setDateEcheance('');
    setStatut('reçue');
    setMontantHT('');
    setMontantTVA('');
    setMontantTTC('');
    setNotes('');
    setEditingId(null);
  }

  function openNew(prefillCfId?: string) {
    resetForm();
    if (prefillCfId) {
      const cf = commandesFournisseur.find(c => c.id === prefillCfId);
      if (cf) {
        setFournisseurId(cf.fournisseurId);
        setCommandeFournisseurId(cf.id);
        setMontantHT(String(cf.totalHT));
        setMontantTTC(String(cf.totalTTC));
        const tva = cf.totalTTC - cf.totalHT;
        setMontantTVA(String(Math.round(tva * 100) / 100));
        // Échéance depuis le fournisseur si disponible
        if (cf.dateEcheance) setDateEcheance(cf.dateEcheance);
      }
    }
    setDialogOpen(true);
  }

  function openEdit(f: FactureFournisseur) {
    setEditingId(f.id);
    setFournisseurId(f.fournisseurId);
    setCommandeFournisseurId(f.commandeFournisseurId || '');
    setNumero(f.numero);
    setNumeroFacture(f.numeroFacture);
    setDateReception(f.dateReception);
    setDateEcheance(f.dateEcheance || '');
    setStatut(f.statut);
    setMontantHT(String(f.montantHT));
    setMontantTVA(String(f.montantTVA));
    setMontantTTC(String(f.montantTTC));
    setNotes(f.notes || '');
    setDialogOpen(true);
  }

  function save() {
    if (!fournisseurId) { toast.error('Sélectionnez un fournisseur'); return; }
    const ht = parseFloat(montantHT) || 0;
    const tva = parseFloat(montantTVA) || 0;
    const ttc = parseFloat(montantTTC) || (ht + tva);

    if (editingId) {
      updateFacturesFournisseur(prev => prev.map(f => f.id === editingId ? {
        ...f, fournisseurId, commandeFournisseurId: commandeFournisseurId || undefined,
        numero, numeroFacture, dateReception, dateEcheance: dateEcheance || undefined, statut,
        montantHT: ht, montantTVA: tva, montantTTC: ttc, notes: notes || undefined,
      } : f));
      toast.success('Facture modifiée');
    } else {
      const newFacture: FactureFournisseur = {
        id: generateId(), fournisseurId, commandeFournisseurId: commandeFournisseurId || undefined,
        numero, numeroFacture, dateReception, dateEcheance: dateEcheance || undefined, statut,
        montantHT: ht, montantTVA: tva, montantTTC: ttc, notes: notes || undefined,
      };
      updateFacturesFournisseur(prev => [...prev, newFacture]);
      toast.success('Facture fournisseur enregistrée');
    }
    setDialogOpen(false);
  }

  function updateStatut(id: string, s: StatutFactureFournisseur) {
    updateFacturesFournisseur(prev => prev.map(f => f.id === id ? { ...f, statut: s } : f));
    toast.success(`Statut → ${STATUTS_FACTURE_FOURNISSEUR[s].label}`);
  }

  function openPaiement(f: FactureFournisseur) {
    setPaiementFacture(f);
    setPaiementDate(new Date().toISOString().split('T')[0]);
    setPaiementDialogOpen(true);
  }

  function savePaiement() {
    if (!paiementFacture || !paiementDate) return;
    updateFacturesFournisseur(prev => prev.map(f => f.id === paiementFacture.id
      ? { ...f, statut: 'payée' as StatutFactureFournisseur, datePaiement: paiementDate }
      : f));
    toast.success(`Facture ${paiementFacture.numero} marquée payée`);
    setPaiementDialogOpen(false);
    setPaiementFacture(null);
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    updateFacturesFournisseur(prev => prev.filter(f => f.id !== deleteTargetId));
    toast.success('Facture supprimée');
    setDeleteConfirmOpen(false);
  }

  // Stats
  const totalRecu = facturesFournisseur.filter(f => f.statut !== 'payée').reduce((s, f) => s + f.montantTTC, 0);
  const totalPaye = facturesFournisseur.filter(f => f.statut === 'payée').reduce((s, f) => s + f.montantTTC, 0);
  const enRetard = facturesFournisseur.filter(f => f.statut !== 'payée' && f.dateEcheance && new Date(f.dateEcheance) < new Date());

  const filtered = facturesFournisseur
    .filter(f => {
      if (filterStatut !== 'tous' && f.statut !== filterStatut) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      const fourn = fournisseurs.find(fu => fu.id === f.fournisseurId);
      return f.numero.toLowerCase().includes(s) ||
        f.numeroFacture.toLowerCase().includes(s) ||
        fourn?.nom.toLowerCase().includes(s) ||
        fourn?.societe?.toLowerCase().includes(s);
    })
    .sort((a, b) => b.dateReception.localeCompare(a.dateReception));

  // Pour le formulaire : filtrer les CF par fournisseur sélectionné
  const cfFiltered = fournisseurId
    ? commandesFournisseur.filter(cf => cf.fournisseurId === fournisseurId)
    : commandesFournisseur;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card text-center">
          <Clock className="w-5 h-5 mx-auto text-warning mb-1" />
          <p className="text-lg font-heading font-bold">{formatMontant(totalRecu)}</p>
          <p className="text-xs text-muted-foreground">À payer</p>
        </div>
        <div className="stat-card text-center">
          <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
          <p className="text-lg font-heading font-bold">{formatMontant(totalPaye)}</p>
          <p className="text-xs text-muted-foreground">Payé</p>
        </div>
        <div className="stat-card text-center">
          <AlertCircle className="w-5 h-5 mx-auto text-destructive mb-1" />
          <p className="text-2xl font-heading font-bold">{enRetard.length}</p>
          <p className="text-xs text-muted-foreground">En retard</p>
        </div>
        <div className="stat-card text-center">
          <Euro className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-heading font-bold">{facturesFournisseur.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
      </div>

      {/* Filters + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher fournisseur, numéro..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => openNew()} size="sm"><Plus className="w-4 h-4 mr-1" />Saisir une facture</Button>
      </div>

      {/* Statut filters */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilterStatut('tous')} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === 'tous' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
          Toutes ({facturesFournisseur.length})
        </button>
        {allStatuts.map(s => {
          const count = facturesFournisseur.filter(f => f.statut === s).length;
          return (
            <button key={s} onClick={() => setFilterStatut(s)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {STATUTS_FACTURE_FOURNISSEUR[s].label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {ffCols.ordered(FF_COLS).map(col => {
                const isDragOver = ffCols.dragOverKey === col.key && ffCols.dragKey !== col.key;
                return (
                  <th key={col.key} {...ffCols.thProps(col.key)} style={ffCols.widthStyle(col.key)} className={`relative py-3 px-4 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing ${col.cls} ${ffCols.dragKey === col.key ? 'opacity-40' : ''} ${isDragOver ? 'bg-primary/10' : ''}`}>
                    {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                    <span className="truncate">{col.label}</span>
                    <ColResizeHandle {...ffCols.resizeHandleProps(col.key)} />
                  </th>
                );
              })}
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => {
              const fourn = fournisseurs.find(fu => fu.id === f.fournisseurId);
              const cf = f.commandeFournisseurId ? commandesFournisseur.find(c => c.id === f.commandeFournisseurId) : undefined;
              const dv = cf?.devisId ? devis.find(d => d.id === cf.devisId) : undefined;
              const statutInfo = STATUTS_FACTURE_FOURNISSEUR[f.statut];
              const isOverdue = f.statut !== 'payée' && f.dateEcheance && new Date(f.dateEcheance) < new Date();
              const renderFF = (key: FFColKey) => {
                const ws = ffCols.widthStyle(key);
                const col = FF_COLS.find(c => c.key === key)!;
                const base = `py-3 px-4 ${col.cls}`;
                switch (key) {
                  case 'numero': return <td style={ws} className={`${base} font-mono text-xs`}>{f.numero}</td>;
                  case 'numFacture': return <td style={ws} className={`${base} font-medium text-sm`}>{f.numeroFacture || <span className="text-muted-foreground">—</span>}</td>;
                  case 'fournisseur': return <td style={ws} className={base}><div className="font-medium truncate">{fourn?.societe || fourn?.nom || '—'}</div></td>;
                  case 'bc': return <td style={ws} className={base}><div className="flex items-center gap-1 flex-wrap">{cf && <button onClick={() => navigate(`/commandes?search=${encodeURIComponent(cf.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-info/10 text-info font-medium hover:bg-info/20"><ShoppingCart className="w-2.5 h-2.5" />{cf.numero}</button>}{dv && <button onClick={() => navigate(`/devis?search=${encodeURIComponent(dv.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium hover:bg-success/20">{dv.numero}</button>}</div></td>;
                  case 'reception': return <td style={ws} className={`${base} text-xs text-muted-foreground`}>{formatDate(f.dateReception)}</td>;
                  case 'echeance': return <td style={ws} className={base}>{f.dateEcheance ? <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>{formatDate(f.dateEcheance)}{isOverdue && <span className="block text-[10px]">Échu</span>}</span> : <span className="text-muted-foreground text-xs">—</span>}</td>;
                  case 'paiement': return <td style={ws} className={`${base} text-xs text-muted-foreground`}>{f.datePaiement ? formatDate(f.datePaiement) : '—'}</td>;
                  case 'montant': return <td style={ws} className={`${base} font-semibold`}>{formatMontant(f.montantTTC)}</td>;
                  case 'statut': return <td style={ws} className={base}><select value={f.statut} onChange={e => updateStatut(f.id, e.target.value as StatutFactureFournisseur)} className={`text-xs font-medium px-2 py-1 rounded cursor-pointer border-0 ${statutInfo.color}`}>{allStatuts.map(s => <option key={s} value={s}>{STATUTS_FACTURE_FOURNISSEUR[s].label}</option>)}</select></td>;
                  default: return <td style={ws} className={base} />;
                }
              };
              return (
                <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  {ffCols.ordered(FF_COLS).map(col => <Fragment key={col.key}>{renderFF(col.key)}</Fragment>)}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {f.statut !== 'payée' && (
                        <button onClick={() => openPaiement(f)} className="p-1.5 rounded hover:bg-muted" title="Marquer payée">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </button>
                      )}
                      <button onClick={() => openEdit(f)} className="p-1.5 rounded hover:bg-muted" title="Modifier">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => { setDeleteTargetId(f.id); setDeleteConfirmOpen(true); }} className="p-1.5 rounded hover:bg-destructive/10" title="Supprimer">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Aucune facture fournisseur</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? `Modifier — ${numero}` : 'Saisir une facture fournisseur'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>N° interne</Label>
                <Input value={numero} onChange={e => setNumero(e.target.value)} />
              </div>
              <div>
                <Label>N° Facture fournisseur</Label>
                <Input value={numeroFacture} onChange={e => setNumeroFacture(e.target.value)} placeholder="ex: 2025-0894" />
              </div>
            </div>
            <div>
              <Label>Fournisseur *</Label>
              <select value={fournisseurId} onChange={e => { setFournisseurId(e.target.value); setCommandeFournisseurId(''); }}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2">
                <option value="">— Sélectionner —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.societe || f.nom}</option>)}
              </select>
            </div>
            <div>
              <Label>Commande fournisseur liée</Label>
              <select value={commandeFournisseurId} onChange={e => {
                setCommandeFournisseurId(e.target.value);
                const cf = commandesFournisseur.find(c => c.id === e.target.value);
                if (cf) {
                  setMontantHT(String(cf.totalHT));
                  setMontantTTC(String(cf.totalTTC));
                  setMontantTVA(String(Math.round((cf.totalTTC - cf.totalHT) * 100) / 100));
                  if (cf.dateEcheance) setDateEcheance(cf.dateEcheance);
                }
              }}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2">
                <option value="">— Aucune —</option>
                {cfFiltered.map(cf => <option key={cf.id} value={cf.id}>{cf.numero} — {formatMontant(cf.totalTTC)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date réception</Label>
                <Input type="date" value={dateReception} onChange={e => setDateReception(e.target.value)} />
              </div>
              <div>
                <Label>Échéance</Label>
                <Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Montant HT (€)</Label>
                <Input type="number" step="0.01" value={montantHT} onChange={e => setMontantHT(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>TVA (€)</Label>
                <Input type="number" step="0.01" value={montantTVA} onChange={e => setMontantTVA(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Montant TTC (€)</Label>
                <Input type="number" step="0.01" value={montantTTC} onChange={e => setMontantTTC(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div>
              <Label>Statut</Label>
              <select value={statut} onChange={e => setStatut(e.target.value as StatutFactureFournisseur)}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2">
                {allStatuts.map(s => <option key={s} value={s}>{STATUTS_FACTURE_FOURNISSEUR[s].label}</option>)}
              </select>
            </div>
            <div>
              <Label>Notes</Label>
              <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editingId ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paiement Dialog */}
      <Dialog open={paiementDialogOpen} onOpenChange={setPaiementDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enregistrer le paiement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Facture <strong>{paiementFacture?.numero}</strong>{paiementFacture?.numeroFacture ? ` (${paiementFacture.numeroFacture})` : ''} — {paiementFacture ? formatMontant(paiementFacture.montantTTC) : ''}</p>
            <div>
              <Label>Date de paiement</Label>
              <Input type="date" value={paiementDate} onChange={e => setPaiementDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaiementDialogOpen(false)}>Annuler</Button>
            <Button onClick={savePaiement} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-4 h-4 mr-2" />Marquer payée
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la facture ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
