import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TypeAdresse = 'livraison' | 'facturation';

export interface AdresseLivraison {
  id: string;
  libelle: string;
  adresse: string;
  ville: string;
  codePostal: string;
  contact?: string;
  telephone?: string;
  parDefaut: boolean;
  type: TypeAdresse;
}

export interface Contact {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  telephoneMobile?: string;
  fonction?: string;
}

export interface Client {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  telephoneMobile?: string;
  adresse: string;
  ville: string;
  codePostal: string;
  societe?: string;
  notes?: string;
  dateCreation: string;
  adressesLivraison: AdresseLivraison[];
  estRevendeur?: boolean;
  remisesParCategorie?: Record<string, number>;
  contacts?: Contact[];
}

export interface Fournisseur {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  telephoneMobile?: string;
  adresse: string;
  ville: string;
  codePostal: string;
  societe: string;
  notes?: string;
  francoPort: number;
  coutTransport: number;
  delaiReglement: string;
  dateCreation: string;
}

export interface ComposantProduit {
  produitId: string;
  quantite: number;
  consommationPct?: number;   // si défini : quantite = baseQuantite × consommationPct / 100
  baseComposantId?: string;   // (optionnel) produitId d'un autre composant — synchronise baseQuantite automatiquement
  baseQuantite?: number;      // valeur de base pour le calcul % (saisie manuelle ou issue de baseComposantId)
  poidsKg?: number;           // si défini : mode poids — quantite = poidsKg / produit.poids (ou = poidsKg si unite kg)
}

export interface Produit {
  id: string;
  reference: string;
  description: string;
  descriptionDetaillee?: string;
  prixAchat: number;
  coefficient: number;
  prixHT: number;
  coeffRevendeur: number;
  remiseRevendeur: number;
  prixRevendeur: number;
  tva: number;
  unite: string;
  poids?: number;
  consommation?: number;
  stock: number;
  stockMin: number;
  fournisseurId?: string;
  categorie?: string;
  composants?: ComposantProduit[];
  ficheUrl?: string;
  dateCreation: string;
}

export interface ProduitFournisseur {
  id: string;
  produitId: string;
  fournisseurId: string;
  prixAchat: number;
  referenceFournisseur: string;
  delaiLivraison: number;
  conditionnementMin: number;
  estPrioritaire: boolean;
}

export interface LigneReception {
  produitId: string;
  description: string;
  reference: string;
  quantiteCommandee: number;
  quantiteRecue: number;
}

export interface CommandeFournisseur {
  id: string;
  devisId?: string;
  fournisseurId: string;
  numero: string;
  dateCreation: string;
  statut: 'en_attente' | 'passee' | 'recue' | 'payee';
  lignes: { produitId: string; description: string; reference: string; quantite: number; prixAchat: number; total: number }[];
  totalHT: number;
  fraisTransport: number;
  totalTTC: number;
  notes?: string;
  dateEcheance?: string;
  dateReception?: string;
  dateLivraisonClientPrevue?: string;
  lignesRecues?: LigneReception[];
}

export type StatutCommandeClient = 'a_traiter' | 'accuse_envoye' | 'commande_envoyee' | 'livre' | 'facture' | 'payee';

