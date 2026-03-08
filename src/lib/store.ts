import { useState, useCallback } from 'react';

export interface AdresseLivraison {
  id: string;
  libelle: string;
  adresse: string;
  ville: string;
  codePostal: string;
  contact?: string;
  telephone?: string;
  parDefaut: boolean;
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
  francoPort: number; // montant minimum de commande pour franco de port
  coutTransport: number; // coût de transport si franco non atteint
  dateCreation: string;
}

export interface Produit {
  id: string;
  reference: string;
  nom: string;
  description?: string;
  prixAchat: number;
  coefficient: number;
  prixHT: number; // prix de vente public = prixAchat * coefficient
  coeffRevendeur: number;
  remiseRevendeur: number; // en %
  prixRevendeur: number; // prixAchat * coeffRevendeur
  tva: number;
  unite: string;
  stock: number;
  stockMin: number;
  fournisseurId?: string;
  categorie?: string;
  dateCreation: string;
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
}

export interface Devis {
  id: string;
  numero: string;
  clientId: string;
  dateCreation: string;
  dateValidite: string;
  statut: 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré';
  lignes: LigneDevis[];
  referenceAffaire?: string;
  notes?: string;
  conditions?: string;
  fraisPortHT?: number;
  fraisPortTVA?: number;
}

// Demo data
const demoClients: Client[] = [
  { id: '1', nom: 'Martin Dupont', email: 'martin@entreprise.fr', telephone: '06 12 34 56 78', adresse: '12 Rue de la Paix', ville: 'Paris', codePostal: '75002', societe: 'Dupont SARL', dateCreation: '2024-01-15', adressesLivraison: [
    { id: 'al1', libelle: 'Entrepôt Paris', adresse: '50 Rue du Faubourg', ville: 'Paris', codePostal: '75010', parDefaut: true },
    { id: 'al2', libelle: 'Agence Lyon', adresse: '10 Rue de la République', ville: 'Lyon', codePostal: '69002', contact: 'Paul Martin', telephone: '06 55 44 33 22', parDefaut: false },
  ]},
  { id: '2', nom: 'Sophie Laurent', email: 'sophie@laurent.com', telephone: '06 98 76 54 32', adresse: '45 Avenue des Champs', ville: 'Lyon', codePostal: '69003', societe: 'Laurent & Co', dateCreation: '2024-02-20', adressesLivraison: [] },
  { id: '3', nom: 'Pierre Bernard', email: 'p.bernard@mail.fr', telephone: '07 11 22 33 44', adresse: '8 Boulevard Haussmann', ville: 'Marseille', codePostal: '13001', dateCreation: '2024-03-10', adressesLivraison: [] },
];

const demoFournisseurs: Fournisseur[] = [
  { id: '1', nom: 'Jean Fournier', email: 'contact@fournier-mat.fr', telephone: '01 23 45 67 89', adresse: '100 Zone Industrielle', ville: 'Lille', codePostal: '59000', societe: 'Fournier Matériaux', francoPort: 500, coutTransport: 35, dateCreation: '2024-01-01' },
  { id: '2', nom: 'Marie Leroy', email: 'marie@leroy-elec.fr', telephone: '01 98 76 54 32', adresse: '25 Rue du Commerce', ville: 'Nantes', codePostal: '44000', societe: 'Leroy Électrique', francoPort: 300, coutTransport: 25, dateCreation: '2024-02-15' },
];

