import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, calculerTotalDevis, calculerTotalLigne, calculerFraisPort, calculerFraisPortBareme, BAREMES_TRANSPORT, formatMontant, formatDate, type Devis as DevisType, type LigneDevis, type TransporteurType, type CommandeClient } from '@/lib/store';
import { Plus, Search, Eye, Trash2, FileText, Pencil, Copy, ExternalLink, Download, User, Mail, ShoppingCart, ArrowUp, ArrowDown, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/exportExcel';
import { logHistorique } from '@/lib/historique';
import DevisPreview from '@/components/DevisPreview';
import ProduitCombobox from '@/components/ProduitCombobox';
import ClientCombobox from '@/components/ClientCombobox';
import DevisEmailDialog from '@/components/DevisEmailDialog';
import CommandeFournisseurDialog from '@/components/CommandeFournisseurDialog';
import EmailAnalyzerDialog from '@/components/EmailAnalyzerDialog';

const statutColors: Record<string, string> = {
  brouillon: 'bg-muted text-muted-foreground',
  envoyé: 'bg-info/10 text-info',
  accepté: 'bg-success/10 text-success',
  refusé: 'bg-destructive/10 text-destructive',
  expiré: 'bg-muted text-muted-foreground',
};

export default function Devis() {
  const { devis, updateDevis, clients, produits, updateProduits, fournisseurs, produitFournisseurs, commandesFournisseur, updateCommandesFournisseur, commandesClient, updateCommandesClient } = useCRM();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [filterClient, setFilterClient] = useState<string>('tous');
  const [filterContact, setFilterContact] = useState<string>('');
  const [filterProduit, setFilterProduit] = useState<string>('');
  const [filterPeriode, setFilterPeriode] = useState<string>('tous');
  const [sortBy, setSortBy] = useState<string>('date_desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewDevis, setPreviewDevis] = useState<DevisType | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emailDevis, setEmailDevis] = useState<DevisType | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [previewOptions, setPreviewOptions] = useState({ showConso: false, showRemise: false, showComposants: false, showKgRecap: true });
  const [commandeDevis, setCommandeDevis] = useState<DevisType | null>(null);
  const [commandeConfirmDevis, setCommandeConfirmDevis] = useState<DevisType | null>(null);
  const [emailAnalyzerOpen, setEmailAnalyzerOpen] = useState(false);

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
  const [contactId, setContactId] = useState('');
  const [dateCreation, setDateCreation] = useState(new Date().toISOString().split('T')[0]);
  const [dateValidite, setDateValidite] = useState('');
  const [statut, setStatut] = useState<DevisType['statut']>('brouillon');
  const [dateEnvoi, setDateEnvoi] = useState('');
  const [referenceAffaire, setReferenceAffaire] = useState('');
  const [systeme, setSysteme] = useState('');
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('Paiement à 30 jours à compter de la date de facturation.');
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [fraisPortHT, setFraisPortHT] = useState(0);
  const [fraisPortTVA, setFraisPortTVA] = useState(20);
  const [fraisPortAuto, setFraisPortAuto] = useState(true);
  const [transporteur, setTransporteur] = useState<TransporteurType>('standard');
  const [coeffTransport, setCoeffTransport] = useState(1.4);
  const [expressJ1, setExpressJ1] = useState(false);
  const [coeffExpress, setCoeffExpress] = useState(1.8);
  const [modeCalcul, setModeCalcul] = useState<'standard' | 'surface'>('standard');
  const [surfaceGlobaleM2, setSurfaceGlobaleM2] = useState(0);
  const [adresseLivraisonId, setAdresseLivraisonId] = useState('');

  const filtered = devis.filter(d => {
    const client = clients.find(c => c.id === d.clientId);
    const matchSearch = [d.numero, client?.nom, client?.societe, d.statut, d.referenceAffaire, d.notes].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    if (filterStatut !== 'tous' && d.statut !== filterStatut) return false;
    if (filterClient !== 'tous' && d.clientId !== filterClient) return false;
    if (filterContact.trim()) {
      const fc = filterContact.trim().toLowerCase();
      const client = clients.find(c => c.id === d.clientId);
      const ct = d.contactId ? (client?.contacts || []).find(c => c.id === d.contactId) : null;
      const inContact = ct
        ? [ct.nom, ct.prenom, ct.email, ct.telephone, ct.fonction].some(v => v?.toLowerCase().includes(fc))
        : [client?.nom, client?.email].some(v => v?.toLowerCase().includes(fc));
      if (!inContact) return false;
    }
    if (filterProduit.trim()) {
      const fp = filterProduit.trim().toLowerCase();
      const inLignes = d.lignes.some(l => {
        if (l.description?.toLowerCase().includes(fp)) return true;
        const p = l.produitId ? produits.find(pr => pr.id === l.produitId) : null;
        return p && (p.reference.toLowerCase().includes(fp) || p.description.toLowerCase().includes(fp));
      });
      if (!inLignes) return false;
    }
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

  const sorted = [...filtered].sort((a, b) => {
    const clientA = clients.find(c => c.id === a.clientId);
    const clientB = clients.find(c => c.id === b.clientId);
    switch (sortBy) {
      case 'date_asc':  return a.dateCreation.localeCompare(b.dateCreation);
      case 'date_desc': return b.dateCreation.localeCompare(a.dateCreation);
      case 'total_asc':  return calculerTotalDevis(a.lignes, a.fraisPortHT || 0, a.fraisPortTVA ?? 20).totalHT - calculerTotalDevis(b.lignes, b.fraisPortHT || 0, b.fraisPortTVA ?? 20).totalHT;
      case 'total_desc': return calculerTotalDevis(b.lignes, b.fraisPortHT || 0, b.fraisPortTVA ?? 20).totalHT - calculerTotalDevis(a.lignes, a.fraisPortHT || 0, a.fraisPortTVA ?? 20).totalHT;
      case 'numero_asc':  return a.numero.localeCompare(b.numero);
      case 'numero_desc': return b.numero.localeCompare(a.numero);
      case 'client_asc':  return (clientA?.societe || clientA?.nom || '').localeCompare(clientB?.societe || clientB?.nom || '');
      case 'client_desc': return (clientB?.societe || clientB?.nom || '').localeCompare(clientA?.societe || clientA?.nom || '');
      default: return 0;
    }
  });

  const uniqueClients = [...new Set(devis.map(d => d.clientId))].map(id => clients.find(c => c.id === id)).filter(Boolean);



  function populateForm(d: DevisType) {
    setClientId(d.clientId);
    setContactId(d.contactId || '');
    setDateCreation(d.dateCreation);
    setDateValidite(d.dateValidite);
    setStatut(d.statut);
    setDateEnvoi(d.dateEnvoi || '');
    setReferenceAffaire(d.referenceAffaire || '');
    setSysteme(d.systeme || '');
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
    setContactId('');
    setDateCreation(new Date().toISOString().split('T')[0]);
    setDateValidite(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setStatut('brouillon');
    setDateEnvoi('');
    setReferenceAffaire('');
    setSysteme('');
    setNotes('');
    setConditions('Paiement à 30 jours à compter de la date de facturation.');
    setLignes([{ id: generateId(), description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, tva: 20, remise: 0 }]);
    setFraisPortHT(0);
    setFraisPortTVA(20);
    setFraisPortAuto(true);
    setTransporteur('standard');
    setCoeffTransport(1.4);
    setExpressJ1(false);
    setCoeffExpress(1.8);
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

  const [newLigneId, setNewLigneId] = useState<string | null>(null);

  function addLigne() {
    const id = generateId();
    setLignes(prev => [...prev, { id, description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, tva: 20, remise: 0 }]);
    setNewLigneId(id);
  }

  function updateLigne(id: string, field: string, value: any) {
    setLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  function removeLigne(id: string) {
    setLignes(prev => prev.filter(l => l.id !== id));
  }

  function moveLigne(id: string, direction: 'up' | 'down') {
    setLignes(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
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
      const existing = devis.find(d => d.id === editingId);
      updateDevis(prev => prev.map(d => d.id === editingId ? {
        ...d, clientId, contactId: contactId || undefined, dateCreation, dateValidite, statut, dateEnvoi: dateEnvoi || undefined, lignes, referenceAffaire, systeme: systeme || undefined, notes, conditions, fraisPortHT, fraisPortTVA, adresseLivraisonId: adresseLivraisonId || undefined, modeCalcul, surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined
      } : d));
      if (!silent) {
        toast.success('Devis modifié');
        logHistorique({ entiteType: 'devis', entiteId: editingId, entiteNumero: existing?.numero ?? editingId, action: 'modification', details: { client: clients.find(c => c.id === clientId)?.nom, referenceAffaire: referenceAffaire || undefined } });
      }
    } else {
      const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
      savedId = generateId();
      const newDevis: DevisType = {
        id: savedId, numero, clientId, contactId: contactId || undefined, adresseLivraisonId: adresseLivraisonId || undefined, dateCreation,
        dateValidite, statut, dateEnvoi: dateEnvoi || undefined, lignes, referenceAffaire, systeme: systeme || undefined, notes, conditions, fraisPortHT, fraisPortTVA, modeCalcul, surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined
      };
      updateDevis(prev => [...prev, newDevis]);
      if (!silent) {
        toast.success('Devis créé');
        logHistorique({ entiteType: 'devis', entiteId: savedId!, entiteNumero: numero, action: 'creation', details: { client: clients.find(c => c.id === clientId)?.nom, referenceAffaire: referenceAffaire || undefined } });
      }
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
          ...d, clientId, dateCreation, dateValidite, statut, dateEnvoi: dateEnvoi || undefined, lignes, referenceAffaire, notes, conditions, fraisPortHT, fraisPortTVA, adresseLivraisonId: adresseLivraisonId || undefined, modeCalcul, surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined
        } : d));
      }
    }, 500);
    return () => clearTimeout(autoSaveRef.current);
  }, [clientId, dateCreation, dateValidite, statut, dateEnvoi, lignes, referenceAffaire, notes, conditions, fraisPortHT, fraisPortTVA, adresseLivraisonId, editingId, dialogOpen, modeCalcul, surfaceGlobaleM2]);

  // Recalcul auto des quantités en mode surface (uniquement lignes sans surface individuelle)
  useEffect(() => {
    if (modeCalcul !== 'surface' || !dialogOpen || surfaceGlobaleM2 <= 0) return;
    setLignes(prev => prev.map(l => {
      if (!l.produitId) return l;
      if (l.surfaceM2 && l.surfaceM2 > 0 && l.surfaceM2 !== surfaceGlobaleM2) return l;
      const p = produits.find(pr => pr.id === l.produitId);
      if (!p || !p.poids) return l;
      const conso = l.consommation || p.consommation;
      if (!conso) return l;
      const quantite = calcQuantiteSurface(p, surfaceGlobaleM2, l.consommation);
      return { ...l, quantite, surfaceM2: surfaceGlobaleM2 };
    }));
  }, [surfaceGlobaleM2, modeCalcul, dialogOpen]);

  // Auto-calcul frais de port basé sur le poids
  useEffect(() => {
    if (!fraisPortAuto || !dialogOpen) return;
    const poidsTotal = lignes.reduce((acc, l) => {
      const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
      return acc + (prod?.poids || 0) * l.quantite;
    }, 0);

    if (transporteur !== 'standard' && BAREMES_TRANSPORT[transporteur]) {
      const { prix } = calculerFraisPortBareme(BAREMES_TRANSPORT[transporteur].bareme, poidsTotal);
      const coeffTotal = expressJ1 ? coeffTransport * coeffExpress : coeffTransport;
      if (prix !== null) setFraisPortHT(Math.round(prix * coeffTotal * 100) / 100);
    } else {
      const hasGranulat = lignes.some(l => {
        const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
        return prod?.categorie?.toLowerCase().includes('granulat');
      });
      const port = calculerFraisPort(poidsTotal, hasGranulat);
      if (port !== null) setFraisPortHT(port);
    }
  }, [lignes, fraisPortAuto, dialogOpen, produits, transporteur, coeffTransport, expressJ1, coeffExpress]);

  function updateStatut(id: string, newStatut: DevisType['statut']) {
    const d = devis.find(dv => dv.id === id);
    updateDevis(prev => prev.map(dv => dv.id === id ? { ...dv, statut: newStatut } : dv));
    toast.success('Statut mis à jour');
    logHistorique({ entiteType: 'devis', entiteId: id, entiteNumero: d?.numero ?? id, action: 'statut', details: { ancienStatut: d?.statut, nouveauStatut: newStatut } });
    if (newStatut === 'accepté' && d) {
      const devisData = { ...d, statut: newStatut as DevisType['statut'] };

      // Création automatique de la commande client si elle n'existe pas encore
      const dejaExistante = commandesClient.some(c => c.devisId === id);
      if (!dejaExistante) {
        const total = calculerTotalDevis(devisData.lignes, devisData.fraisPortHT, devisData.fraisPortTVA);
        const newNumero = `CMD-${new Date().getFullYear()}-${String(commandesClient.length + 1).padStart(4, '0')}`;
        const newCmd: CommandeClient = {
          id: generateId(),
          clientId: devisData.clientId,
          devisId: devisData.id,
          numero: newNumero,
          dateCreation: new Date().toISOString().split('T')[0],
          statut: 'a_traiter',
          lignes: devisData.lignes,
          totalHT: total.totalHT,
          totalTVA: total.totalTVA,
          totalTTC: total.totalTTC,
          fraisPortHT: devisData.fraisPortHT || 0,
          referenceAffaire: devisData.referenceAffaire || undefined,
          notes: devisData.notes || undefined,
        };
        updateCommandesClient(prev => [...prev, newCmd]);
        toast.success(`✅ Commande client ${newNumero} créée automatiquement`);
      }

      setCommandeConfirmDevis(devisData);
    }
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
          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            <Button variant="outline" onClick={() => exportToExcel(devis.map(d => { const client = clients.find(c => c.id === d.clientId); const totals = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA); return { Numéro: d.numero, Client: client?.nom || '', Société: client?.societe || '', Date: d.dateCreation, Validité: d.dateValidite, Statut: d.statut, 'Réf. Affaire': d.referenceAffaire || '', 'Total HT': totals.totalHT, 'Total TVA': totals.totalTVA, 'Total TTC': totals.totalTTC, Notes: d.notes || '' }; }), 'devis', 'Devis')} className="hidden sm:flex"><Download className="w-4 h-4 mr-2" /> Exporter</Button>
            <Button variant="outline" onClick={() => setEmailAnalyzerOpen(true)} className="hidden sm:flex shrink-0"><Mail className="w-4 h-4 mr-2" /> Analyser un mail</Button>
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
          <select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterContact(''); }} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
            <option value="tous">Tous les clients</option>
            {uniqueClients.map(c => c && <option key={c.id} value={c.id}>{c.societe || c.nom}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={filterContact}
              onChange={e => setFilterContact(e.target.value)}
              placeholder="Filtrer par contact..."
              className="text-sm rounded-md border border-input bg-background pl-8 pr-7 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {filterContact && (
              <button onClick={() => setFilterContact('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">×</button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={filterProduit}
              onChange={e => setFilterProduit(e.target.value)}
              placeholder="Filtrer par produit..."
              className="text-sm rounded-md border border-input bg-background pl-8 pr-3 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {filterProduit && (
              <button onClick={() => setFilterProduit('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">×</button>
            )}
          </div>
          <select value={filterPeriode} onChange={e => setFilterPeriode(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
            <option value="tous">Toutes les périodes</option>
            <option value="mois">Ce mois</option>
            <option value="trimestre">Ce trimestre</option>
            <option value="annee">Cette année</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
            <option value="date_desc">Date ↓</option>
            <option value="date_asc">Date ↑</option>
            <option value="total_desc">Montant ↓</option>
            <option value="total_asc">Montant ↑</option>
            <option value="numero_desc">Numéro ↓</option>
            <option value="numero_asc">Numéro ↑</option>
            <option value="client_asc">Client A→Z</option>
            <option value="client_desc">Client Z→A</option>
          </select>
          {(filterStatut !== 'tous' || filterClient !== 'tous' || filterContact !== '' || filterProduit !== '' || filterPeriode !== 'tous') && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterStatut('tous'); setFilterClient('tous'); setFilterContact(''); setFilterProduit(''); setFilterPeriode('tous'); }} className="text-xs text-muted-foreground">
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {sorted.map(d => {
          const client = clients.find(c => c.id === d.clientId);
          const t = calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20);
          const totalAchatD = d.lignes.reduce((acc, l) => {
            const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
            return acc + (prod?.prixAchat || 0) * l.quantite;
          }, 0);
          const totalHTD = calculerTotalDevis(d.lignes, 0, 0).totalHT;
          const margeD = totalHTD - totalAchatD;
          const tauxMargeD = totalHTD > 0 ? (margeD / totalHTD) * 100 : 0;
          const coeffD = totalAchatD > 0 ? Math.round(totalHTD / totalAchatD * 100) / 100 : null;
          const cfLies = commandesFournisseur.filter(cf => cf.devisId === d.id);
          const devisContact = d.contactId && client
            ? (client.contacts || []).find(ct => ct.id === d.contactId)
            : null;
          const contactLabel = devisContact
            ? [devisContact.prenom, devisContact.nom].filter(Boolean).join(' ') + (devisContact.fonction ? ` · ${devisContact.fonction}` : '')
            : null;
          return (
            <div key={d.id} className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:border-primary/40 transition-colors" onClick={e => { if ((e.target as HTMLElement).closest('select, button, a')) return; openEdit(d); }}>
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
                        onClick={() => navigate(`/clients?search=${encodeURIComponent(client.societe || client.nom)}`)}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <User className="w-3 h-3" />
                        {client.societe || client.nom}
                      </button>
                    ) : '—'}
                    {contactLabel && <span className="text-muted-foreground"> · {contactLabel}</span>}
                    {' • '}{formatDate(d.dateCreation)}
                  </p>
                  {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                  {/* ── BC fournisseurs liés ── */}
                  {d.statut === 'accepté' && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {cfLies.length === 0 ? (
                        <button
                          onClick={() => setCommandeDevis(d)}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          + Créer BC fournisseur
                        </button>
                      ) : (
                        cfLies.map(cf => (
                          <button
                            key={cf.id}
                            onClick={() => navigate(`/commandes?search=${encodeURIComponent(cf.numero)}`)}
                            className="text-xs px-2 py-0.5 rounded-full bg-info/10 text-info font-medium hover:bg-info/20 transition-colors"
                          >
                            {cf.numero}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {totalAchatD > 0 && (
                    <div className="text-right text-xs hidden sm:block">
                      <p className={`font-semibold ${coeffD == null ? 'text-muted-foreground' : coeffD >= 1.6 ? 'text-emerald-600 dark:text-emerald-400' : coeffD >= 1.43 ? 'text-orange-500' : 'text-destructive'}`}>
                        {formatMontant(margeD)} · {tauxMargeD.toFixed(1)}%
                      </p>
                      <p className="text-muted-foreground">Marge · Coeff {coeffD ?? '—'}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="font-heading font-bold text-lg">{formatMontant(t.totalHT)}</p>
                    <p className="text-xs text-muted-foreground">HT</p>
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
                    <button onClick={() => setEmailDevis(d)} className="p-1.5 rounded-md hover:bg-muted" title="Envoyer par email"><Mail className="w-4 h-4" /></button>
                    <button onClick={() => duplicate(d)} className="p-1.5 rounded-md hover:bg-muted" title="Dupliquer"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => setPreviewDevis(d)} className="p-1.5 rounded-md hover:bg-muted" title="Aperçu"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => confirmRemove(d.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun devis</p>}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingId(null); }}>
        <DialogContent className="sm:w-[92vw] sm:max-w-[92vw] sm:max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0"><DialogTitle>{editingId ? 'Modifier le devis' : 'Nouveau devis'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 flex-1 overflow-y-auto overflow-x-hidden pr-1">
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
                  onSelect={(id) => { setClientId(id); setContactId(''); }}
                />
                {(() => {
                  const selectedClient = clients.find(c => c.id === clientId);
                  if (!selectedClient) return null;
                  // Contacts : nouveau format contacts[] + fallback legacy nom/email/tel
                  const storedContacts = selectedClient.contacts || [];
                  const allContacts = storedContacts.length > 0 ? storedContacts : (
                    (selectedClient.nom || selectedClient.email || selectedClient.telephone)
                      ? [{ id: '__legacy__', nom: selectedClient.nom || '', prenom: '', email: selectedClient.email || '', telephone: selectedClient.telephone || '', telephoneMobile: selectedClient.telephoneMobile || '', fonction: '' }]
                      : []
                  );
                  const selectedContact = allContacts.find(ct => ct.id === contactId) ?? (allContacts.length === 1 ? allContacts[0] : undefined);
                  const effectiveContactId = selectedContact?.id || '';
                  const displayEmail = selectedContact?.email || selectedClient.email;
                  const displayTel = selectedContact?.telephone || selectedContact?.telephoneMobile || selectedClient.telephone;
                  return (
                    <div className="mt-2 bg-muted/30 rounded-lg border border-border p-3 text-xs space-y-2">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-sm">{selectedClient.societe || selectedClient.nom}</p>
                        {selectedClient.adresse && <p className="text-muted-foreground">{selectedClient.adresse}</p>}
                        {(selectedClient.codePostal || selectedClient.ville) && <p className="text-muted-foreground">{selectedClient.codePostal} {selectedClient.ville}</p>}
                      </div>
                      {/* Sélecteur de contact — toujours visible si au moins 1 contact */}
                      {allContacts.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Contact</label>
                          <select
                            value={effectiveContactId}
                            onChange={e => setContactId(e.target.value === '__legacy__' ? '' : e.target.value)}
                            className="w-full text-xs rounded border border-input bg-background px-2 py-1.5"
                          >
                            {allContacts.length > 1 && <option value="">— Sélectionner un contact —</option>}
                            {allContacts.map(ct => (
                              <option key={ct.id} value={ct.id}>
                                {[ct.prenom, ct.nom].filter(Boolean).join(' ') || ct.email || 'Contact principal'}
                                {ct.fonction ? ` · ${ct.fonction}` : ''}
                              </option>
                            ))}
                          </select>
                          {selectedContact && (
                            <div className="mt-1 text-muted-foreground space-y-0.5">
                              {selectedContact.email && <p>{selectedContact.email}</p>}
                              {(selectedContact.telephone || selectedContact.telephoneMobile) && (
                                <p>{selectedContact.telephone || selectedContact.telephoneMobile}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {!selectedContact && (displayEmail || displayTel) && (
                        <div className="text-muted-foreground space-y-0.5">
                          {displayEmail && <p>{displayEmail}</p>}
                          {displayTel && <p>{displayTel}</p>}
                        </div>
                      )}
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
                <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={statut} onChange={e => {
                  setStatut(e.target.value as DevisType['statut']);
                }}>
                  <option value="brouillon">Brouillon</option>
                  <option value="envoyé">Envoyé</option>
                  <option value="accepté">Accepté</option>
                  <option value="refusé">Refusé</option>
                  <option value="expiré">Expiré</option>
                </select>
              </div>
              {(statut === 'envoyé' || statut === 'accepté' || statut === 'refusé') && (
                <div>
                  <Label>Date d'envoi</Label>
                  <Input type="date" value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)} />
                </div>
              )}
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
            <div>
              <Label>Système</Label>
              <Input placeholder="Ex: Chape liquide isolante" value={systeme} onChange={e => setSysteme(e.target.value)} />
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
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveLigne(l.id, 'up')} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moveLigne(l.id, 'down')} disabled={i === lignes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeLigne(l.id)} className="text-destructive hover:text-destructive/80 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Réf.</Label>
                        <div className="flex gap-1 items-end">
                          <div className="flex-1">
                            <ProduitCombobox
                              produits={produits}
                              value={l.produitId || ''}
                              onSelect={(produitId) => { produitId ? selectProduit(l.id, produitId) : updateLigne(l.id, 'produitId', undefined); setNewLigneId(null); }}
                              autoFocus={l.id === newLigneId}
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
                    <div>
                      <Label className="text-xs text-muted-foreground">Note (optionnelle)</Label>
                      <Input value={l.note || ''} onChange={e => updateLigne(l.id, 'note', e.target.value || undefined)} placeholder="Remarque sur cette ligne…" className="h-7 text-xs text-muted-foreground" />
                    </div>
                    {modeCalcul === 'surface' && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-accent/30 rounded-md p-2">
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
                          const consoValue = l.consommation ?? p?.consommation ?? '';
                          return (
                            <>
                              <div>
                                <Label className="text-xs">Conso. (kg/m²)</Label>
                                <Input type="number" step="0.01" value={consoValue} onChange={e => {
                                  const raw = e.target.value;
                                  const conso = raw === '' ? undefined : parseFloat(raw);
                                  const surface = l.surfaceM2 || surfaceGlobaleM2;
                                  const quantite = p && p.poids && conso != null && conso > 0 ? calcQuantiteSurface(p, surface, conso) : l.quantite;
                                  setLignes(prev => prev.map(li => li.id === l.id ? { ...li, consommation: conso, quantite } : li));
                                }} className="h-8 text-sm" placeholder={p?.consommation != null ? String(p.consommation) : ''} />
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
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                       <div><Label className="text-xs">Qté {modeCalcul === 'surface' ? '(auto)' : ''}</Label><Input type="number" value={l.quantite || ''} onChange={e => updateLigne(l.id, 'quantite', e.target.value === '' ? 0 : parseFloat(e.target.value))} className={`h-8 text-sm ${modeCalcul === 'surface' ? 'bg-accent/20 font-medium' : ''}`} readOnly={modeCalcul === 'surface' && !!(l.produitId && produits.find(p => p.id === l.produitId)?.consommation)} /></div>
                       <div><Label className="text-xs">Unité</Label><Input value={l.unite || ''} onChange={e => updateLigne(l.id, 'unite', e.target.value)} className="h-8 text-sm" /></div>
                       <div>
                         <Label className="text-xs">Prix HT</Label>
                         <Input type="number" step="0.01" value={l.prixUnitaireHT || ''} onChange={e => updateLigne(l.id, 'prixUnitaireHT', parseFloat(e.target.value) || 0)} className="h-8 text-sm" placeholder="0,00" />
                       </div>
                       <div><Label className="text-xs">Remise %</Label><Input type="number" value={l.remise || ''} onChange={e => updateLigne(l.id, 'remise', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-8 text-sm" /></div>
                       <div>
                         <Label className="text-xs">Prix remisé</Label>
                         <Input
                           type="number" step="0.01"
                           value={l.prixUnitaireHT > 0 ? Math.round(l.prixUnitaireHT * (1 - l.remise / 100) * 100) / 100 : ''}
                           onChange={e => {
                             const net = parseFloat(e.target.value) || 0;
                             const ht = l.remise < 100 ? Math.round(net / (1 - l.remise / 100) * 100) / 100 : net;
                             updateLigne(l.id, 'prixUnitaireHT', ht);
                           }}
                           className="h-8 text-sm"
                           placeholder="0,00"
                         />
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
              <button
                onClick={addLigne}
                className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                <Plus className="w-4 h-4" /> Ajouter une ligne
              </button>
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
              {fraisPortAuto && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTransporteur('standard')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${transporteur === 'standard' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    Standard
                  </button>
                  {Object.entries(BAREMES_TRANSPORT).map(([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setTransporteur(key as TransporteurType); setCoeffTransport(BAREMES_TRANSPORT[key as Exclude<TransporteurType, 'standard'>].coeffDefaut); setCoeffExpress(BAREMES_TRANSPORT[key as Exclude<TransporteurType, 'standard'>].coeffExpressDefaut); }}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${transporteur === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {fraisPortAuto && transporteur !== 'standard' && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={expressJ1} onChange={e => setExpressJ1(e.target.checked)} className="rounded" />
                    <span className="text-xs font-medium">Express J+1</span>
                  </label>
                  {expressJ1 && (
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] whitespace-nowrap">Coeff. Express</Label>
                      <Input type="number" step="0.1" min="1" value={coeffExpress} onChange={e => setCoeffExpress(parseFloat(e.target.value) || 1)} className="h-6 text-xs w-16" />
                    </div>
                  )}
                </div>
              )}
              {fraisPortAuto && (() => {
                const poidsTotal = lignes.reduce((acc, l) => {
                  const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                  return acc + (prod?.poids || 0) * l.quantite;
                }, 0);

                if (transporteur !== 'standard' && BAREMES_TRANSPORT[transporteur]) {
                  const config = BAREMES_TRANSPORT[transporteur];
                  const { prix, palier } = calculerFraisPortBareme(config.bareme, poidsTotal);
                  const coeffTotal = expressJ1 ? coeffTransport * coeffExpress : coeffTransport;
                  return (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Poids total : <span className="font-medium">{poidsTotal.toFixed(2)} kg</span> · Palier {config.label} : {palier}</p>
                      {prix !== null && <p>Tarif brut : {formatMontant(prix)} × {coeffTransport}{expressJ1 ? ` × ${coeffExpress} (express)` : ''} = <span className="font-medium">{formatMontant(prix * coeffTotal)}</span></p>}
                      {prix === null && <p className="text-amber-600 dark:text-amber-400 font-medium">⚠ Hors barème {config.label} : tarif sur devis</p>}
                      <div className="flex items-center gap-2 pt-0.5">
                        <Label className="text-xs whitespace-nowrap">Coeff. {config.label}</Label>
                        <Input type="number" step="0.1" min="0.1" value={coeffTransport} onChange={e => setCoeffTransport(parseFloat(e.target.value) || 1)} className="h-7 text-xs w-20" />
                      </div>
                    </div>
                  );
                }

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
          <div className="flex justify-between gap-2 shrink-0 pt-3 border-t border-border">
            <Button variant="outline" onClick={() => {
              const existing = editingId ? devis.find(d => d.id === editingId) : null;
              const preview: DevisType = {
                id: editingId || 'preview',
                numero: existing?.numero || 'APERÇU',
                clientId, adresseLivraisonId: adresseLivraisonId || undefined,
                dateCreation, dateValidite, statut, lignes, referenceAffaire, systeme: systeme || undefined, notes, conditions,
                fraisPortHT, fraisPortTVA, modeCalcul,
                surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined,
              };
              setPreviewOptions(prev => ({ ...prev, showConso: modeCalcul === 'surface' || prev.showConso }));
              setPreviewDevis(preview);
            }}>
              <Eye className="w-4 h-4 mr-2" /> Aperçu
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={() => save()}><FileText className="w-4 h-4 mr-2" /> {editingId ? 'Enregistrer' : 'Créer le devis'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {previewDevis && (
        <Dialog open={!!previewDevis} onOpenChange={() => setPreviewDevis(null)}>
          <DialogContent className="max-w-[98vw] md:max-w-[960px] max-h-[95vh] overflow-y-auto p-0 bg-muted/30">
            <DevisPreview devis={previewDevis} client={clients.find(c => c.id === previewDevis.clientId)} produits={produits} onEdit={() => { const d = previewDevis; setPreviewDevis(null); setEditingId(d.id); populateForm(d); setDialogOpen(true); }} onOptionsChange={setPreviewOptions} initialShowConso={previewDevis.modeCalcul === 'surface' || previewOptions.showConso} initialShowRemise={previewOptions.showRemise} initialShowComposants={previewOptions.showComposants} initialShowKgRecap={previewOptions.showKgRecap} onPrint={() => { const updated = { ...previewDevis, statut: 'envoyé' as const }; setPreviewDevis(updated); updateDevis(prev => prev.map(d => d.id === previewDevis.id ? updated : d)); toast.success('Statut mis à jour : Envoyé'); }} />
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

      {/* Conteneur caché pour génération PDF */}
      {emailDevis && (
        <div
          ref={pdfContainerRef}
          style={{ position: 'fixed', left: '-9999px', top: '0', width: '794px', background: 'white', zIndex: -1 }}
          aria-hidden="true"
        >
          <DevisPreview
            devis={{ ...emailDevis, statut: 'envoyé' }}
            client={clients.find(c => c.id === emailDevis.clientId)}
            produits={produits}
            hideControls={true}
            initialShowConso={previewOptions.showConso || emailDevis.modeCalcul === 'surface'}
            initialShowRemise={previewOptions.showRemise}
            initialShowComposants={previewOptions.showComposants}
          />
        </div>
      )}

      {/* Email Dialog */}
      <DevisEmailDialog
        open={!!emailDevis}
        onOpenChange={(open) => { if (!open) setEmailDevis(null); }}
        devis={emailDevis}
        client={emailDevis ? clients.find(c => c.id === emailDevis.clientId) : undefined}
        produits={produits}
        pdfContainerRef={pdfContainerRef}
        onSent={(dateEnvoi) => {
          if (emailDevis) {
            updateDevis(prev => prev.map(d =>
              d.id === emailDevis.id ? { ...d, statut: 'envoyé', dateEnvoi } : d
            ));
            toast.success('Devis envoyé — statut et date d\'envoi mis à jour');
            logHistorique({ entiteType: 'devis', entiteId: emailDevis.id, entiteNumero: emailDevis.numero, action: 'envoi_email', details: { destinataire: clients.find(c => c.id === emailDevis.clientId)?.email, dateEnvoi, client: clients.find(c => c.id === emailDevis.clientId)?.nom } });
          }
        }}
      />

      {/* Commande Fournisseur Dialog */}
      <CommandeFournisseurDialog
        open={!!commandeDevis}
        onOpenChange={(open) => { if (!open) setCommandeDevis(null); }}
        devis={commandeDevis}
        produits={produits}
        fournisseurs={fournisseurs}
        produitFournisseurs={produitFournisseurs}
        onSaveCommandes={(commandes) => {
          updateCommandesFournisseur(prev => [...prev, ...commandes]);
        }}
        onPriseStock={(items) => {
          updateProduits(prev => prev.map(p => {
            const item = items.find(i => i.produitId === p.id);
            if (!item) return p;
            return { ...p, stock: Math.max(0, (p.stock ?? 0) - item.quantite) };
          }));
        }}
      />

      {/* Confirmation commande fournisseur quand devis accepté */}
      <AlertDialog open={!!commandeConfirmDevis} onOpenChange={(open) => { if (!open) setCommandeConfirmDevis(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Créer une commande fournisseur ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le devis {commandeConfirmDevis?.numero} a été accepté et une <strong>commande client a été créée automatiquement</strong>. Souhaitez-vous également générer les bons de commande fournisseur correspondants ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Plus tard</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setCommandeDevis(commandeConfirmDevis);
              setCommandeConfirmDevis(null);
            }}>
              Créer la commande
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmailAnalyzerDialog
        open={emailAnalyzerOpen}
        onOpenChange={setEmailAnalyzerOpen}
        onDevisCreated={(devisId) => {
          const d = devis.find(dv => dv.id === devisId);
          if (d) openEdit(d);
        }}
      />
    </div>
  );
}
