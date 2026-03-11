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

export interface Client {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  ville: string;
  codePostal: string;
  societe?: string;
  notes?: string;
  dateCreation: string;
  adressesLivraison: AdresseLivraison[];
  estRevendeur?: boolean;
  remisesParCategorie?: Record<string, number>;
}

export interface Fournisseur {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  ville: string;
  codePostal: string;
  societe: string;
  notes?: string;
  francoPort: number;
  coutTransport: number;
  dateCreation: string;
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

export interface LigneDevis {
  id: string;
  produitId?: string;
  description: string;
  quantite: number;
  unite: string;
  prixUnitaireHT: number;
  tva: number;
  remise: number;
  surfaceM2?: number;
  consommation?: number;
}

export interface Devis {
  id: string;
  numero: string;
  clientId: string;
  adresseLivraisonId?: string;
  dateCreation: string;
  dateValidite: string;
  statut: 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré';
  lignes: LigneDevis[];
  referenceAffaire?: string;
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
    adresse: r.adresse,
    ville: r.ville,
    codePostal: r.code_postal,
    societe: r.societe || undefined,
    notes: r.notes || undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
    adressesLivraison: (r.adresses_livraison as any[]) || [],
    estRevendeur: r.est_revendeur || false,
    remisesParCategorie: (r.remises_par_categorie as Record<string, number>) || {},
  };
}

function clientToDb(c: Client, userId: string): Record<string, unknown> {
  return {
    id: c.id,
    user_id: userId,
    nom: c.nom,
    email: c.email,
    telephone: c.telephone,
    adresse: c.adresse,
    ville: c.ville,
    code_postal: c.codePostal,
    societe: c.societe || null,
    notes: c.notes || null,
    date_creation: c.dateCreation,
    adresses_livraison: c.adressesLivraison,
    est_revendeur: c.estRevendeur || false,
    remises_par_categorie: c.remisesParCategorie || {},
  };
}

function dbToFournisseur(r: any): Fournisseur {
  return {
    id: r.id,
    nom: r.nom,
    email: r.email,
    telephone: r.telephone,
    adresse: r.adresse,
    ville: r.ville,
    codePostal: r.code_postal,
    societe: r.societe,
    notes: r.notes || undefined,
    francoPort: Number(r.franco_port) || 0,
    coutTransport: Number(r.cout_transport) || 0,
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
    adresse: f.adresse,
    ville: f.ville,
    code_postal: f.codePostal,
    societe: f.societe,
    notes: f.notes || null,
    franco_port: f.francoPort,
    cout_transport: f.coutTransport,
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
    date_creation: p.dateCreation,
  };
}

function dbToDevis(r: any): Devis {
  return {
    id: r.id,
    numero: r.numero,
    clientId: r.client_id || '',
    adresseLivraisonId: r.adresse_livraison_id || undefined,
    dateCreation: r.date_creation?.split('T')[0] || '',
    dateValidite: r.date_validite?.split('T')[0] || '',
    statut: r.statut as Devis['statut'],
    lignes: (r.lignes as LigneDevis[]) || [],
    referenceAffaire: r.reference_affaire || undefined,
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
    adresse_livraison_id: d.adresseLivraisonId || null,
    date_creation: d.dateCreation,
    date_validite: d.dateValidite || null,
    statut: d.statut,
    lignes: d.lignes as any,
    reference_affaire: d.referenceAffaire || null,
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
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  // Load data from Supabase on mount
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      userIdRef.current = session.user.id;

      const [cRes, fRes, pRes, dRes] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('fournisseurs').select('*'),
        supabase.from('produits').select('*'),
        supabase.from('devis').select('*'),
      ]);

      if (cRes.data) setClients(cRes.data.map(dbToClient));
      if (fRes.data) setFournisseurs(fRes.data.map(dbToFournisseur));
      if (pRes.data) setProduits(pRes.data.map(dbToProduit));
      if (dRes.data) setDevis(dRes.data.map(dbToDevis));
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

  return { clients, fournisseurs, produits, devis, updateClients, updateFournisseurs, updateProduits, updateDevis, loading };
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