const demoProduits: Produit[] = [
  { id: '1', reference: 'PRD-001', nom: 'Câble électrique 2.5mm²', description: 'Câble cuivre souple', prixAchat: 0.60, coefficient: 2.5, prixHT: 1.50, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 0.96, tva: 20, unite: 'm', stock: 500, stockMin: 100, fournisseurId: '2', categorie: 'Électricité', dateCreation: '2024-01-10' },
  { id: '2', reference: 'PRD-002', nom: 'Interrupteur double', description: 'Interrupteur va-et-vient', prixAchat: 5.00, coefficient: 2.58, prixHT: 12.90, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 8.00, tva: 20, unite: 'pièce', stock: 45, stockMin: 10, fournisseurId: '2', categorie: 'Électricité', dateCreation: '2024-01-10' },
  { id: '3', reference: 'PRD-003', nom: 'Tube PVC 100mm', description: 'Tube d\'évacuation', prixAchat: 3.50, coefficient: 2.43, prixHT: 8.50, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 5.60, tva: 20, unite: 'm', stock: 80, stockMin: 20, fournisseurId: '1', categorie: 'Plomberie', dateCreation: '2024-02-01' },
  { id: '4', reference: 'PRD-004', nom: 'Robinet mitigeur', description: 'Mitigeur cuisine chromé', prixAchat: 18.00, coefficient: 2.5, prixHT: 45.00, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 28.80, tva: 20, unite: 'pièce', stock: 8, stockMin: 5, fournisseurId: '1', categorie: 'Plomberie', dateCreation: '2024-02-15' },
  { id: '5', reference: 'PRD-005', nom: 'Peinture blanche 10L', description: 'Peinture acrylique mate', prixAchat: 15.00, coefficient: 2.33, prixHT: 35.00, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 24.00, tva: 20, unite: 'pot', stock: 3, stockMin: 5, fournisseurId: '1', categorie: 'Peinture', dateCreation: '2024-03-01' },
];

const demoDevis: Devis[] = [
  {
    id: '1', numero: 'DEV-2024-001', clientId: '1', dateCreation: '2024-03-01', dateValidite: '2024-04-01', statut: 'accepté',
    lignes: [
      { id: '1', produitId: '1', description: 'Câble électrique 2.5mm²', quantite: 50, unite: 'm', prixUnitaireHT: 1.50, tva: 20, remise: 0 },
      { id: '2', produitId: '2', description: 'Interrupteur double', quantite: 10, unite: 'pièce', prixUnitaireHT: 12.90, tva: 20, remise: 5 },
    ],
    notes: 'Installation électrique cuisine', conditions: 'Paiement à 30 jours'
  },
  {
    id: '2', numero: 'DEV-2024-002', clientId: '2', dateCreation: '2024-03-15', dateValidite: '2024-04-15', statut: 'envoyé',
    lignes: [
      { id: '1', produitId: '3', description: 'Tube PVC 100mm', quantite: 20, unite: 'm', prixUnitaireHT: 8.50, tva: 20, remise: 0 },
      { id: '2', produitId: '4', description: 'Robinet mitigeur', quantite: 2, unite: 'pièce', prixUnitaireHT: 45.00, tva: 20, remise: 10 },
    ],
    notes: 'Rénovation salle de bain'
  },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
}

function saveToStorage<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useStore() {
  const [clients, setClients] = useState<Client[]>(() => loadFromStorage('crm_clients', demoClients));
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>(() => loadFromStorage('crm_fournisseurs', demoFournisseurs));
  const [produits, setProduits] = useState<Produit[]>(() => loadFromStorage('crm_produits', demoProduits));
  const [devis, setDevis] = useState<Devis[]>(() => loadFromStorage('crm_devis', demoDevis));

  const updateClients = useCallback((fn: (prev: Client[]) => Client[]) => {
    setClients(prev => { const next = fn(prev); saveToStorage('crm_clients', next); return next; });
  }, []);
  const updateFournisseurs = useCallback((fn: (prev: Fournisseur[]) => Fournisseur[]) => {
    setFournisseurs(prev => { const next = fn(prev); saveToStorage('crm_fournisseurs', next); return next; });
  }, []);
  const updateProduits = useCallback((fn: (prev: Produit[]) => Produit[]) => {
    setProduits(prev => { const next = fn(prev); saveToStorage('crm_produits', next); return next; });
  }, []);
  const updateDevis = useCallback((fn: (prev: Devis[]) => Devis[]) => {
    setDevis(prev => { const next = fn(prev); saveToStorage('crm_devis', next); return next; });
  }, []);

  return { clients, fournisseurs, produits, devis, updateClients, updateFournisseurs, updateProduits, updateDevis };
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
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
