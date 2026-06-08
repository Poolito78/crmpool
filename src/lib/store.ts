import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  delaiReglement?: string;
  // Comptabilité / identification légale
  siret?: string;
  codeApe?: string;
  libelleApe?: string;
  formeJuridique?: string;
  tvaIntra?: string;
  rcs?: string;
  trancheEffectif?: string;
  dateCreationEntreprise?: string;
  capitalSocial?: string;
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
  estStockiste?: boolean;
  delaiExpedition?: number; // jours d'expédition
}

// ── Entrepôts ────────────────────────────────────────────────────────────────
export interface Entrepot {
  id: string;
  nom: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  notes?: string;
  estDefaut: boolean;
  createdAt: string;
}

export interface StockEntrepot {
  produitId: string;
  entrepotId: string;
  stock: number;
}

export interface ComposantProduit {
  produitId: string;
  quantite: number;
  consommationPct?: number;   // si défini : quantite = baseQuantite × consommationPct / 100
  baseComposantId?: string;   // (optionnel) produitId d'un autre composant — synchronise baseQuantite automatiquement
  baseQuantite?: number;      // valeur de base pour le calcul % (saisie manuelle ou issue de baseComposantId)
  poidsKg?: number;           // si défini : mode poids — quantite = poidsKg / produit.poids (ou = poidsKg si unite kg)
}

export interface LigneKit {
  produitId?: string;
  description: string;
  quantite: number;
  unite: string;
  prixUnitaireHT: number;
  remise: number;
  consommation?: number;  // kg/m² — utilisé en mode calcul surface dans le devis
  note?: string;
}

export interface PrixPalier {
  qteMin: number;        // quantité/poids minimum pour déclencher ce palier
  prixAchat: number;     // prix achat HT à ce palier
  prixRevendeur: number; // prix revendeur HT à ce palier
  prixHT: number;        // prix public HT à ce palier
}

// Achat daté : prix d'achat unitaire à une date + quantité achetée (valorisation stock)
export interface AchatDate {
  date: string;      // YYYY-MM-DD
  prix: number;      // prix d'achat unitaire HT à cette date
  quantite: number;  // quantité achetée à cette date
  source?: 'manuel' | 'commande'; // origine (saisie ou commande fournisseur)
  ref?: string;      // n° de commande fournisseur si source = commande
}

export interface VarianteOption {
  id: string;
  label: string;       // ex: "RAL 9010 Blanc pur", "0.5-1 mm"
  prixDiff?: number;   // ajustement de prix HT (positif ou négatif)
  couleur?: string;    // couleur CSS hex (#A3B4C5) pour affichage swatch
  imageUrl?: string;   // URL vers une image/texture de l'option
}

export interface VarianteDimension {
  id: string;
  nom: string;         // ex: "Couleur RAL", "Granulométrie"
  options: VarianteOption[];
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
  typeKit?: boolean;
  lignesKit?: LigneKit[];
  ficheUrl?: string;
  ficheLinkLabel?: string;   // texte affiché du lien hypertexte dans les mails
  dateCreation: string;
  paliersPrix?: PrixPalier[];       // prix évolutifs par palier de quantité/poids
  variantes?: VarianteDimension[];  // dimensions de variantes (ex: RAL, granulométrie)
  proprietaire?: 'isosign' | 'fournisseur'; // propriétaire de la marchandise
  proprietaireFournisseurId?: string;        // si proprietaire = 'fournisseur'
  disponibleVente?: boolean;                 // produit proposé à la vente
  achatsHistorique?: AchatDate[];            // historique manuel des achats datés (valorisation)
}

export interface PalierPort {
  montantMin: number;    // montant HT commande (€) déclenchant ce tarif
  coutTransport: number; // frais de port (0 = franco à ce palier)
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
  paliersFournisseur?: PrixPalier[];  // tarifs prix dégressifs propres à ce fournisseur
  paliersPort?: PalierPort[];         // frais de port dégressifs propres à ce fournisseur
}

/** Retourne le prix achat effectif d'un ProduitFournisseur à la quantité donnée */
export function getPfPrixPourQuantite(pf: ProduitFournisseur, qte: number): number {
  if (!pf.paliersFournisseur || pf.paliersFournisseur.length === 0) return pf.prixAchat;
  const sorted = [...pf.paliersFournisseur].sort((a, b) => b.qteMin - a.qteMin);
  const palier = sorted.find(p => qte >= p.qteMin);
  return palier?.prixAchat ?? pf.prixAchat;
}