export interface CommandeClient {
  id: string;
  devisId?: string;
  clientId: string;
  numero: string;
  dateCreation: string;
  statut: StatutCommandeClient;
  lignes: LigneDevis[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  fraisPortHT: number;
  referenceAffaire?: string;
  notes?: string;
  dateDepart?: string;
  dateLivraisonPrevue?: string;
  dateEcheance?: string;
}

// ── Facture Client ──────────────────────────────────────────────────────────
export type StatutFactureClient = 'brouillon' | 'envoyée' | 'payée' | 'annulée';

export interface FactureClient {
  id: string;
  numero: string;
  clientId: string;
  commandeClientId?: string;
  devisId?: string;
  dateCreation: string;
  dateEcheance?: string;
  datePaiement?: string;
  statut: StatutFactureClient;
  lignes: LigneDevis[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  fraisPortHT: number;
  referenceAffaire?: string;
  notes?: string;
  estProforma?: boolean;
}

export const STATUTS_FACTURE_CLIENT: Record<StatutFactureClient, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'bg-muted text-muted-foreground' },
  envoyée:   { label: 'Envoyée',   color: 'bg-info/10 text-info' },
  payée:     { label: 'Payée',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  annulée:   { label: 'Annulée',   color: 'bg-destructive/10 text-destructive' },
};

// ── Facture Fournisseur ─────────────────────────────────────────────────────
export type StatutFactureFournisseur = 'reçue' | 'validée' | 'payée' | 'contestée';

export interface FactureFournisseur {
  id: string;
  numero: string;
  numeroFacture: string;
  fournisseurId: string;
  commandeFournisseurId?: string;
  dateReception: string;
  dateEcheance?: string;
  datePaiement?: string;
  statut: StatutFactureFournisseur;
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  notes?: string;
}

export const STATUTS_FACTURE_FOURNISSEUR: Record<StatutFactureFournisseur, { label: string; color: string }> = {
  reçue:      { label: 'Reçue',      color: 'bg-warning/10 text-warning' },
  validée:    { label: 'Validée',    color: 'bg-info/10 text-info' },
  payée:      { label: 'Payée',      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  contestée:  { label: 'Contestée',  color: 'bg-destructive/10 text-destructive' },
};

export const STATUTS_COMMANDE_CLIENT: Record<StatutCommandeClient, { label: string; color: string }> = {
  a_traiter: { label: 'À traiter', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  accuse_envoye: { label: 'AR envoyé', color: 'bg-info/10 text-info' },
  commande_envoyee: { label: 'Envoyée', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  livre: { label: 'Livré', color: 'bg-success/10 text-success' },
  facture: { label: 'Facturé', color: 'bg-primary/10 text-primary' },
  payee: { label: 'Payée', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

export interface LigneDevis {
  id: string;
  type?: 'ligne' | 'groupe' | 'soustotal' | 'texte';  // 'ligne' par défaut ; 'groupe' = en-tête ; 'soustotal' = marqueur fin de groupe ; 'texte' = ligne texte seul
  produitId?: string;
  description: string;
  quantite: number;
  unite: string;
  prixUnitaireHT: number;
  tva: number;
  remise: number;
  surfaceM2?: number;
  consommation?: number;
  note?: string;
}

export interface Devis {
  id: string;
  numero: string;
  clientId: string;
  contactId?: string;
  adresseLivraisonId?: string;
  dateCreation: string;
  dateValidite: string;
  statut: 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré';
  dateEnvoi?: string;
  lignes: LigneDevis[];
  referenceAffaire?: string;
  systeme?: string;
  notes?: string;
  conditions?: string;
  fraisPortHT?: number;
  fraisPortTVA?: number;
  modeCalcul?: 'standard' | 'surface';
  surfaceGlobaleM2?: number;
}

// ---- DB <-> App mapping ----

function dbToClient(r: any): Client {
  return {
    id: r.id,
    nom: r.nom,
    email: r.email,
    telephone: r.telephone,
    telephoneMobile: r.telephone_mobile || undefined,
    adresse: r.adresse,
    ville: r.ville,
    codePostal: r.code_postal,
    societe: r.societe || undefined,
    notes: r.notes || undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
    adressesLivraison: (r.adresses_livraison as any[]) || [],
    estRevendeur: r.est_revendeur || false,
    remisesParCategorie: (r.remises_par_categorie as Record<string, number>) || {},
    contacts: (r.contacts as Contact[]) || [],
  };
}

function clientToDb(c: Client, userId: string): Record<string, unknown> {
  return {
    id: c.id,
    user_id: userId,
    nom: c.nom,
    email: c.email,
    telephone: c.telephone,
    telephone_mobile: c.telephoneMobile || null,
    adresse: c.adresse,
    ville: c.ville,
    code_postal: c.codePostal,
    societe: c.societe || null,
    notes: c.notes || null,
    date_creation: c.dateCreation,
    adresses_livraison: c.adressesLivraison,
    est_revendeur: c.estRevendeur || false,
    remises_par_categorie: c.remisesParCategorie || {},
    contacts: c.contacts || [],
  };
}

function dbToFournisseur(r: any): Fournisseur {
  return {
    id: r.id,
    nom: r.nom,
    email: r.email,
    telephone: r.telephone,
    telephoneMobile: r.telephone_mobile || undefined,
    adresse: r.adresse,
    ville: r.ville,
    codePostal: r.code_postal,
    societe: r.societe,
    notes: r.notes || undefined,
    francoPort: Number(r.franco_port) || 0,
    coutTransport: Number(r.cout_transport) || 0,
    delaiReglement: r.delai_reglement ? String(r.delai_reglement) : '45j FDM',
    dateCreation: r.date_creation?.split('T')[0] || '',
  };
}

function fournisseurToDb(f: Fournisseur, userId: string) {
  return {
    id: f.id,
    user_id: userId,
    nom: f.nom,
    email: f.email,
    telephone: f.telephone,
    telephone_mobile: f.telephoneMobile || null,
    adresse: f.adresse,
    ville: f.ville,
    code_postal: f.codePostal,
    societe: f.societe,
    notes: f.notes || null,
    franco_port: f.francoPort,
    cout_transport: f.coutTransport,
    delai_reglement: f.delaiReglement,
    date_creation: f.dateCreation,
  };
}

function dbToProduit(r: any): Produit {
  return {
    id: r.id,
    reference: r.reference,
    description: r.description,
    descriptionDetaillee: r.description_detaillee || undefined,
    prixAchat: Number(r.prix_achat) || 0,
    coefficient: Number(r.coefficient) || 1,
    prixHT: Number(r.prix_ht) || 0,
    coeffRevendeur: Number(r.coeff_revendeur) || 1,
    remiseRevendeur: Number(r.remise_revendeur) || 0,
    prixRevendeur: Number(r.prix_revendeur) || 0,
    tva: Number(r.tva) || 20,
    unite: r.unite,
    poids: r.poids != null ? Number(r.poids) : undefined,
    consommation: r.consommation != null ? Number(r.consommation) : undefined,
    stock: Number(r.stock) || 0,
    stockMin: Number(r.stock_min) || 0,
    fournisseurId: r.fournisseur_id || undefined,
    categorie: r.categorie || undefined,
    composants: r.composants ? (Array.isArray(r.composants) ? r.composants : JSON.parse(r.composants)) : undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
  };
}

function produitToDb(p: Produit, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    reference: p.reference,
    description: p.description,
    description_detaillee: p.descriptionDetaillee || null,
    prix_achat: p.prixAchat,
    coefficient: p.coefficient,
    prix_ht: p.prixHT,
    coeff_revendeur: p.coeffRevendeur,
    remise_revendeur: p.remiseRevendeur,
    prix_revendeur: p.prixRevendeur,
    tva: p.tva,
    unite: p.unite,
    poids: p.poids ?? null,
    consommation: p.consommation ?? null,
    stock: p.stock,
    stock_min: p.stockMin,
    fournisseur_id: p.fournisseurId || null,
    categorie: p.categorie || null,
    composants: p.composants && p.composants.length > 0 ? p.composants : null,
    date_creation: p.dateCreation,
  };
}

function dbToDevis(r: any): Devis {
  return {
    id: r.id,
    numero: r.numero,
    clientId: r.client_id || '',
    contactId: r.contact_id || undefined,
    adresseLivraisonId: r.adresse_livraison_id || undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
    dateValidite: r.date_validite?.split('T')[0] || '',
    statut: r.statut as Devis['statut'],
    dateEnvoi: r.date_envoi?.split('T')[0] || undefined,
    lignes: Array.isArray(r.lignes) ? (r.lignes as LigneDevis[]) : [],
    referenceAffaire: r.reference_affaire || undefined,
    systeme: r.systeme || undefined,
    notes: r.notes || undefined,
    conditions: r.conditions || undefined,
    fraisPortHT: r.frais_port_ht != null ? Number(r.frais_port_ht) : undefined,
    fraisPortTVA: r.frais_port_tva != null ? Number(r.frais_port_tva) : undefined,
    modeCalcul: r.mode_calcul || 'standard',
    surfaceGlobaleM2: r.surface_globale_m2 != null ? Number(r.surface_globale_m2) : undefined,
  };
}

function devisToDb(d: Devis, userId: string) {
  return {
    id: d.id,
    user_id: userId,
    numero: d.numero,
    client_id: d.clientId || null,
    contact_id: d.contactId || null,
    adresse_livraison_id: d.adresseLivraisonId || null,
    date_creation: d.dateCreation,
    date_validite: d.dateValidite || null,
    statut: d.statut,
    date_envoi: d.dateEnvoi || null,
    lignes: d.lignes as any,
    reference_affaire: d.referenceAffaire || null,
    systeme: d.systeme || null,
    notes: d.notes || null,
    conditions: d.conditions || null,
    frais_port_ht: d.fraisPortHT ?? 0,
    frais_port_tva: d.fraisPortTVA ?? 20,
    mode_calcul: d.modeCalcul || 'standard',
    surface_globale_m2: d.surfaceGlobaleM2 ?? null,
  };
}

// ---- ProduitFournisseur mapping ----

function dbToProduitFournisseur(r: any): ProduitFournisseur {
  return {
    id: r.id,
    produitId: r.produit_id,
    fournisseurId: r.fournisseur_id,
    prixAchat: Number(r.prix_achat) || 0,
    referenceFournisseur: r.reference_fournisseur || '',
    delaiLivraison: Number(r.delai_livraison) || 0,
    conditionnementMin: Number(r.conditionnement_min) || 1,
    estPrioritaire: r.est_prioritaire || false,
  };
}

function produitFournisseurToDb(pf: ProduitFournisseur, userId: string) {
  return {
    id: pf.id,
    user_id: userId,
    produit_id: pf.produitId,
    fournisseur_id: pf.fournisseurId,
    prix_achat: pf.prixAchat,
    reference_fournisseur: pf.referenceFournisseur,
    delai_livraison: pf.delaiLivraison,
    conditionnement_min: pf.conditionnementMin,
    est_prioritaire: pf.estPrioritaire,
  };
}

// ---- CommandeFournisseur mapping ----

function dbToCommandeFournisseur(r: any): CommandeFournisseur {
  return {
    id: r.id,
    devisId: r.devis_id || undefined,
    fournisseurId: r.fournisseur_id,
    numero: r.numero,
    dateCreation: r.date_creation?.split('T')[0] || '',
    statut: r.statut as CommandeFournisseur['statut'],
    lignes: Array.isArray(r.lignes) ? (r.lignes as CommandeFournisseur['lignes']) : [],
    totalHT: Number(r.total_ht) || 0,
    fraisTransport: Number(r.frais_transport) || 0,
    totalTTC: Number(r.total_ttc) || 0,
    notes: r.notes || undefined,
    dateEcheance: r.date_echeance || undefined,
    dateReception: r.date_reception || undefined,
    dateLivraisonClientPrevue: r.date_livraison_client_prevue || undefined,
    lignesRecues: r.lignes_recues ? (Array.isArray(r.lignes_recues) ? r.lignes_recues : JSON.parse(r.lignes_recues)) : undefined,
  };
}

function commandeFournisseurToDb(cf: CommandeFournisseur, userId: string) {
  return {
    id: cf.id,
    user_id: userId,
    devis_id: cf.devisId || null,
    fournisseur_id: cf.fournisseurId,
    numero: cf.numero,
    date_creation: cf.dateCreation,
    statut: cf.statut,
    lignes: cf.lignes as any,
    total_ht: cf.totalHT,
    frais_transport: cf.fraisTransport,
    total_ttc: cf.totalTTC,
    notes: cf.notes || null,
    date_echeance: cf.dateEcheance || null,
    date_reception: cf.dateReception || null,
    date_livraison_client_prevue: cf.dateLivraisonClientPrevue || null,
    lignes_recues: cf.lignesRecues && cf.lignesRecues.length > 0 ? cf.lignesRecues as any : null,
  };
}

// ---- CommandeClient mapping ----

function dbToCommandeClient(r: any): CommandeClient {
  return {
    id: r.id,
    devisId: r.devis_id || undefined,
    clientId: r.client_id,
    numero: r.numero,
    dateCreation: r.date_creation?.split('T')[0] || '',
    statut: r.statut as StatutCommandeClient,
    lignes: Array.isArray(r.lignes) ? (r.lignes as LigneDevis[]) : [],
    totalHT: Number(r.total_ht) || 0,
    totalTVA: Number(r.total_tva) || 0,
    totalTTC: Number(r.total_ttc) || 0,
    fraisPortHT: Number(r.frais_port_ht) || 0,
    referenceAffaire: r.reference_affaire || undefined,
    notes: r.notes || undefined,
    dateDepart: r.date_depart || undefined,
    dateLivraisonPrevue: r.date_livraison_prevue || undefined,
    dateEcheance: r.date_echeance || undefined,
  };
}

function commandeClientToDb(cc: CommandeClient, userId: string) {
  return {
    id: cc.id,
    user_id: userId,
    devis_id: cc.devisId || null,
    client_id: cc.clientId,
    numero: cc.numero,
    date_creation: cc.dateCreation,
    statut: cc.statut,
    lignes: cc.lignes as any,
    total_ht: cc.totalHT,
    total_tva: cc.totalTVA,
    total_ttc: cc.totalTTC,
    frais_port_ht: cc.fraisPortHT,
    reference_affaire: cc.referenceAffaire || null,
    notes: cc.notes || null,
    date_depart: cc.dateDepart || null,
    date_livraison_prevue: cc.dateLivraisonPrevue || null,
    date_echeance: cc.dateEcheance || null,
  };
}

// ---- FactureClient mapping ----

function dbToFactureClient(r: any): FactureClient {
  return {
    id: r.id,
    numero: r.numero,
    clientId: r.client_id,
    commandeClientId: r.commande_client_id || undefined,
    devisId: r.devis_id || undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
    dateEcheance: r.date_echeance?.split('T')[0] || undefined,
    datePaiement: r.date_paiement?.split('T')[0] || undefined,
    statut: r.statut as StatutFactureClient,
    lignes: Array.isArray(r.lignes) ? (r.lignes as LigneDevis[]) : [],
    totalHT: Number(r.total_ht) || 0,
    totalTVA: Number(r.total_tva) || 0,
    totalTTC: Number(r.total_ttc) || 0,
    fraisPortHT: Number(r.frais_port_ht) || 0,
    referenceAffaire: r.reference_affaire || undefined,
    notes: r.notes || undefined,
    estProforma: r.est_proforma ?? false,
  };
}

function factureClientToDb(f: FactureClient, userId: string) {
  return {
    id: f.id,
    user_id: userId,
    numero: f.numero,
    client_id: f.clientId,
    commande_client_id: f.commandeClientId || null,
    devis_id: f.devisId || null,
    date_creation: f.dateCreation,
    date_echeance: f.dateEcheance || null,
    date_paiement: f.datePaiement || null,
    statut: f.statut,
    lignes: f.lignes as any,
    total_ht: f.totalHT,
    total_tva: f.totalTVA,
    total_ttc: f.totalTTC,
    frais_port_ht: f.fraisPortHT,
    reference_affaire: f.referenceAffaire || null,
    notes: f.notes || null,
    est_proforma: f.estProforma ?? false,
  };
}

// ---- FactureFournisseur mapping ----

function dbToFactureFournisseur(r: any): FactureFournisseur {
  return {
    id: r.id,
    numero: r.numero,
    numeroFacture: r.numero_facture || '',
    fournisseurId: r.fournisseur_id,
    commandeFournisseurId: r.commande_fournisseur_id || undefined,
    dateReception: r.date_reception?.split('T')[0] || '',
    dateEcheance: r.date_echeance?.split('T')[0] || undefined,
    datePaiement: r.date_paiement?.split('T')[0] || undefined,
    statut: r.statut as StatutFactureFournisseur,
    montantHT: Number(r.montant_ht) || 0,
    montantTVA: Number(r.montant_tva) || 0,
    montantTTC: Number(r.montant_ttc) || 0,
    notes: r.notes || undefined,
  };
}

function factureFournisseurToDb(f: FactureFournisseur, userId: string) {
  return {
    id: f.id,
    user_id: userId,
    numero: f.numero,
    numero_facture: f.numeroFacture,
    fournisseur_id: f.fournisseurId,
    commande_fournisseur_id: f.commandeFournisseurId || null,
    date_reception: f.dateReception,
    date_echeance: f.dateEcheance || null,
    date_paiement: f.datePaiement || null,
    statut: f.statut,
    montant_ht: f.montantHT,
    montant_tva: f.montantTVA,
    montant_ttc: f.montantTTC,
    notes: f.notes || null,
  };
}

// ---- Sync helpers ----

function diffArrays<T extends { id: string }>(prev: T[], next: T[]) {
  const prevIds = new Set(prev.map(i => i.id));
  const nextIds = new Set(next.map(i => i.id));
  const added = next.filter(i => !prevIds.has(i.id));
  const removed = prev.filter(i => !nextIds.has(i.id));
  const updated = next.filter(i => prevIds.has(i.id) && JSON.stringify(i) !== JSON.stringify(prev.find(p => p.id === i.id)));
  return { added, removed, updated };
}

export function useStore() {
  const [clients, setClients] = useState<Client[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [devis, setDevis] = useState<Devis[]>([]);
  const [produitFournisseurs, setProduitFournisseurs] = useState<ProduitFournisseur[]>([]);
  const [commandesFournisseur, setCommandesFournisseur] = useState<CommandeFournisseur[]>([]);
  const [commandesClient, setCommandesClient] = useState<CommandeClient[]>([]);
  const [facturesClient, setFacturesClient] = useState<FactureClient[]>([]);
  const [facturesFournisseur, setFacturesFournisseur] = useState<FactureFournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      userIdRef.current = session.user.id;

      const [cRes, fRes, pRes, dRes, pfRes, cfRes, ccRes, fcRes, ffRes] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('fournisseurs').select('*'),
        supabase.from('produits').select('*'),
        supabase.from('devis').select('*'),
        supabase.from('produit_fournisseurs').select('*'),
        supabase.from('commandes_fournisseur').select('*'),
        supabase.from('commandes_client').select('*'),
        supabase.from('factures_client').select('*'),
        supabase.from('factures_fournisseur').select('*'),
      ]);

      if (cRes.data) setClients(cRes.data.map(dbToClient));
      if (fRes.data) setFournisseurs(fRes.data.map(dbToFournisseur));
      if (pRes.data) setProduits(pRes.data.map(dbToProduit));
      if (dRes.data) setDevis(dRes.data.map(dbToDevis));
      if (pfRes.data) setProduitFournisseurs(pfRes.data.map(dbToProduitFournisseur));
      if (cfRes.data) setCommandesFournisseur(cfRes.data.map(dbToCommandeFournisseur));
      if (ccRes.data) setCommandesClient(ccRes.data.map(dbToCommandeClient));
      if (fcRes.data) setFacturesClient(fcRes.data.map(dbToFactureClient));
      if (ffRes.data) setFacturesFournisseur(ffRes.data.map(dbToFactureFournisseur));
      setLoading(false);
    }
    load();
  }, []);

  const updateClients = useCallback((fn: (prev: Client[]) => Client[]) => {
    setClients(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('clients').insert(added.map(c => clientToDb(c, userId)) as any).then();
        if (updated.length) {
          updated.forEach(c => supabase.from('clients').update(clientToDb(c, userId) as any).eq('id', c.id).then());
        }
        if (removed.length) supabase.from('clients').delete().in('id', removed.map(c => c.id)).then();
      }
      return next;
    });
  }, []);

  const updateFournisseurs = useCallback((fn: (prev: Fournisseur[]) => Fournisseur[]) => {
    setFournisseurs(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('fournisseurs').insert(added.map(f => fournisseurToDb(f, userId)) as any).then();
        if (updated.length) {
          updated.forEach(f => supabase.from('fournisseurs').update(fournisseurToDb(f, userId) as any).eq('id', f.id).then());
        }
        if (removed.length) supabase.from('fournisseurs').delete().in('id', removed.map(f => f.id)).then();
      }
      return next;
    });
  }, []);

  const updateProduits = useCallback((fn: (prev: Produit[]) => Produit[]) => {
    setProduits(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('produits').insert(added.map(p => produitToDb(p, userId)) as any).then();
        if (updated.length) {
          updated.forEach(p => supabase.from('produits').update(produitToDb(p, userId) as any).eq('id', p.id).then());
        }
        if (removed.length) supabase.from('produits').delete().in('id', removed.map(p => p.id)).then();
      }
      return next;
    });
  }, []);

  const updateDevis = useCallback((fn: (prev: Devis[]) => Devis[]) => {
    setDevis(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('devis').insert(added.map(d => devisToDb(d, userId)) as any).then();
        if (updated.length) {
          updated.forEach(d => supabase.from('devis').update(devisToDb(d, userId) as any).eq('id', d.id).then());
        }
        if (removed.length) supabase.from('devis').delete().in('id', removed.map(d => d.id)).then();
      }
      return next;
    });
  }, []);

  const updateProduitFournisseurs = useCallback((fn: (prev: ProduitFournisseur[]) => ProduitFournisseur[]) => {
    setProduitFournisseurs(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('produit_fournisseurs').insert(added.map(pf => produitFournisseurToDb(pf, userId)) as any).then();
        if (updated.length) {
          updated.forEach(pf => supabase.from('produit_fournisseurs').update(produitFournisseurToDb(pf, userId) as any).eq('id', pf.id).then());
        }
        if (removed.length) supabase.from('produit_fournisseurs').delete().in('id', removed.map(pf => pf.id)).then();
      }
      return next;
    });
  }, []);

  const updateCommandesFournisseur = useCallback((fn: (prev: CommandeFournisseur[]) => CommandeFournisseur[]) => {
    setCommandesFournisseur(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('commandes_fournisseur').insert(added.map(cf => commandeFournisseurToDb(cf, userId)) as any).then();
        if (updated.length) {
          updated.forEach(cf => supabase.from('commandes_fournisseur').update(commandeFournisseurToDb(cf, userId) as any).eq('id', cf.id).then());
        }
        if (removed.length) supabase.from('commandes_fournisseur').delete().in('id', removed.map(cf => cf.id)).then();
      }
      return next;
    });
  }, []);

  const updateCommandesClient = useCallback((fn: (prev: CommandeClient[]) => CommandeClient[]) => {
    setCommandesClient(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('commandes_client').insert(added.map(cc => commandeClientToDb(cc, userId)) as any).then();
        if (updated.length) {
          updated.forEach(cc => supabase.from('commandes_client').update(commandeClientToDb(cc, userId) as any).eq('id', cc.id).then());
        }
        if (removed.length) supabase.from('commandes_client').delete().in('id', removed.map(cc => cc.id)).then();
      }
      return next;
    });
  }, []);

  const updateFacturesClient = useCallback((fn: (prev: FactureClient[]) => FactureClient[]) => {
    setFacturesClient(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('factures_client').insert(added.map(f => factureClientToDb(f, userId)) as any).then();
        if (updated.length) {
          updated.forEach(f => supabase.from('factures_client').update(factureClientToDb(f, userId) as any).eq('id', f.id).then());
        }
        if (removed.length) supabase.from('factures_client').delete().in('id', removed.map(f => f.id)).then();
      }
      return next;
    });
  }, []);

  const updateFacturesFournisseur = useCallback((fn: (prev: FactureFournisseur[]) => FactureFournisseur[]) => {
    setFacturesFournisseur(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        if (added.length) supabase.from('factures_fournisseur').insert(added.map(f => factureFournisseurToDb(f, userId)) as any).then();
        if (updated.length) {
          updated.forEach(f => supabase.from('factures_fournisseur').update(factureFournisseurToDb(f, userId) as any).eq('id', f.id).then());
        }
        if (removed.length) supabase.from('factures_fournisseur').delete().in('id', removed.map(f => f.id)).then();
      }
      return next;
    });
  }, []);

  return { clients, fournisseurs, produits, devis, produitFournisseurs, commandesFournisseur, commandesClient, facturesClient, facturesFournisseur, updateClients, updateFournisseurs, updateProduits, updateDevis, updateProduitFournisseurs, updateCommandesFournisseur, updateCommandesClient, updateFacturesClient, updateFacturesFournisseur, loading };
}

