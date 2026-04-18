import { useState, useCallback, useRef } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { calculerTotalDevis, formatMontant, calculerDateEcheance, generateId } from '@/lib/store';
import { Users, Package, FileText, AlertTriangle, TrendingUp, Truck, Clock, ScanText, Upload, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AnalyseDocumentDialog from '@/components/AnalyseDocumentDialog';
import EmailToContactDialog, { type ExtractedContact } from '@/components/EmailToContactDialog';
import { toast } from 'sonner';

export default function Dashboard() {
  const { clients, produits, fournisseurs, devis, commandesFournisseur, updateClients, updateFournisseurs } = useCRM();
  const [analyseOpen, setAnalyseOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0); // compteur pour ignorer les dragenter/leave des enfants

  // Email import states
  const [emailImportOpen, setEmailImportOpen] = useState(false);
  const [emailImportType, setEmailImportType] = useState<'client' | 'fournisseur'>('client');
  const [droppedText, setDroppedText] = useState('');
  const [typeChoiceVisible, setTypeChoiceVisible] = useState(false);

  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.some(t => t === 'Files' || t === 'text/plain')) setIsDragging(true);
  }, []);

  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  }, []);

  const handlePageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
      setAnalyseOpen(true);
      return;
    }
    // Detect text drop (email body dragged from email client)
    const text = e.dataTransfer.getData('text/plain');
    if (text?.trim()) {
      setDroppedText(text.trim());
      setTypeChoiceVisible(true);
    }
  }, []);

  function openEmailImport(type: 'client' | 'fournisseur') {
    setEmailImportType(type);
    setTypeChoiceVisible(false);
    setEmailImportOpen(true);
  }

  function handleEmailExtracted(contact: ExtractedContact) {
    const now = new Date().toISOString();
    const name = contact.societe || contact.nom || '—';
    if (emailImportType === 'client') {
      const newClient = {
        id: generateId(),
        nom: contact.nom,
        email: contact.email,
        telephone: contact.telephone,
        telephoneMobile: contact.telephoneMobile || undefined,
        adresse: contact.adresse,
        ville: contact.ville,
        codePostal: contact.codePostal,
        societe: contact.societe,
        notes: contact.notes,
        dateCreation: now,
        adressesLivraison: [],
      };
      updateClients(prev => [newClient, ...prev]);
      toast.success(`Client "${name}" créé avec succès`);
    } else {
      const newFournisseur = {
        id: generateId(),
        nom: contact.nom,
        email: contact.email,
        telephone: contact.telephone,
        telephoneMobile: contact.telephoneMobile || undefined,
        adresse: contact.adresse,
        ville: contact.ville,
        codePostal: contact.codePostal,
        societe: contact.societe || contact.nom,
        notes: contact.notes,
        dateCreation: now,
        francoPort: 0,
        coutTransport: 0,
        delaiReglement: '30j',
      };
      updateFournisseurs(prev => [newFournisseur, ...prev]);
      toast.success(`Fournisseur "${name}" créé avec succès`);
    }
    setDroppedText('');
  }

  const produitsStockBas = produits.filter(p => p.stock < p.stockMin);
  const devisAcceptes = devis.filter(d => d.statut === 'accepté');
  const caTotal = devisAcceptes.reduce((sum, d) => sum + calculerTotalDevis(d.lignes).totalTTC, 0);
  const devisEnCours = devis.filter(d => d.statut === 'envoyé');

  // Calcul marge : totalHT lignes - coût d'achat
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const calcMarge = (filteredDevis: typeof devis) =>
    filteredDevis.reduce((sum, d) => {
      const margeDevis = d.lignes.reduce((acc, l) => {
        const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
        const coutAchat = prod ? prod.prixAchat * l.quantite : 0;
        const montantBrut = l.quantite * l.prixUnitaireHT;
        const remise = montantBrut * (l.remise / 100);
        return acc + (montantBrut - remise - coutAchat);
      }, 0);
      return sum + margeDevis;
    }, 0);

  const devisAnnuels = devisAcceptes.filter(d => new Date(d.dateCreation).getFullYear() === currentYear);
  const devisMensuels = devisAnnuels.filter(d => new Date(d.dateCreation).getMonth() === currentMonth);
  const margeAnnuelle = calcMarge(devisAnnuels);
  const margeMensuelle = calcMarge(devisMensuels);

  // Échéances fournisseurs
  // Priorité : dateEcheance stockée (calculée à la réception) > recalcul depuis dateReception > dateCreation
  const echeancesFournisseurs = commandesFournisseur
    .filter(cf => cf.statut === 'recue' || cf.statut === 'payee')
    .map(cf => {
      const fourn = fournisseurs.find(f => f.id === cf.fournisseurId);
      let dateEch: Date;
      if (cf.dateEcheance) {
        const [y, mo, da] = cf.dateEcheance.split('-').map(Number);
        dateEch = new Date(y, mo - 1, da);
      } else {
        const dateBase = cf.dateReception || cf.dateCreation;
        const delai = fourn?.delaiReglement || '45j FDM';
        dateEch = calculerDateEcheance(dateBase, delai);
      }
      return { cf, fourn, dateEch };
    })
    .sort((a, b) => a.dateEch.getTime() - b.dateEch.getTime());

  const echeancesEchues = echeancesFournisseurs.filter(e => e.dateEch < now);
  const totalEchu = echeancesEchues.reduce((s, e) => s + e.cf.totalTTC, 0);
  const totalEncours = echeancesFournisseurs.reduce((s, e) => s + e.cf.totalTTC, 0);

  const stats = [
    { label: 'Clients', value: clients.length, icon: Users, color: 'text-primary', bg: 'bg-primary/10', link: '/clients' },
    { label: 'Produits', value: produits.length, icon: Package, color: 'text-accent', bg: 'bg-accent/10', link: '/produits' },
    { label: 'Fournisseurs', value: fournisseurs.length, icon: Truck, color: 'text-info', bg: 'bg-info/10', link: '/fournisseurs' },
    { label: 'Devis', value: devis.length, icon: FileText, color: 'text-success', bg: 'bg-success/10', link: '/devis' },
    { label: 'CA Accepté', value: formatMontant(caTotal), icon: TrendingUp, color: 'text-success', bg: 'bg-success/10', link: '/devis' },
    { label: 'Marge annuelle', value: formatMontant(margeAnnuelle), icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10', link: '/devis' },
    { label: 'Marge mensuelle', value: formatMontant(margeMensuelle), icon: TrendingUp, color: 'text-accent', bg: 'bg-accent/10', link: '/devis' },
    { label: 'Stock bas', value: produitsStockBas.length, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', link: '/stock' },
  ];

  const statutColors: Record<string, string> = {
    brouillon: 'bg-muted text-muted-foreground',
    envoyé: 'bg-info/10 text-info',
    accepté: 'bg-success/10 text-success',
    refusé: 'bg-destructive/10 text-destructive',
    expiré: 'bg-muted text-muted-foreground',
  };

  return (
    <div
      className="space-y-6 relative"
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* ── Overlay drag-and-drop plein écran ── */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 pointer-events-none"
          style={{ background: 'rgba(var(--primary-rgb, 59 130 246) / 0.08)', backdropFilter: 'blur(2px)' }}>
          <div className="rounded-3xl border-4 border-dashed border-primary bg-background/80 px-16 py-12 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-20 h-20 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Upload className="w-10 h-10 text-primary animate-bounce" />
            </div>
            <p className="text-2xl font-bold text-primary">Déposer pour analyser</p>
            <p className="text-sm text-muted-foreground text-center">PDF · Excel · Email (.eml / .msg) · Texte d'email</p>
          </div>
        </div>
      )}

      {/* ── Choix client/fournisseur après dépôt de texte ── */}
      {typeChoiceVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-5 max-w-sm w-full mx-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-heading font-semibold text-lg">Email détecté</p>
              <p className="text-sm text-muted-foreground mt-1">Créer un nouveau contact depuis ce texte ?</p>
            </div>
            <div className="flex gap-3 w-full">
              <Button className="flex-1" onClick={() => openEmailImport('client')}>
                <Users className="w-4 h-4 mr-2" />
                Client
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => openEmailImport('fournisseur')}>
                <Truck className="w-4 h-4 mr-2" />
                Fournisseur
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setTypeChoiceVisible(false); setDroppedText(''); }}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(stat => (
          <Link key={stat.label} to={stat.link} className="stat-card flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground truncate">{stat.label}</p>
              <p className="text-xl font-heading font-bold truncate">{stat.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Document analysis */}
      <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ScanText className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Analyse de document</p>
            <p className="text-xs text-muted-foreground">Commande · Devis · Facture · BL — importer un PDF ou coller un email</p>
          </div>
        </div>
        <Button onClick={() => setAnalyseOpen(true)} className="shrink-0">
          <ScanText className="w-4 h-4 mr-2" />
          Analyser
        </Button>
      </div>

      <AnalyseDocumentDialog
        open={analyseOpen}
        onOpenChange={(v) => { setAnalyseOpen(v); if (!v) setDroppedFiles([]); }}
        initialFiles={droppedFiles.length > 0 ? droppedFiles : undefined}
      />

      {/* Email import card */}
      <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-info" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Importer depuis un email</p>
            <p className="text-xs text-muted-foreground">Créer un client ou fournisseur depuis une signature — collez ou glissez un email</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => { setDroppedText(''); setEmailImportType('client'); setEmailImportOpen(true); }}>
            <Users className="w-4 h-4 mr-2" />
            Client
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setDroppedText(''); setEmailImportType('fournisseur'); setEmailImportOpen(true); }}>
            <Truck className="w-4 h-4 mr-2" />
            Fournisseur
          </Button>
        </div>
      </div>

      <EmailToContactDialog
        open={emailImportOpen}
        onOpenChange={(v) => { setEmailImportOpen(v); if (!v) setDroppedText(''); }}
        type={emailImportType}
        onExtracted={handleEmailExtracted}
        initialText={droppedText || undefined}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Encours fournisseurs */}
        {echeancesFournisseurs.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                Échéances fournisseurs
              </h2>
              <Link to="/fournisseurs" className="text-sm text-primary hover:underline">Voir tout</Link>
            </div>
            {totalEchu > 0 && (
              <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium flex justify-between">
                <span>⚠ Montant échu</span>
                <span>{formatMontant(totalEchu)}</span>
              </div>
            )}
            <div className="mb-3 p-2 rounded-lg bg-muted/50 text-sm flex justify-between">
              <span className="text-muted-foreground">Total encours</span>
              <span className="font-semibold">{formatMontant(totalEncours)}</span>
            </div>
            <div className="space-y-2">
              {echeancesFournisseurs.slice(0, 6).map(({ cf, fourn, dateEch }) => {
                const echu = dateEch < now;
                const joursRestants = Math.round((dateEch.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <Link key={cf.id} to={`/commandes?search=${encodeURIComponent(cf.numero)}`} className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{fourn?.societe || '—'}</p>
                      <p className="text-xs text-muted-foreground">{cf.numero}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold">{formatMontant(cf.totalTTC)}</p>
                      <p className={`text-xs font-medium ${echu ? 'text-destructive' : joursRestants <= 10 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {echu ? `Échu depuis ${Math.abs(joursRestants)}j` : joursRestants === 0 ? `Aujourd'hui` : `Dans ${joursRestants}j — ${dateEch.toLocaleDateString('fr-FR')}`}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Quotes */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg">Derniers devis</h2>
            <Link to="/devis" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="space-y-3">
            {devis.slice(0, 5).map(d => {
              const client = clients.find(c => c.id === d.clientId);
              const total = calculerTotalDevis(d.lignes);
              return (
                <Link key={d.id} to={`/devis?editDevis=${d.id}`} className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{d.numero}</p>
                    <p className="text-xs text-muted-foreground truncate">{client?.nom || 'Client inconnu'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statutColors[d.statut]}`}>
                      {d.statut}
                    </span>
                    <span className="text-sm font-semibold whitespace-nowrap">{formatMontant(total.totalTTC)}</span>
                  </div>
                </Link>
              );
            })}
            {devis.length === 0 && <p className="text-sm text-muted-foreground">Aucun devis</p>}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg">Alertes stock</h2>
            <Link to="/stock" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="space-y-3">
            {produitsStockBas.slice(0, 5).map(p => (
              <Link key={p.id} to={`/produits?search=${encodeURIComponent(p.reference)}&highlight=${p.id}`} className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{p.description}</p>
                  <p className="text-xs text-muted-foreground">{p.reference}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-warning">{p.stock}</span>
                  <span className="text-xs text-muted-foreground">/ {p.stockMin} min</span>
                </div>
              </Link>
            ))}
            {produitsStockBas.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">✅ Stock OK</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