/** Retourne les frais de port effectifs pour un ProduitFournisseur au montant HT donné.
 *  Si des paliers port sont définis sur le lien, ils priment sur franco/coutTransport du fournisseur. */
export function getPfTransportPourMontant(
  pf: ProduitFournisseur,
  fourn: { francoPort: number; coutTransport: number },
  montantAchat: number
): number {
  if (pf.paliersPort && pf.paliersPort.length > 0) {
    const sorted = [...pf.paliersPort].sort((a, b) => b.montantMin - a.montantMin);
    const palier = sorted.find(p => montantAchat >= p.montantMin);
    return palier?.coutTransport ?? fourn.coutTransport;
  }
  return montantAchat >= fourn.francoPort ? 0 : fourn.coutTransport;
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
  adresseLivraisonId?: string;
  delaiReglement?: string;
  dateLivraison?: string;
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
  cellules?: number;
  note?: string;
  variantesChoisies?: Record<string, string>; // dimensionId -> option.label
  prixAchatLigne?: number; // coût achat unitaire pour lignes libres (ex: surcharges énergie)
}

export type RaisonArchive = 'doublon' | 'concurrent_prix' | 'concurrent_delai' | 'budget' | 'injoignable' | 'autre';

export const RAISON_ARCHIVE: Record<RaisonArchive, { label: string; color: string; messageDefaut: string }> = {
  doublon:          { label: 'Doublon',              color: 'bg-muted text-muted-foreground',            messageDefaut: 'Devis doublon — remplacé ou annulé.' },
  concurrent_prix:  { label: 'Concurrent — prix',    color: 'bg-destructive/10 text-destructive',         messageDefaut: 'Perdu face à la concurrence sur le prix. Client a choisi un concurrent moins cher.' },
  concurrent_delai: { label: 'Concurrent — délais',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', messageDefaut: 'Perdu face à la concurrence sur les délais de livraison.' },
  budget:           { label: 'Budget insuffisant',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     messageDefaut: 'Projet annulé ou reporté — budget insuffisant.' },
  injoignable:      { label: 'Client injoignable',   color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', messageDefaut: 'Client injoignable. Devis expiré sans retour.' },
  autre:            { label: 'Autre',                color: 'bg-muted text-muted-foreground',            messageDefaut: '' },
};

export interface ConcurrentProduit {
  produitId?: string;
  nomConcurrent?: string;
  prixConcurrent?: number;
  delaiConcurrent?: number;
  note?: string;
}

export interface DevisMessageTemplate {
  id: string;
  nom: string;
  contenu: string;
  raisonArchive?: RaisonArchive;
  createdAt: string;
}

export interface Devis {
  id: string;
  numero: string;
  clientId: string;
  contactId?: string;
  adresseLivraisonId?: string;
  contactLivraisonId?: string;
  dateCreation: string;
  dateValidite: string;
  statut: 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré' | 'système' | 'archivé';
  dateEnvoi?: string;
  lignes: LigneDevis[];
  referenceAffaire?: string;
  systeme?: string;
  notes?: string;
  conditions?: string;
  moContent?: string; // Mise en œuvre — document HTML riche (récap groupes/notes/lignes)
  probabiliteReussite?: number; // % de réussite estimé (0,25,50,75,100)
  dateRealisation?: string; // date de réalisation prévue/effective (YYYY-MM-DD)
  fraisPortHT?: number;
  fraisPortTVA?: number;
  fraisPortAuto?: boolean;
  modeCalcul?: 'standard' | 'surface';
  surfaceGlobaleM2?: number;
  raisonRefus?: string;
  // Champs archivage
  archiveDate?: string;
  archiveRaison?: RaisonArchive;
  archiveCommentaire?: string;
  archiveConcurrents?: ConcurrentProduit[];
}

// ── CRM Actions ─────────────────────────────────────────────────────────────
export type TypeCrmAction = 'visite' | 'appel' | 'email' | 'tache' | 'rdv';
export type StatutCrmAction = 'planifiee' | 'realisee' | 'annulee';
export type PrioriteCrmAction = 'basse' | 'normale' | 'haute';

export interface CrmActionConcurrent {
  produitRef?: string;      // référence ou nom du produit concerné
  nomConcurrent: string;
  tarif?: number;           // tarif concurrent (€)
  delai?: number;           // délai concurrent (jours)
  note?: string;
}

export interface CrmAction {
  id: string;
  clientId?: string;
  devisId?: string;
  type: TypeCrmAction;
  titre: string;
  description?: string;
  datePlanifiee?: string;   // ISO date string
  dateRealisee?: string;
  statut: StatutCrmAction;
  priorite: PrioriteCrmAction;
  concurrents?: CrmActionConcurrent[];
  createdAt: string;
}

export const TYPE_CRM_ACTION: Record<TypeCrmAction, { label: string; icon: string; color: string }> = {
  visite:  { label: 'Visite',    icon: '🏠', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  appel:   { label: 'Appel',     icon: '📞', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  email:   { label: 'Email',     icon: '✉️',  color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  tache:   { label: 'Tâche',     icon: '✅', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  rdv:     { label: 'Rendez-vous', icon: '📅', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

export const STATUT_CRM_ACTION: Record<StatutCrmAction, { label: string; color: string }> = {
  planifiee: { label: 'Planifiée',  color: 'bg-info/10 text-info' },
  realisee:  { label: 'Réalisée',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  annulee:   { label: 'Annulée',    color: 'bg-muted text-muted-foreground' },
};

// ---- DB <-> App mapping ----

function normalizeDelaiReglement(v: string): string {
  const map: Record<string, string> = {
    '30j NET': '30J', '30j net': '30J', '30J NET': '30J',
    '30j FDM': '30J FDM', '30j fdm': '30J FDM', '30j Fin de mois': '30J FDM',
    '45j': '45J', '45j net': '45J',
    '45j FDM': '45J FDM', '45j fdm': '45J FDM',
  };
  return map[v] ?? v;
}

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
    delaiReglement: r.delai_reglement || undefined,
    siret: r.siret || undefined,
    codeApe: r.code_ape || undefined,
    libelleApe: r.libelle_ape || undefined,
    formeJuridique: r.forme_juridique || undefined,
    tvaIntra: r.tva_intra || undefined,
    rcs: r.rcs || undefined,
    trancheEffectif: r.tranche_effectif || undefined,
    dateCreationEntreprise: r.date_creation_entreprise || undefined,
    capitalSocial: r.capital_social || undefined,
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
    ...(c.delaiReglement !== undefined ? { delai_reglement: c.delaiReglement } : {}),
    ...(c.siret !== undefined ? { siret: c.siret } : {}),
    ...(c.codeApe !== undefined ? { code_ape: c.codeApe } : {}),
    ...(c.libelleApe !== undefined ? { libelle_ape: c.libelleApe } : {}),
    ...(c.formeJuridique !== undefined ? { forme_juridique: c.formeJuridique } : {}),
    ...(c.tvaIntra !== undefined ? { tva_intra: c.tvaIntra } : {}),
    ...(c.rcs !== undefined ? { rcs: c.rcs } : {}),
    ...(c.trancheEffectif !== undefined ? { tranche_effectif: c.trancheEffectif } : {}),
    ...(c.dateCreationEntreprise !== undefined ? { date_creation_entreprise: c.dateCreationEntreprise } : {}),
    ...(c.capitalSocial !== undefined ? { capital_social: c.capitalSocial } : {}),
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
    delaiReglement: normalizeDelaiReglement(r.delai_reglement ? String(r.delai_reglement) : '45J FDM'),
    dateCreation: r.date_creation?.split('T')[0] || '',
    estStockiste: r.est_stockiste ?? false,
    delaiExpedition: r.delai_expedition != null ? Number(r.delai_expedition) : 0,
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
    ...(f.estStockiste !== undefined ? { est_stockiste: f.estStockiste } : {}),
    ...(f.delaiExpedition !== undefined ? { delai_expedition: f.delaiExpedition } : {}),
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
    typeKit: r.type_kit ?? false,
    lignesKit: r.lignes_kit ? (Array.isArray(r.lignes_kit) ? r.lignes_kit : JSON.parse(r.lignes_kit)) : undefined,
    ficheUrl: r.fiche_url || undefined,
    ficheLinkLabel: r.fiche_link_label || undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
    paliersPrix: r.paliers_prix ? (Array.isArray(r.paliers_prix) ? r.paliers_prix : JSON.parse(r.paliers_prix)) : undefined,
    variantes: r.variantes ? (Array.isArray(r.variantes) ? r.variantes : JSON.parse(r.variantes)) : undefined,
    proprietaire: (r.proprietaire as 'isosign' | 'fournisseur') || 'isosign',
    proprietaireFournisseurId: r.proprietaire_fournisseur_id || undefined,
    disponibleVente: r.disponible_vente ?? true,
    achatsHistorique: r.achats_historique ? (Array.isArray(r.achats_historique) ? r.achats_historique : JSON.parse(r.achats_historique)) : undefined,
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
    type_kit: p.typeKit ?? false,
    lignes_kit: p.lignesKit && p.lignesKit.length > 0 ? p.lignesKit : null,
    fiche_url: p.ficheUrl || null,
    fiche_link_label: p.ficheLinkLabel || null,
    date_creation: p.dateCreation,
    paliers_prix: p.paliersPrix && p.paliersPrix.length > 0 ? p.paliersPrix : null,
    variantes: p.variantes && p.variantes.length > 0 ? p.variantes : null,
    ...(p.proprietaire !== undefined ? { proprietaire: p.proprietaire } : {}),
    ...(p.proprietaireFournisseurId !== undefined ? { proprietaire_fournisseur_id: p.proprietaireFournisseurId || null } : {}),
    ...(p.disponibleVente !== undefined ? { disponible_vente: p.disponibleVente } : {}),
    ...(p.achatsHistorique !== undefined ? { achats_historique: p.achatsHistorique && p.achatsHistorique.length > 0 ? p.achatsHistorique : null } : {}),
  };
}

function dbToDevis(r: any): Devis {
  return {
    id: r.id,
    numero: r.numero,
    clientId: r.client_id || '',
    contactId: r.contact_id || undefined,
    adresseLivraisonId: r.adresse_livraison_id || undefined,
    contactLivraisonId: r.contact_livraison_id || undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
    dateValidite: r.date_validite?.split('T')[0] || '',
    statut: r.statut as Devis['statut'],
    dateEnvoi: r.date_envoi?.split('T')[0] || undefined,
    lignes: Array.isArray(r.lignes) ? (r.lignes as LigneDevis[]) : [],
    referenceAffaire: r.reference_affaire || undefined,
    systeme: r.systeme || undefined,
    notes: r.notes || undefined,
    conditions: r.conditions || undefined,
    moContent: r.mo_content || undefined,
    probabiliteReussite: r.probabilite_reussite != null ? Number(r.probabilite_reussite) : undefined,
    dateRealisation: r.date_realisation || undefined,
    fraisPortHT: r.frais_port_ht != null ? Number(r.frais_port_ht) : undefined,
    fraisPortTVA: r.frais_port_tva != null ? Number(r.frais_port_tva) : undefined,
    fraisPortAuto: r.frais_port_auto != null ? Boolean(r.frais_port_auto) : undefined,
    modeCalcul: r.mode_calcul || 'standard',
    surfaceGlobaleM2: r.surface_globale_m2 != null ? Number(r.surface_globale_m2) : undefined,
    raisonRefus: r.raison_refus || undefined,
    archiveDate: r.archive_date || undefined,
    archiveRaison: r.archive_raison as RaisonArchive || undefined,
    archiveCommentaire: r.archive_commentaire || undefined,
    archiveConcurrents: r.archive_concurrents as ConcurrentProduit[] || undefined,
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
    ...(d.contactLivraisonId !== undefined ? { contact_livraison_id: d.contactLivraisonId || null } : {}),
    date_creation: d.dateCreation,
    date_validite: d.dateValidite || null,
    statut: d.statut,
    date_envoi: d.dateEnvoi || null,
    lignes: d.lignes as any,
    reference_affaire: d.referenceAffaire || null,
    systeme: d.systeme || null,
    notes: d.notes || null,
    conditions: d.conditions || null,
    mo_content: d.moContent || null,
    ...(d.probabiliteReussite !== undefined ? { probabilite_reussite: d.probabiliteReussite } : {}),
    ...(d.dateRealisation !== undefined ? { date_realisation: d.dateRealisation || null } : {}),
    frais_port_ht: d.fraisPortHT ?? 0,
    frais_port_tva: d.fraisPortTVA ?? 20,
    ...(d.fraisPortAuto !== undefined ? { frais_port_auto: d.fraisPortAuto } : {}),
    mode_calcul: d.modeCalcul || 'standard',
    surface_globale_m2: d.surfaceGlobaleM2 ?? null,
    raison_refus: d.raisonRefus || null,
    archive_date: d.archiveDate || null,
    archive_raison: d.archiveRaison || null,
    archive_commentaire: d.archiveCommentaire || null,
    archive_concurrents: d.archiveConcurrents || null,
  };
}

// ── CrmAction DB mapping ────────────────────────────────────────────────────
function dbToCrmAction(r: any): CrmAction {
  return {
    id: r.id,
    clientId: r.client_id || undefined,
    devisId: r.devis_id || undefined,
    type: r.type as TypeCrmAction,
    titre: r.titre,
    description: r.description || undefined,
    datePlanifiee: r.date_planifiee ? r.date_planifiee.split('T')[0] : undefined,
    dateRealisee: r.date_realisee ? r.date_realisee.split('T')[0] : undefined,
    statut: r.statut as StatutCrmAction,
    priorite: r.priorite as PrioriteCrmAction,
    concurrents: r.concurrents || undefined,
    createdAt: r.created_at?.split('T')[0] || '',
  };
}

function crmActionToDb(a: CrmAction, userId: string) {
  return {
    id: a.id,
    user_id: userId,
    client_id: a.clientId || null,
    devis_id: a.devisId || null,
    type: a.type,
    titre: a.titre,
    description: a.description || null,
    date_planifiee: a.datePlanifiee ? `${a.datePlanifiee}T00:00:00` : null,
    date_realisee: a.dateRealisee ? `${a.dateRealisee}T00:00:00` : null,
    statut: a.statut,
    priorite: a.priorite,
    ...(a.concurrents !== undefined ? { concurrents: a.concurrents } : {}),
  };
}

export function useCrmActions() {
  const [actions, setActions] = useState<CrmAction[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      userIdRef.current = session.user.id;
      const { data } = await supabase.from('crm_actions').select('*').order('date_planifiee', { ascending: true });
      if (data) setActions(data.map(dbToCrmAction));
      setLoading(false);
    }
    load();
  }, []);

  const addAction = useCallback(async (a: Omit<CrmAction, 'id' | 'createdAt'>) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const newAction: CrmAction = { ...a, id: crypto.randomUUID(), createdAt: new Date().toISOString().split('T')[0] };
    const { error } = await supabase.from('crm_actions').insert(crmActionToDb(newAction, userId) as any);
    if (!error) setActions(prev => [...prev, newAction].sort((a, b) => (a.datePlanifiee || '') > (b.datePlanifiee || '') ? 1 : -1));
    return error;
  }, []);

  const updateAction = useCallback(async (a: CrmAction) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const { error } = await supabase.from('crm_actions').update(crmActionToDb(a, userId) as any).eq('id', a.id);
    if (!error) setActions(prev => prev.map(x => x.id === a.id ? a : x));
    return error;
  }, []);

  const deleteAction = useCallback(async (id: string) => {
    const { error } = await supabase.from('crm_actions').delete().eq('id', id);
    if (!error) setActions(prev => prev.filter(x => x.id !== id));
    return error;
  }, []);

  return { actions, loading, addAction, updateAction, deleteAction };
}

// ── Message Templates ────────────────────────────────────────────────────────
function dbToTemplate(r: any): DevisMessageTemplate {
  return {
    id: r.id,
    nom: r.nom,
    contenu: r.contenu,
    raisonArchive: r.raison_archive as RaisonArchive || undefined,
    createdAt: r.created_at?.split('T')[0] || '',
  };
}

export function useDevisMessageTemplates() {
  const [templates, setTemplates] = useState<DevisMessageTemplate[]>([]);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      userIdRef.current = session.user.id;
      const { data } = await supabase.from('devis_message_templates').select('*').order('created_at', { ascending: false });
      if (data) setTemplates(data.map(dbToTemplate));
    }
    load();
  }, []);

  const addTemplate = useCallback(async (t: Omit<DevisMessageTemplate, 'id' | 'createdAt'>) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const newT: DevisMessageTemplate = { ...t, id: crypto.randomUUID(), createdAt: new Date().toISOString().split('T')[0] };
    const { error } = await supabase.from('devis_message_templates').insert({ id: newT.id, user_id: userId, nom: newT.nom, contenu: newT.contenu, raison_archive: newT.raisonArchive || null });
    if (!error) setTemplates(prev => [newT, ...prev]);
    return error;
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from('devis_message_templates').delete().eq('id', id);
    if (!error) setTemplates(prev => prev.filter(t => t.id !== id));
    return error;
  }, []);

  return { templates, addTemplate, deleteTemplate };
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
    paliersFournisseur: r.paliers_fournisseur
      ? (Array.isArray(r.paliers_fournisseur) ? r.paliers_fournisseur : JSON.parse(r.paliers_fournisseur))
      : undefined,
    paliersPort: r.paliers_port
      ? (Array.isArray(r.paliers_port) ? r.paliers_port : JSON.parse(r.paliers_port))
      : undefined,
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
    ...(pf.paliersFournisseur !== undefined ? {
      paliers_fournisseur: pf.paliersFournisseur && pf.paliersFournisseur.length > 0 ? pf.paliersFournisseur : null
    } : {}),
    ...(pf.paliersPort !== undefined ? {
      paliers_port: pf.paliersPort && pf.paliersPort.length > 0 ? pf.paliersPort : null
    } : {}),
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
    adresseLivraisonId: r.adresse_livraison_id || undefined,
    delaiReglement: r.delai_reglement || undefined,
    dateLivraison: r.date_livraison || undefined,
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
    adresse_livraison_id: cc.adresseLivraisonId || null,
    delai_reglement: cc.delaiReglement || null,
    date_livraison: cc.dateLivraison || null,
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
      // Migration one-shot : renomme DV-YYYY-NNN → DEV-YYYY-NNN en base
      if (dRes.data) {
        const dvRows = dRes.data.filter(d => d.numero?.startsWith('DV-'));
        if (dvRows.length > 0) {
          await Promise.all(dvRows.map(d =>
            supabase.from('devis').update({ numero: (d.numero as string).replace(/^DV-/, 'DEV-') }).eq('id', d.id)
          ));
          dvRows.forEach(d => { d.numero = (d.numero as string).replace(/^DV-/, 'DEV-'); });
        }
        setDevis(dRes.data.map(dbToDevis));
      }
      if (pfRes.data) setProduitFournisseurs(pfRes.data.map(dbToProduitFournisseur));
      if (cfRes.data) setCommandesFournisseur(cfRes.data.map(dbToCommandeFournisseur));
      if (ccRes.data) setCommandesClient(ccRes.data.map(dbToCommandeClient));
      if (fcRes.data) setFacturesClient(fcRes.data.map(dbToFactureClient));
      if (ffRes.data) setFacturesFournisseur(ffRes.data.map(dbToFactureFournisseur));
      setLoading(false);
    }

    // ── Synchro temps réel (Supabase Realtime) ───────────────────────────────
    // Re-charge la table concernée à chaque INSERT/UPDATE/DELETE (debounce léger)
    // → les modifs faites sur un autre appareil/onglet apparaissent sans rafraîchir.
    const refetchers: Record<string, () => Promise<void>> = {
      clients: async () => { const { data } = await supabase.from('clients').select('*'); if (data) setClients(data.map(dbToClient)); },
      fournisseurs: async () => { const { data } = await supabase.from('fournisseurs').select('*'); if (data) setFournisseurs(data.map(dbToFournisseur)); },
      produits: async () => { const { data } = await supabase.from('produits').select('*'); if (data) setProduits(data.map(dbToProduit)); },
      devis: async () => { const { data } = await supabase.from('devis').select('*'); if (data) setDevis(data.map(dbToDevis)); },
      produit_fournisseurs: async () => { const { data } = await supabase.from('produit_fournisseurs').select('*'); if (data) setProduitFournisseurs(data.map(dbToProduitFournisseur)); },
      commandes_fournisseur: async () => { const { data } = await supabase.from('commandes_fournisseur').select('*'); if (data) setCommandesFournisseur(data.map(dbToCommandeFournisseur)); },
      commandes_client: async () => { const { data } = await supabase.from('commandes_client').select('*'); if (data) setCommandesClient(data.map(dbToCommandeClient)); },
      factures_client: async () => { const { data } = await supabase.from('factures_client').select('*'); if (data) setFacturesClient(data.map(dbToFactureClient)); },
      factures_fournisseur: async () => { const { data } = await supabase.from('factures_fournisseur').select('*'); if (data) setFacturesFournisseur(data.map(dbToFactureFournisseur)); },
    };
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const scheduleRefetch = (table: string) => {
      clearTimeout(timers[table]);
      timers[table] = setTimeout(() => { refetchers[table]?.(); }, 400);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    load().then(() => {
      channel = supabase.channel('crm-realtime');
      for (const table of Object.keys(refetchers)) {
        channel.on('postgres_changes' as any, { event: '*', schema: 'public', table }, () => scheduleRefetch(table));
      }
      channel.subscribe();
    });

    return () => {
      Object.values(timers).forEach(clearTimeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const updateClients = useCallback((fn: (prev: Client[]) => Client[]) => {
    setClients(prev => {
      const next = fn(prev);
      const userId = userIdRef.current;
      if (userId) {
        const { added, removed, updated } = diffArrays(prev, next);
        // upsert (insert ou update) pour éviter toute course insert/update
        // (ex. société créée à la volée puis modifiée aussitôt → la ligne peut
        //  ne pas encore exister au moment de l'update).
        if (added.length) supabase.from('clients').upsert(added.map(c => clientToDb(c, userId)) as any).then(({ error }) => { if (error) console.error('[clients insert]', error.message, error.details); });
        if (updated.length) {
          supabase.from('clients').upsert(updated.map(c => clientToDb(c, userId)) as any).then(({ error }) => { if (error) console.error('[clients update]', error.message, error.details); });
        }
        if (removed.length) supabase.from('clients').delete().in('id', removed.map(c => c.id)).then(({ error }) => { if (error) console.error('[clients delete]', error.message, error.details); });
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
        if (added.length) supabase.from('devis').insert(added.map(d => devisToDb(d, userId)) as any).then(({ error }) => {
          if (error) {
            console.error('[devis insert]', error.message, error.details);
            toast.error(`Erreur sauvegarde devis : ${error.message}`);
          }
        });
        if (updated.length) {
          updated.forEach(d => supabase.from('devis').update(devisToDb(d, userId) as any).eq('id', d.id).then(({ error }) => {
            if (error) {
              console.error('[devis update]', d.id, error.message, error.details);
              toast.error(`Erreur mise à jour devis ${d.numero} : ${error.message}`);
            }
          }));
        }
        if (removed.length) supabase.from('devis').delete().in('id', removed.map(d => d.id)).then(({ error }) => { if (error) console.error('[devis delete]', error.message); });
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

// ── Entrepôts DB mapping ────────────────────────────────────────────────────

function dbToEntrepot(r: any): Entrepot {
  return {
    id: r.id,
    nom: r.nom,
    adresse: r.adresse || undefined,
    ville: r.ville || undefined,
    codePostal: r.code_postal || undefined,
    notes: r.notes || undefined,
    estDefaut: r.est_defaut ?? false,
    createdAt: r.created_at || '',
  };
}

function entrepotToDb(e: Entrepot, userId: string) {
  return {
    id: e.id,
    user_id: userId,
    nom: e.nom,
    adresse: e.adresse || null,
    ville: e.ville || null,
    code_postal: e.codePostal || null,
    notes: e.notes || null,
    est_defaut: e.estDefaut,
  };
}

function dbToStockEntrepot(r: any): StockEntrepot {
  return {
    produitId: r.produit_id,
    entrepotId: r.entrepot_id,
    stock: Number(r.stock) || 0,
  };
}

export function useEntrepots() {
  const [entrepots, setEntrepots] = useState<Entrepot[]>([]);
  const [stockEntrepots, setStockEntrepots] = useState<StockEntrepot[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      userIdRef.current = session.user.id;
      const [eRes, sRes] = await Promise.all([
        supabase.from('entrepots').select('*').order('created_at', { ascending: true }),
        supabase.from('stock_entrepot').select('*'),
      ]);
      if (eRes.data) setEntrepots(eRes.data.map(dbToEntrepot));
      if (sRes.data) setStockEntrepots(sRes.data.map(dbToStockEntrepot));
      setLoading(false);
    }
    load();
  }, []);

  const addEntrepot = useCallback(async (e: Omit<Entrepot, 'id' | 'createdAt'>) => {
    const userId = userIdRef.current;
    if (!userId) return null;
    const newE: Entrepot = { ...e, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const { error } = await supabase.from('entrepots').insert(entrepotToDb(newE, userId) as any);
    if (!error) setEntrepots(prev => [...prev, newE]);
    return error ? null : newE;
  }, []);

  const updateEntrepot = useCallback(async (e: Entrepot) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const { error } = await supabase.from('entrepots').update(entrepotToDb(e, userId) as any).eq('id', e.id);
    if (!error) setEntrepots(prev => prev.map(x => x.id === e.id ? e : x));
    return error;
  }, []);

  const deleteEntrepot = useCallback(async (id: string) => {
    const { error } = await supabase.from('entrepots').delete().eq('id', id);
    if (!error) {
      setEntrepots(prev => prev.filter(e => e.id !== id));
      setStockEntrepots(prev => prev.filter(s => s.entrepotId !== id));
    }
    return error;
  }, []);

  const upsertStock = useCallback(async (produitId: string, entrepotId: string, stock: number) => {
    const { error } = await supabase.from('stock_entrepot').upsert(
      { produit_id: produitId, entrepot_id: entrepotId, stock },
      { onConflict: 'produit_id,entrepot_id' }
    );
    if (!error) {
      setStockEntrepots(prev => {
        const exists = prev.find(s => s.produitId === produitId && s.entrepotId === entrepotId);
        if (exists) return prev.map(s => s.produitId === produitId && s.entrepotId === entrepotId ? { ...s, stock } : s);
        return [...prev, { produitId, entrepotId, stock }];
      });
    }
    return error;
  }, []);

  return { entrepots, stockEntrepots, loading, addEntrepot, updateEntrepot, deleteEntrepot, upsertStock };
}

export function generateId() {
  return crypto.randomUUID();
}

export function calculerTotalLigne(ligne: LigneDevis) {
  // Arrondir le prix net unitaire à 2 décimales avant multiplication (cohérent avec l'affichage Net HT)
  const prixNetUnitaire = Math.round(ligne.prixUnitaireHT * (1 - ligne.remise / 100) * 100) / 100;
  const totalHT = Math.round(prixNetUnitaire * ligne.quantite * 100) / 100;
  const totalTVA = Math.round(totalHT * (ligne.tva / 100) * 100) / 100;
  return { totalHT, totalTVA, totalTTC: Math.round((totalHT + totalTVA) * 100) / 100 };
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

// ── Barème standard Isosign (conditions de vente) ────────────────────────────

export const LS_STANDARD_BAREME_KEY = 'crm_transport_standard';

export interface StandardTranche {
  min: number;
  max: number | null;  // null = illimité
  prix: number;
}

export interface StandardBareme {
  tranches: StandardTranche[];
  seuilFranco: number;
  hayon: number;
  relivraison: number;
}

export const DEFAULT_STANDARD_BAREME: StandardBareme = {
  tranches: [
    { min: 1,   max: 25,  prix: 51  },
    { min: 26,  max: 100, prix: 87  },
    { min: 101, max: 700, prix: 178 },
    { min: 701, max: null, prix: 235 },
  ],
  seuilFranco: 2700,
  hayon: 12,
  relivraison: 75,
};

export function getStandardBareme(): StandardBareme {
  try {
    const saved = localStorage.getItem(LS_STANDARD_BAREME_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as StandardBareme;
      if (parsed.tranches?.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_STANDARD_BAREME;
}

export function saveStandardBareme(b: StandardBareme): void {
  localStorage.setItem(LS_STANDARD_BAREME_KEY, JSON.stringify(b));
}

export function calculerFraisPort(poidsKg: number, hasGranulat: boolean): number | null {
  if (poidsKg <= 0) return 0;
  if (poidsKg > 2000) {
    return hasGranulat ? null : 0;
  }
  const { tranches } = getStandardBareme();
  const tranche = tranches.find(t => t.max === null || poidsKg <= t.max);
  return tranche ? tranche.prix : null;
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

  // Si un fournisseur est épinglé manuellement, il prime sur le calcul auto
  const pinned = pfs.find(pf => pf.estPrioritaire);
  if (pinned) return pinned;

  let best: ProduitFournisseur | null = null;
  let bestCost = Infinity;

  for (const pf of pfs) {
    const fourn = fournisseurs.find(f => f.id === pf.fournisseurId);
    if (!fourn) continue;

    const qte = Math.max(qteCommande, pf.conditionnementMin);
    const prixEffectif = getPfPrixPourQuantite(pf, qte);
    const totalAchat = prixEffectif * qte;
    // Transport : utilise les paliers port si définis, sinon franco/coût standard
    const transport = getPfTransportPourMontant(pf, fourn, totalAchat);
    const coutGlobal = totalAchat + transport;
    const coutUnitaire = coutGlobal / qte;

    if (coutUnitaire < bestCost) {
      bestCost = coutUnitaire;
      best = pf;
    }
  }

  return best;
}

/**
 * Retourne les prix (achat, revendeur, public) applicables à une quantité donnée,
 * en tenant compte des paliers définis sur le produit.
 * Si pas de palier, retourne les prix de base du produit.
 */
export function getPrixPourQuantite(
  produit: Produit,
  quantite: number
): { prixAchat: number; prixRevendeur: number; prixHT: number } {
  if (!produit.paliersPrix || produit.paliersPrix.length === 0) {
    return { prixAchat: produit.prixAchat, prixRevendeur: produit.prixRevendeur, prixHT: produit.prixHT };
  }
  // Tri décroissant par qteMin, on prend le premier palier atteint
  const sorted = [...produit.paliersPrix].sort((a, b) => b.qteMin - a.qteMin);
  const palier = sorted.find(p => quantite >= p.qteMin);
  if (!palier) {
    // En-dessous de tous les paliers → prix de base
    return { prixAchat: produit.prixAchat, prixRevendeur: produit.prixRevendeur, prixHT: produit.prixHT };
  }
  return { prixAchat: palier.prixAchat, prixRevendeur: palier.prixRevendeur, prixHT: palier.prixHT };
}