export function generateId() {
  return crypto.randomUUID();
}

export function calculerTotalLigne(ligne: LigneDevis) {
  const montantBrut = ligne.quantite * ligne.prixUnitaireHT;
  const remise = montantBrut * (ligne.remise / 100);
  const totalHT = montantBrut - remise;
  const totalTVA = totalHT * (ligne.tva / 100);
  return { totalHT, totalTVA, totalTTC: totalHT + totalTVA };
}

export function calculerTotalDevis(lignes: LigneDevis[], fraisPortHT = 0, fraisPortTVA = 20) {
  const lignesTotal = lignes.reduce((acc, l) => {
    const { totalHT, totalTVA, totalTTC } = calculerTotalLigne(l);
    return { totalHT: acc.totalHT + totalHT, totalTVA: acc.totalTVA + totalTVA, totalTTC: acc.totalTTC + totalTTC };
  }, { totalHT: 0, totalTVA: 0, totalTTC: 0 });
  const portTVA = fraisPortHT * (fraisPortTVA / 100);
  return {
    totalHT: lignesTotal.totalHT + fraisPortHT,
    totalTVA: lignesTotal.totalTVA + portTVA,
    totalTTC: lignesTotal.totalTTC + fraisPortHT + portTVA,
    fraisPortTTC: fraisPortHT + portTVA,
  };
}

