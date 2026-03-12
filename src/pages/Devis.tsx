import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, calculerTotalDevis, calculerTotalLigne, calculerFraisPort, formatMontant, formatDate, type Devis as DevisType, type LigneDevis } from '@/lib/store';
import { Plus, Search, Eye, Trash2, FileText, Pencil, Copy, ExternalLink, Download, User, Mail, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/exportExcel';
import DevisPreview from '@/components/DevisPreview';
import ProduitCombobox from '@/components/ProduitCombobox';
import ClientCombobox from '@/components/ClientCombobox';
import DevisEmailDialog from '@/components/DevisEmailDialog';
import CommandeFournisseurDialog from '@/components/CommandeFournisseurDialog';

const statutColors: Record<string, string> = {
  brouillon: 'bg-muted text-muted-foreground',
  envoyé: 'bg-info/10 text-info',
  accepté: 'bg-success/10 text-success',
  refusé: 'bg-destructive/10 text-destructive',
  expiré: 'bg-muted text-muted-foreground',
};

export default function Devis() {
  const { devis, updateDevis, clients, produits, fournisseurs, produitFournisseurs } = useCRM();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [filterClient, setFilterClient] = useState<string>('tous');
  const [filterPeriode, setFilterPeriode] = useState<string>('tous');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewDevis, setPreviewDevis] = useState<DevisType | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emailDevis, setEmailDevis] = useState<DevisType | null>(null);
  const [commandeDevis, setCommandeDevis] = useState<DevisType | null>(null);
  const [commandeConfirmDevis, setCommandeConfirmDevis] = useState<DevisType | null>(null);

  // Auto-open devis editor when returning from product page
  useEffect(() => {
    const editDevisId = searchParams.get('editDevis');
    if (editDevisId) {
      const d = devis.find(dv => dv.id === editDevisId);
      if (d) {
        openEdit(d);
      }
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [clientId, setClientId] = useState('');
  const [dateCreation, setDateCreation] = useState(new Date().toISOString().split('T')[0]);
  const [dateValidite, setDateValidite] = useState('');
  const [statut, setStatut] = useState<DevisType['statut']>('brouillon');
  const [referenceAffaire, setReferenceAffaire] = useState('');
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('Paiement à 30 jours à compter de la date de facturation.');
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [fraisPortHT, setFraisPortHT] = useState(0);
  const [fraisPortTVA, setFraisPortTVA] = useState(20);
  const [fraisPortAuto, setFraisPortAuto] = useState(true);
  const [modeCalcul, setModeCalcul] = useState<'standard' | 'surface'>('standard');
  const [surfaceGlobaleM2, setSurfaceGlobaleM2] = useState(0);
  const [adresseLivraisonId, setAdresseLivraisonId] = useState('');

  const filtered = devis.filter(d => {
    const client = clients.find(c => c.id === d.clientId);
    const matchSearch = [d.numero, client?.nom, client?.societe, d.statut, d.referenceAffaire, d.notes].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    if (filterStatut !== 'tous' && d.statut !== filterStatut) return false;
    if (filterClient !== 'tous' && d.clientId !== filterClient) return false;
    if (filterPeriode !== 'tous') {
      const now = new Date();
      const dateD = new Date(d.dateCreation);
      if (filterPeriode === 'mois' && (dateD.getMonth() !== now.getMonth() || dateD.getFullYear() !== now.getFullYear())) return false;
      if (filterPeriode === 'trimestre') {
        const qNow = Math.floor(now.getMonth() / 3);
        const qD = Math.floor(dateD.getMonth() / 3);
        if (qD !== qNow || dateD.getFullYear() !== now.getFullYear()) return false;
      }
      if (filterPeriode === 'annee' && dateD.getFullYear() !== now.getFullYear()) return false;
    }
    return true;
  });

  const uniqueClients = [...new Set(devis.map(d => d.clientId))].map(id => clients.find(c => c.id === id)).filter(Boolean);

  function populateForm(d: DevisType) {
    setClientId(d.clientId);
    setDateCreation(d.dateCreation);
    setDateValidite(d.dateValidite);
    setReferenceAffaire(d.referenceAffaire || '');
    setNotes(d.notes || '');
    setConditions(d.conditions || 'Paiement à 30 jours à compter de la date de facturation.');
    setLignes(d.lignes.map(l => ({ ...l, id: l.id })));
    setFraisPortHT(d.fraisPortHT || 0);
    setFraisPortTVA(d.fraisPortTVA ?? 20);
    setAdresseLivraisonId(d.adresseLivraisonId || '');
    setModeCalcul(d.modeCalcul || 'standard');
    setSurfaceGlobaleM2(d.surfaceGlobaleM2 || 0);
  }

  function openNew() {
    setEditingId(null);
    setClientId('');
    setDateCreation(new Date().toISOString().split('T')[0]);
    setDateValidite(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setStatut('brouillon');
    setReferenceAffaire('');
    setNotes('');
    setConditions('Paiement à 30 jours à compter de la date de facturation.');
    setLignes([{ id: generateId(), description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, tva: 20, remise: 0 }]);
    setFraisPortHT(0);
    setFraisPortTVA(20);
    setFraisPortAuto(true);
    setModeCalcul('standard');
    setSurfaceGlobaleM2(0);
    setAdresseLivraisonId('');
    setDialogOpen(true);
  }

  function openEdit(d: DevisType) {
    setEditingId(d.id);
    populateForm(d);
    setDialogOpen(true);
  }

  function duplicate(d: DevisType) {
    const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
    const newDevis: DevisType = {
      ...d,
      id: generateId(),
      numero,
      dateCreation: new Date().toISOString().split('T')[0],
      dateValidite: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      statut: 'brouillon',
      lignes: d.lignes.map(l => ({ ...l, id: generateId() })),
    };
    updateDevis(prev => [...prev, newDevis]);
    toast.success('Devis dupliqué');
  }

  function addLigne() {
    setLignes(prev => [...prev, { id: generateId(), description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, tva: 20, remise: 0 }]);
  }

  function updateLigne(id: string, field: string, value: any) {
    setLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  function removeLigne(id: string) {
    setLignes(prev => prev.filter(l => l.id !== id));
  }

  function calcQuantiteSurface(produit: typeof produits[0], surface: number, consoOverride?: number): number {
    const conso = consoOverride || produit.consommation;
    if (!conso || conso <= 0 || !produit.poids || produit.poids <= 0) return 1;
    const kgNeeded = surface * conso;
    return Math.ceil(kgNeeded / produit.poids);
  }

  function selectProduit(ligneId: string, produitId: string) {
    const p = produits.find(pr => pr.id === produitId);
    if (p) {
      const client = clients.find(c => c.id === clientId);
      let prix = p.prixHT;
      let remise = 0;
      if (client?.estRevendeur) {
        remise = client.remisesParCategorie?.[p.categorie || ''] ?? 30;
      }
      let quantite = 1;
      if (modeCalcul === 'surface' && surfaceGlobaleM2 > 0 && p.consommation && p.poids) {
        quantite = calcQuantiteSurface(p, surfaceGlobaleM2);
      }
      setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, produitId: p.id, description: p.description, prixUnitaireHT: prix, tva: p.tva, unite: p.unite, remise, quantite: modeCalcul === 'surface' ? quantite : l.quantite, surfaceM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined, consommation: undefined } : l));
    }
  }

  // Recalculer les prix quand le client change (revendeur / remises par catégorie)
  const prevClientIdRef = useRef(clientId);
  useEffect(() => {
    if (!dialogOpen || clientId === prevClientIdRef.current) {
      prevClientIdRef.current = clientId;
      return;
    }
    prevClientIdRef.current = clientId;
    const client = clients.find(c => c.id === clientId);
    setLignes(prev => prev.map(l => {
      if (!l.produitId) return l;
      const p = produits.find(pr => pr.id === l.produitId);
      if (!p) return l;
      let prix = p.prixHT;
      let remise = 0;
      if (client?.estRevendeur) {
        remise = client.remisesParCategorie?.[p.categorie || ''] ?? 30;
      }
      return { ...l, prixUnitaireHT: prix, remise };
    }));
  }, [clientId, dialogOpen, clients, produits]);

  function save(silent = false): string | null {
    if (!clientId) { if (!silent) toast.error('Sélectionnez un client'); return null; }
    if (lignes.length === 0) { if (!silent) toast.error('Ajoutez au moins une ligne'); return null; }

    let savedId = editingId;
    if (editingId) {
      updateDevis(prev => prev.map(d => d.id === editingId ? {
        ...d, clientId, dateCreation, dateValidite, statut, lignes, referenceAffaire, notes, conditions, fraisPortHT, fraisPortTVA, adresseLivraisonId: adresseLivraisonId || undefined, modeCalcul, surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined
      } : d));
      if (!silent) toast.success('Devis modifié');
    } else {
      const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
      savedId = generateId();
      const newDevis: DevisType = {
        id: savedId, numero, clientId, adresseLivraisonId: adresseLivraisonId || undefined, dateCreation,
        dateValidite, statut, lignes, referenceAffaire, notes, conditions, fraisPortHT, fraisPortTVA, modeCalcul, surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined
      };
      updateDevis(prev => [...prev, newDevis]);
      if (!silent) toast.success('Devis créé');
    }
    if (!silent) {
      setDialogOpen(false);
      setEditingId(null);
    }
    return savedId;
  }

  // Auto-save en temps réel pour les devis en édition
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!editingId || !dialogOpen) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      if (clientId && lignes.length > 0) {
        updateDevis(prev => prev.map(d => d.id === editingId ? {
          ...d, clientId, dateCreation, dateValidite, statut, lignes, referenceAffaire, notes, conditions, fraisPortHT, fraisPortTVA, adresseLivraisonId: adresseLivraisonId || undefined, modeCalcul, surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined
        } : d));
      }
    }, 500);
    return () => clearTimeout(autoSaveRef.current);
  }, [clientId, dateCreation, dateValidite, statut, lignes, referenceAffaire, notes, conditions, fraisPortHT, fraisPortTVA, adresseLivraisonId, editingId, dialogOpen, modeCalcul, surfaceGlobaleM2]);

  // Recalcul auto des quantités en mode surface
  useEffect(() => {
    if (modeCalcul !== 'surface' || !dialogOpen || surfaceGlobaleM2 <= 0) return;
    setLignes(prev => prev.map(l => {
      if (!l.produitId) return l;
      const p = produits.find(pr => pr.id === l.produitId);
      if (!p || !p.poids) return l;
      const conso = l.consommation || p.consommation;
      if (!conso) return l;
      const quantite = calcQuantiteSurface(p, l.surfaceM2 || surfaceGlobaleM2, l.consommation);
      return { ...l, quantite, surfaceM2: l.surfaceM2 || surfaceGlobaleM2 };
    }));
  }, [surfaceGlobaleM2, modeCalcul, dialogOpen]);

  // Auto-calcul frais de port basé sur le poids
  useEffect(() => {
    if (!fraisPortAuto || !dialogOpen) return;
    const poidsTotal = lignes.reduce((acc, l) => {
      const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
      return acc + (prod?.poids || 0) * l.quantite;
    }, 0);
    const hasGranulat = lignes.some(l => {
      const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
      return prod?.categorie?.toLowerCase().includes('granulat');
    });
    const port = calculerFraisPort(poidsTotal, hasGranulat);
    if (port !== null) {
      setFraisPortHT(port);
    }
  }, [lignes, fraisPortAuto, dialogOpen, produits]);

  function updateStatut(id: string, newStatut: DevisType['statut']) {
    updateDevis(prev => prev.map(d => d.id === id ? { ...d, statut: newStatut } : d));
    toast.success('Statut mis à jour');
  }

  function confirmRemove(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTargetId) {
      updateDevis(prev => prev.filter(d => d.id !== deleteTargetId));
      toast.success('Devis supprimé');
      setDeleteTargetId(null);
      setDeleteConfirmOpen(false);
    }
  }

  const total = calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => exportToExcel(devis.map(d => { const client = clients.find(c => c.id === d.clientId); const totals = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA); return { Numéro: d.numero, Client: client?.nom || '', Société: client?.societe || '', Date: d.dateCreation, Validité: d.dateValidite, Statut: d.statut, 'Réf. Affaire': d.referenceAffaire || '', 'Total HT': totals.totalHT, 'Total TVA': totals.totalTVA, 'Total TTC': totals.totalTTC, Notes: d.notes || '' }; }), 'devis', 'Devis')}><Download className="w-4 h-4 mr-2" /> Exporter</Button>
            <Button onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Nouveau devis</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
            <option value="tous">Tous les statuts</option>
            <option value="brouillon">Brouillon</option>
            <option value="envoyé">Envoyé</option>
            <option value="accepté">Accepté</option>
            <option value="refusé">Refusé</option>
            <option value="expiré">Expiré</option>
          </select>
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
            <option value="tous">Tous les clients</option>
            {uniqueClients.map(c => c && <option key={c.id} value={c.id}>{c.societe || c.nom}</option>)}
          </select>
          <select value={filterPeriode} onChange={e => setFilterPeriode(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
            <option value="tous">Toutes les périodes</option>
            <option value="mois">Ce mois</option>
            <option value="trimestre">Ce trimestre</option>
            <option value="annee">Cette année</option>
          </select>
          {(filterStatut !== 'tous' || filterClient !== 'tous' || filterPeriode !== 'tous') && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterStatut('tous'); setFilterClient('tous'); setFilterPeriode('tous'); }} className="text-xs text-muted-foreground">
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(d => {
          const client = clients.find(c => c.id === d.clientId);
          const t = calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20);
          return (
            <div key={d.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-heading font-semibold">{d.numero}</p>
                    {d.referenceAffaire && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                        {d.referenceAffaire}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColors[d.statut]}`}>{d.statut}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {client ? (
                      <button
                        onClick={() => navigate(`/clients?search=${encodeURIComponent(client.nom)}`)}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <User className="w-3 h-3" />
                        {client.nom}{client.societe ? ` — ${client.societe}` : ''}
                      </button>
                    ) : '—'}
                    {' • '}{formatDate(d.dateCreation)}
                  </p>
                  {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-heading font-bold text-lg">{formatMontant(t.totalTTC)}</p>
                    <p className="text-xs text-muted-foreground">TTC</p>
                  </div>
                  <div className="flex gap-1">
                    <select
                      className="text-xs rounded border border-input bg-background px-2 py-1"
                      value={d.statut}
                      onChange={e => updateStatut(d.id, e.target.value as DevisType['statut'])}
                    >
                      <option value="brouillon">Brouillon</option>
                      <option value="envoyé">Envoyé</option>
                      <option value="accepté">Accepté</option>
                      <option value="refusé">Refusé</option>
                      <option value="expiré">Expiré</option>
                    </select>
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded-md hover:bg-muted" title="Modifier"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => duplicate(d)} className="p-1.5 rounded-md hover:bg-muted" title="Dupliquer"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => setPreviewDevis(d)} className="p-1.5 rounded-md hover:bg-muted" title="Aperçu"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => confirmRemove(d.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun devis</p>}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Modifier le devis' : 'Nouveau devis'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <Label>Client *</Label>
                  {clientId && (
                    <button
                      type="button"
                      onClick={() => {
                        const savedId = save(true);
                        const devisId = savedId || editingId;
                        if (devisId) {
                          navigate(`/clients?search=${encodeURIComponent(clients.find(c => c.id === clientId)?.nom || '')}&returnDevis=${devisId}`);
                        } else {
                          navigate(`/clients?search=${encodeURIComponent(clients.find(c => c.id === clientId)?.nom || '')}`);
                        }
                      }}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Voir fiche
                    </button>
                  )}
                </div>
                <ClientCombobox
                  clients={clients}
                  value={clientId}
                  onSelect={setClientId}
                />
                {(() => {
                  const selectedClient = clients.find(c => c.id === clientId);
                  if (!selectedClient) return null;
                  return (
                    <div className="mt-2 bg-muted/30 rounded-lg border border-border p-3 text-xs space-y-1">
                      {selectedClient.societe && <p className="font-medium text-sm">{selectedClient.societe}</p>}
                      <p className="text-muted-foreground">{selectedClient.adresse}</p>
                      <p className="text-muted-foreground">{selectedClient.codePostal} {selectedClient.ville}</p>
                      {selectedClient.email && <p className="text-muted-foreground">{selectedClient.email}</p>}
                      {selectedClient.telephone && <p className="text-muted-foreground">{selectedClient.telephone}</p>}
                      {selectedClient.adressesLivraison?.length > 0 && (
                        <div className="border-t border-border pt-2 mt-2 space-y-1">
                          <p className="font-medium text-muted-foreground">Adresses :</p>
                          {selectedClient.adressesLivraison.map(a => (
                            <div key={a.id} className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1.5 py-0 rounded-full border ${a.type === 'facturation' ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}>
                                {a.type === 'facturation' ? 'Fact.' : 'Livr.'}
                              </span>
                              <span>{a.libelle} — {a.adresse}, {a.codePostal} {a.ville}</span>
                              {a.parDefaut && <span className="text-[10px] text-primary font-medium">(défaut)</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label>Date de création</Label>
                <Input type="date" value={dateCreation} onChange={e => setDateCreation(e.target.value)} />
              </div>
              <div>
                <Label>Date de validité</Label>
                <Input type="date" value={dateValidite} onChange={e => setDateValidite(e.target.value)} />
              </div>
              <div>
                <Label>Statut</Label>
                <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={statut} onChange={e => setStatut(e.target.value as any)}>
                  <option value="brouillon">Brouillon</option>
                  <option value="envoyé">Envoyé</option>
                  <option value="accepté">Accepté</option>
                  <option value="refusé">Refusé</option>
                  <option value="expiré">Expiré</option>
                </select>
              </div>
            </div>
            {/* Adresse de livraison */}
            {(() => {
              const selectedClient = clients.find(c => c.id === clientId);
              const allAdresses = selectedClient?.adressesLivraison || [];
              if (!selectedClient || allAdresses.length === 0) return null;
              return (
                <div>
                  <Label>Adresse de livraison</Label>
                  <select
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={adresseLivraisonId}
                    onChange={e => setAdresseLivraisonId(e.target.value)}
                  >
                    <option value="">— Identique à l'adresse du client —</option>
                    {allAdresses.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.type === 'facturation' ? '[Fact.]' : '[Livr.]'} {a.libelle} — {a.adresse}, {a.codePostal} {a.ville} {a.parDefaut ? '(défaut)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}
            <div>
              <Label>Référence affaire</Label>
              <Input placeholder="Ex: AFF-2024-001" value={referenceAffaire} onChange={e => setReferenceAffaire(e.target.value)} />
            </div>

            {/* Mode de calcul */}
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Mode de calcul</p>
                <div className="flex gap-2">
                  <Button variant={modeCalcul === 'standard' ? 'default' : 'outline'} size="sm" onClick={() => setModeCalcul('standard')}>Standard</Button>
                  <Button variant={modeCalcul === 'surface' ? 'default' : 'outline'} size="sm" onClick={() => setModeCalcul('surface')}>Surface (m²)</Button>
                </div>
              </div>
              {modeCalcul === 'surface' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Les quantités sont calculées automatiquement : Surface × Consommation (kg/m²) ÷ Conditionnement (kg) = Nb unités</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Surface globale (m²)</Label>
                      <Input type="number" step="0.01" value={surfaceGlobaleM2 || ''} onChange={e => setSurfaceGlobaleM2(parseFloat(e.target.value) || 0)} placeholder="Ex: 50" className="h-8 text-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Lignes du devis</Label>
                <Button variant="outline" size="sm" onClick={addLigne}><Plus className="w-3 h-3 mr-1" /> Ligne</Button>
              </div>
              <div className="space-y-3">
                {lignes.map((l, i) => (
                  <div key={l.id} className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Ligne {i + 1}</span>
                      <button onClick={() => removeLigne(l.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Réf.</Label>
                        <div className="flex gap-1 items-end">
                          <div className="flex-1">
                            <ProduitCombobox
                              produits={produits}
                              value={l.produitId || ''}
                              onSelect={(produitId) => produitId ? selectProduit(l.id, produitId) : updateLigne(l.id, 'produitId', undefined)}
                            />
                          </div>
                          {l.produitId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title="Voir la fiche produit"
                              onClick={() => {
                                const savedId = save(true);
                                const devisId = savedId || editingId;
                                const prod = produits.find(p => p.id === l.produitId);
                                navigate(`/produits?search=${encodeURIComponent(prod?.reference || '')}&returnDevis=${devisId || ''}`);
                              }}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input value={l.description} onChange={e => updateLigne(l.id, 'description', e.target.value)} className="h-8 text-sm" />
                      </div>
                    </div>
                    {modeCalcul === 'surface' && (
                      <div className="grid grid-cols-3 gap-2 bg-accent/30 rounded-md p-2">
                        <div>
                          <Label className="text-xs">Surface (m²)</Label>
                          <Input type="number" step="0.01" value={l.surfaceM2 || ''} onChange={e => {
                            const surface = parseFloat(e.target.value) || 0;
                            const p = l.produitId ? produits.find(pr => pr.id === l.produitId) : null;
                            const quantite = p && (l.consommation || p.consommation) && p.poids ? calcQuantiteSurface(p, surface, l.consommation) : l.quantite;
                            setLignes(prev => prev.map(li => li.id === l.id ? { ...li, surfaceM2: surface, quantite } : li));
                          }} className="h-8 text-sm" />
                        </div>
                        {(() => {
                          const p = l.produitId ? produits.find(pr => pr.id === l.produitId) : null;
                          const consoValue = l.consommation || p?.consommation || 0;
                          return (
                            <>
                              <div>
                                <Label className="text-xs">Conso. (kg/m²)</Label>
                                <Input type="number" step="0.01" value={consoValue || ''} onChange={e => {
                                  const conso = parseFloat(e.target.value) || 0;
                                  const surface = l.surfaceM2 || surfaceGlobaleM2;
                                  const quantite = p && p.poids && conso > 0 ? calcQuantiteSurface(p, surface, conso) : l.quantite;
                                  setLignes(prev => prev.map(li => li.id === l.id ? { ...li, consommation: conso || undefined, quantite } : li));
                                }} className="h-8 text-sm" placeholder={p?.consommation ? String(p.consommation) : '—'} />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Poids (kg)</Label>
                                <Input value={p?.poids ? `${p.poids} kg` : '—'} readOnly className="h-8 text-sm bg-muted/50" />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div className={`grid gap-2 ${modeCalcul === 'surface' ? 'grid-cols-4' : 'grid-cols-4'}`}>
                       <div><Label className="text-xs">Qté {modeCalcul === 'surface' ? '(auto)' : ''}</Label><Input type="number" value={l.quantite || ''} onChange={e => updateLigne(l.id, 'quantite', e.target.value === '' ? 0 : parseFloat(e.target.value))} className={`h-8 text-sm ${modeCalcul === 'surface' ? 'bg-accent/20 font-medium' : ''}`} readOnly={modeCalcul === 'surface' && !!(l.produitId && produits.find(p => p.id === l.produitId)?.consommation)} /></div>
                       <div><Label className="text-xs">Unité</Label><Input value={l.unite || ''} onChange={e => updateLigne(l.id, 'unite', e.target.value)} className="h-8 text-sm" /></div>
                       <div><Label className="text-xs">Remise %</Label><Input type="number" value={l.remise || ''} onChange={e => updateLigne(l.id, 'remise', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-8 text-sm" /></div>
                       <div>
                         <Label className="text-xs">Prix remisé</Label>
                         <Input value={formatMontant(l.prixUnitaireHT * (1 - l.remise / 100))} readOnly className="h-8 text-sm bg-muted/50" />
                       </div>
                    </div>
                    {(() => {
                      const t = calculerTotalLigne(l);
                      const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                      const prixNetHT = l.prixUnitaireHT * (1 - l.remise / 100);
                      const tauxMarque = prod && prixNetHT > 0 ? ((prixNetHT - prod.prixAchat) / prixNetHT) * 100 : null;
                      const coeff = prod && prod.prixAchat > 0 ? prixNetHT / prod.prixAchat : null;
                      const prixKg = prod?.poids && prod.poids > 0 ? prixNetHT / prod.poids : null;
                      return (
                        <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-x-3">
                          <div className="flex items-center gap-3">
                            {tauxMarque !== null ? (
                              <span className={tauxMarque < 0 ? 'text-destructive font-medium' : 'text-emerald-600 dark:text-emerald-400'}>
                                Marge: {tauxMarque.toFixed(1)}%
                              </span>
                            ) : null}
                            {coeff !== null && (
                              <span>Coeff: {coeff.toFixed(2)}</span>
                            )}
                            {prixKg !== null && (
                              <span>{formatMontant(prixKg)}/kg</span>
                            )}
                          </div>
                          <span>Total HT: {formatMontant(t.totalHT)}</span>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>

            {/* Frais de port */}
            <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Frais de port</p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={fraisPortAuto} onChange={e => setFraisPortAuto(e.target.checked)} className="rounded" />
                  Auto (selon poids)
                </label>
              </div>
              {fraisPortAuto && (() => {
                const poidsTotal = lignes.reduce((acc, l) => {
                  const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                  return acc + (prod?.poids || 0) * l.quantite;
                }, 0);
                const hasGranulat = lignes.some(l => {
                  const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                  return prod?.categorie?.toLowerCase().includes('granulat');
                });
                const port = calculerFraisPort(poidsTotal, hasGranulat);
                return (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Poids total : <span className="font-medium">{poidsTotal.toFixed(2)} kg</span></p>
                    {port === null && <p className="text-amber-600 dark:text-amber-400 font-medium">⚠ &gt;2000 kg avec granulat : tarif hors catégorie</p>}
                    {port === 0 && poidsTotal > 2000 && <p className="text-emerald-600 dark:text-emerald-400 font-medium">Franco de port (&gt;2000 kg)</p>}
                    <p className="text-[10px]">0-25 kg: 49€ · 26-100 kg: 85€ · 101-700 kg: 178€ · 701-2000 kg: 230€ · &gt;2000 kg: franco</p>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Montant HT</Label>
                  <Input type="number" step="0.01" value={fraisPortHT || ''} onChange={e => { setFraisPortAuto(false); setFraisPortHT(e.target.value === '' ? 0 : parseFloat(e.target.value)); }} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">TVA %</Label>
                  <Input type="number" value={fraisPortTVA} onChange={e => setFraisPortTVA(parseFloat(e.target.value) || 20)} className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Totals */}
            {(() => {
              const poidsTotal = lignes.reduce((acc, l) => {
                const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                return acc + (prod?.poids || 0) * l.quantite;
              }, 0);
              const totalAchat = lignes.reduce((acc, l) => {
                const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                return acc + (prod?.prixAchat || 0) * l.quantite;
              }, 0);
              const totalHTLignes = calculerTotalDevis(lignes, 0, 0).totalHT;
              const margeTotal = totalHTLignes - totalAchat;
              const tauxMarque = totalHTLignes > 0 ? (margeTotal / totalHTLignes) * 100 : 0;
              return (
                <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Total HT (lignes)</span><span className="font-semibold">{formatMontant(totalHTLignes)}</span></div>
                  {fraisPortHT > 0 && <div className="flex justify-between"><span>Frais de port HT</span><span>{formatMontant(fraisPortHT)}</span></div>}
                  <div className="flex justify-between"><span>Total TVA</span><span>{formatMontant(total.totalTVA)}</span></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="font-semibold">Total TTC</span><span className="font-heading font-bold text-lg">{formatMontant(total.totalTTC)}</span></div>
                  {modeCalcul === 'surface' && surfaceGlobaleM2 > 0 && (
                    <div className="flex justify-between border-t border-border pt-2 mt-2 text-muted-foreground">
                      <span>Surface</span>
                      <span className="font-medium">{surfaceGlobaleM2} m²</span>
                    </div>
                  )}
                  <div className={`flex justify-between ${modeCalcul !== 'surface' ? 'border-t border-border pt-2 mt-2' : ''} text-muted-foreground`}>
                    <span>Poids total</span>
                    <span className="font-medium">{poidsTotal.toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Marge totale</span>
                    <span className={`font-medium ${margeTotal < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatMontant(margeTotal)} ({tauxMarque.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              );
            })()}

            <div><Label>Notes</Label><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div><Label>Conditions</Label><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={conditions} onChange={e => setConditions(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={() => save()}><FileText className="w-4 h-4 mr-2" /> {editingId ? 'Enregistrer' : 'Créer le devis'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {previewDevis && (
        <Dialog open={!!previewDevis} onOpenChange={() => setPreviewDevis(null)}>
          <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0">
            <DevisPreview devis={previewDevis} client={clients.find(c => c.id === previewDevis.clientId)} produits={produits} onEdit={() => { const d = previewDevis; setPreviewDevis(null); setEditingId(d.id); populateForm(d); setDialogOpen(true); }} />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>Êtes-vous sûr de vouloir supprimer ce devis ? Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