export function formatMontant(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR');
}

/**
 * Formate une Date locale en "YYYY-MM-DD" sans décalage UTC.
 * Utiliser à la place de .toISOString().split('T')[0] pour éviter le bug J-1 en France (UTC+1/+2).
 */
export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calcule la date d'échéance de paiement selon le délai de règlement fournisseur.
 * Formats acceptés : "Comptant", "30j", "30j net", "45j FDM", "60 jours", "30"
 * FDM = Fin Du Mois : on va au dernier jour du mois de la date de base, puis on ajoute les jours.
 */
export function calculerDateEcheance(dateBase: string, delaiReglement: string): Date {
  // Parse YYYY-MM-DD en LOCAL (pas UTC) pour éviter le décalage timezone
  const [y, mo, da] = dateBase.split('-').map(Number);
  const base = new Date(y, (mo || 1) - 1, da || 1);

  if (!delaiReglement || delaiReglement.toLowerCase() === 'comptant') return base;

  // Formats acceptés : "45j FDM", "30j net", "30j", "60 jours", "30", "45 FDM"
  const match = delaiReglement.match(/^(\d+)\s*(?:j(?:ours?)?)?\s*(FDM|net)?$/i)
              ?? delaiReglement.match(/^(\d+)\s*(FDM)/i);
  if (!match) return base;

  const jours = parseInt(match[1]);
  const fdm = (match[2] || '').toUpperCase() === 'FDM';

  if (fdm) {
    // Fin du mois courant + jours
    const finMois = new Date(base.getFullYear(), base.getMonth() + 1, 0); // dernier jour du mois
    finMois.setDate(finMois.getDate() + jours);
    return finMois;
  }
  const result = new Date(base);
  result.setDate(result.getDate() + jours);
  return result;
}

export function calculerFraisPort(poidsKg: number, hasGranulat: boolean): number | null {
  if (poidsKg <= 0) return 0;
  if (poidsKg > 2000) {
    return hasGranulat ? null : 0;
  }
  if (poidsKg >= 701) return 230;
  if (poidsKg >= 101) return 178;
  if (poidsKg >= 26) return 85;
  return 49;
}

// ---- Barèmes transport par paliers de poids ----

export type TransporteurType = 'standard' | 'ups' | 'messagerie' | 'gls';

export interface BaremePalier {
  min: number;
  max: number;
  prix: number | null;
}

export const BAREME_UPS: BaremePalier[] = [
  { min: 0, max: 1, prix: 8.50 },
  { min: 1, max: 2, prix: 9.50 },
  { min: 2, max: 3, prix: 10.50 },
  { min: 3, max: 5, prix: 12.00 },
  { min: 5, max: 10, prix: 15.00 },
  { min: 10, max: 15, prix: 19.00 },
  { min: 15, max: 20, prix: 23.00 },
  { min: 20, max: 25, prix: 28.00 },
  { min: 25, max: 30, prix: 33.00 },
  { min: 30, max: 40, prix: 42.00 },
  { min: 40, max: 50, prix: 52.00 },
  { min: 50, max: 70, prix: 68.00 },
  { min: 70, max: 100, prix: 95.00 },
  { min: 100, max: 150, prix: 135.00 },
  { min: 150, max: 200, prix: 175.00 },
  { min: 200, max: 300, prix: 250.00 },
  { min: 300, max: 500, prix: 380.00 },
  { min: 500, max: 1000, prix: 650.00 },
  { min: 1000, max: Infinity, prix: null },
];

export const BAREME_MESSAGERIE: BaremePalier[] = [
  { min: 0, max: 1, prix: 7.00 },
  { min: 1, max: 2, prix: 8.00 },
  { min: 2, max: 3, prix: 9.00 },
  { min: 3, max: 5, prix: 10.50 },
  { min: 5, max: 10, prix: 13.00 },
  { min: 10, max: 15, prix: 16.50 },
  { min: 15, max: 20, prix: 20.00 },
  { min: 20, max: 25, prix: 24.00 },
  { min: 25, max: 30, prix: 28.50 },
  { min: 30, max: 40, prix: 36.00 },
  { min: 40, max: 50, prix: 45.00 },
  { min: 50, max: 70, prix: 58.00 },
  { min: 70, max: 100, prix: 82.00 },
  { min: 100, max: 150, prix: 115.00 },
  { min: 150, max: 200, prix: 150.00 },
  { min: 200, max: 300, prix: 215.00 },
  { min: 300, max: 500, prix: 330.00 },
  { min: 500, max: 1000, prix: 560.00 },
  { min: 1000, max: Infinity, prix: null },
];

export const BAREME_GLS: BaremePalier[] = [
  { min: 0, max: 1, prix: 9.00 },
  { min: 1, max: 2, prix: 10.00 },
  { min: 2, max: 3, prix: 11.00 },
  { min: 3, max: 5, prix: 13.00 },
  { min: 5, max: 10, prix: 16.00 },
  { min: 10, max: 15, prix: 20.00 },
  { min: 15, max: 20, prix: 24.50 },
  { min: 20, max: 25, prix: 29.50 },
  { min: 25, max: 30, prix: 35.00 },
  { min: 30, max: 40, prix: 44.00 },
  { min: 40, max: 50, prix: 55.00 },
  { min: 50, max: 70, prix: 72.00 },
  { min: 70, max: 100, prix: 100.00 },
  { min: 100, max: 150, prix: 142.00 },
  { min: 150, max: 200, prix: 185.00 },
  { min: 200, max: 300, prix: 265.00 },
  { min: 300, max: 500, prix: 400.00 },
  { min: 500, max: 1000, prix: 690.00 },
  { min: 1000, max: Infinity, prix: null },
];

export const BAREMES_TRANSPORT: Record<Exclude<TransporteurType, 'standard'>, { label: string; bareme: BaremePalier[]; coeffDefaut: number; coeffExpressDefaut: number }> = {
  ups: { label: 'UPS', bareme: BAREME_UPS, coeffDefaut: 1.4, coeffExpressDefaut: 1.8 },
  messagerie: { label: 'Messagerie', bareme: BAREME_MESSAGERIE, coeffDefaut: 1.4, coeffExpressDefaut: 1.6 },
  gls: { label: 'Affrètement GLS', bareme: BAREME_GLS, coeffDefaut: 1.4, coeffExpressDefaut: 1.7 },
};

export function calculerFraisPortBareme(bareme: BaremePalier[], poidsKg: number, nbColis: number = 1): { prix: number | null; palier: string } {
  if (poidsKg <= 0) return { prix: 0, palier: '0 kg' };
  
  const poidsBrut = nbColis > 1 ? poidsKg / nbColis : poidsKg;
  
  const palier = bareme.find(b => poidsBrut > b.min && poidsBrut <= b.max);
  if (!palier) return { prix: null, palier: `>${bareme[bareme.length - 2].max} kg` };
  
  if (palier.prix === null) return { prix: null, palier: `>${bareme[bareme.length - 2].max} kg` };
  
  const prixTotal = palier.prix * nbColis;
  return { prix: prixTotal, palier: `${palier.min}-${palier.max === Infinity ? '∞' : palier.max} kg` };
}

export function calculerFraisPortUPS(poidsKg: number, nbColis: number = 1) {
  return calculerFraisPortBareme(BAREME_UPS, poidsKg, nbColis);
}

/**
 * Calcule le fournisseur prioritaire pour un produit basé sur le coût global
 * (prix d'achat + transport ramené à la quantité commandée)
 */
export function calculerFournisseurPrioritaire(
  produitId: string,
  qteCommande: number,
  produitFournisseurs: ProduitFournisseur[],
  fournisseurs: Fournisseur[]
): ProduitFournisseur | null {
  const pfs = produitFournisseurs.filter(pf => pf.produitId === produitId);
  if (pfs.length === 0) return null;
  if (pfs.length === 1) return pfs[0];

  let best: ProduitFournisseur | null = null;
  let bestCost = Infinity;

  for (const pf of pfs) {
    const fourn = fournisseurs.find(f => f.id === pf.fournisseurId);
    if (!fourn) continue;

    const qte = Math.max(qteCommande, pf.conditionnementMin);
    const totalAchat = pf.prixAchat * qte;
    // Transport : gratuit si franco atteint, sinon coût transport
    const transport = totalAchat >= fourn.francoPort ? 0 : fourn.coutTransport;
    const coutGlobal = totalAchat + transport;
    const coutUnitaire = coutGlobal / qte;

    if (coutUnitaire < bestCost) {
      bestCost = coutUnitaire;
      best = pf;
    }
  }

  return best;
}