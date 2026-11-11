/**
 * Ventes Odoo — copie EN LECTURE SEULE des lignes de factures et de commandes
 * d'Odoo (fonction `odoo-ventes`), rangée dans `ventes_odoo` pour l'analyse
 * croisée : sources « Factures Odoo » / « Commandes Odoo » des pages, du
 * tableau de bord et de l'onglet Ventes de la fiche client.
 *
 * ⚠️ **CE NE SONT PAS DES DOCUMENTS MONCRM.** Rien ne va dans
 * `factures_client` ni `commandes_client` : une facture insérée là redevient
 * un brouillon à « émettre » (trigger `figer_facture_client`), donc une
 * seconde facture légale pour une vente qu'Odoo a déjà facturée ; une
 * commande entrerait dans le circuit AR → facturer. Décision du 11/11/2026.
 *
 * Premier périmètre : le Flooring (catégories « ISOMARK / FLOORING… »), lignes
 * Flooring seules, tous commerciaux. Un import REMPLACE les lignes de son
 * année et de son périmètre : Odoo fait foi, une ligne supprimée chez lui
 * disparaît ici.
 *
 * **Le client** : le partenaire COMMERCIAL d'Odoo (la société) est rattaché à
 * une fiche MonCRM — lien déjà établi par un import précédent, mention
 * « partenaire #id » des notes, n° de TVA, courriel, puis raison sociale
 * exacte (accents, ponctuation et casse ignorés). Introuvable : la fiche est
 * CRÉÉE depuis Odoo (choix du 11/11/2026), une fois par partenaire. Jamais de
 * rapprochement « à peu près » : deux sociétés voisines ne se confondent pas.
 */
import { supabase } from '@/integrations/supabase/client';
import { generateId, type Client } from '@/lib/store';

export type PerimetreVentes = 'flooring';

export interface LigneVenteOdoo {
  source: 'facture' | 'commande';
  odooLigneId: number;
  odooDocumentId: number;
  numero: string;
  typeDocument: 'facture' | 'avoir' | 'commande';
  date: string | null;
  statut: string;
  partenaireId: number | null;
  commercial: string;
  reference: string;
  designation: string;
  categorie: string;
  quantite: number;
  totalHT: number;
  referenceAffaire: string;
}

export interface PartenaireVente {
  id: number;
  nom: string;
  estSociete: boolean;
  email: string;
  telephone: string;
  mobile: string;
  adresse: string;
  codePostal: string;
  ville: string;
  tva: string;
}

export interface ResultatOdooVentes {
  annee: number;
  perimetre: string;
  journal: string[];
  lignes: LigneVenteOdoo[];
  partenaires: PartenaireVente[];
}

/** Ligne de `ventes_odoo`. */
export interface VenteOdoo {
  id?: string;
  source: 'facture' | 'commande';
  perimetre: string;
  odoo_ligne_id: number;
  odoo_document_id: number;
  numero: string;
  type_document: 'facture' | 'avoir' | 'commande';
  date: string | null;
  statut: string | null;
  partenaire_odoo_id: number | null;
  partenaire_nom: string | null;
  client_id: string | null;
  commercial: string | null;
  reference: string | null;
  designation: string | null;
  categorie: string | null;
  quantite: number;
  total_ht: number;
  reference_affaire: string | null;
  importe_le?: string;
}

// ── Rapprochement des clients ──────────────────────────────────────────────

/** Raison sociale comparable : sans accents, ponctuation ni casse. */
export function normaliserNom(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const normaliserTva = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * La fiche MonCRM d'un partenaire Odoo, ou `null`. Par ordre de sûreté :
 * lien d'un import précédent, mention dans les notes, TVA, courriel, nom exact.
 */
export function rapprocherClient(p: PartenaireVente, clients: Client[], dejaLies: Map<number, string>): Client | null {
  const lie = dejaLies.get(p.id);
  if (lie) { const c = clients.find(x => x.id === lie); if (c) return c; }
  const mention = new RegExp(`partenaire #${p.id}\\b`);
  const parNote = clients.find(c => c.notes && mention.test(c.notes));
  if (parNote) return parNote;
  const tva = normaliserTva(p.tva);
  if (tva) { const c = clients.find(x => x.tvaIntra && normaliserTva(x.tvaIntra) === tva); if (c) return c; }
  const email = p.email.trim().toLowerCase();
  if (email) { const c = clients.find(x => x.email && x.email.trim().toLowerCase() === email); if (c) return c; }
  const nom = normaliserNom(p.nom);
  if (nom) {
    const memes = clients.filter(x => normaliserNom(x.societe || '') === nom || normaliserNom(x.nom) === nom);
    if (memes.length === 1) return memes[0];
    if (memes.length > 1) return memes.find(x => normaliserNom(x.societe || '') === nom) ?? memes[0];
  }
  return null;
}

export function clientDepuisPartenaire(p: PartenaireVente, aujourdhui: string): Client {
  return {
    id: generateId(),
    nom: p.nom,
    societe: p.nom,
    email: p.email,
    telephone: p.telephone || p.mobile,
    telephoneMobile: p.mobile || undefined,
    adresse: p.adresse,
    ville: p.ville,
    codePostal: p.codePostal,
    tvaIntra: p.tva || undefined,
    notes: `Fiche reprise du fichier Odoo (partenaire #${p.id}) à l'import des ventes.`,
    dateCreation: aujourdhui,
    adressesLivraison: [],
  };
}

/**
 * Ce que l'import va écrire : les fiches clients à créer et les lignes de
 * `ventes_odoo`. Pur — testé sans base.
 */
export function preparerImport(
  r: ResultatOdooVentes,
  clients: Client[],
  lignesPrecedentes: Pick<VenteOdoo, 'partenaire_odoo_id' | 'client_id'>[],
  aujourdhui: string,
): { nouveauxClients: Client[]; lignes: VenteOdoo[]; rattaches: number } {
  const dejaLies = new Map<number, string>();
  for (const l of lignesPrecedentes) if (l.partenaire_odoo_id && l.client_id) dejaLies.set(l.partenaire_odoo_id, l.client_id);

  const partenaires = new Map(r.partenaires.map(p => [p.id, p]));
  const clientDe = new Map<number, string>();
  const nouveauxClients: Client[] = [];
  let rattaches = 0;
  const tous = [...clients];
  for (const pid of new Set(r.lignes.map(l => l.partenaireId).filter((x): x is number => x !== null))) {
    const p = partenaires.get(pid);
    if (!p) continue;
    const existant = rapprocherClient(p, tous, dejaLies);
    if (existant) { clientDe.set(pid, existant.id); rattaches++; continue; }
    const nouveau = clientDepuisPartenaire(p, aujourdhui);
    nouveauxClients.push(nouveau);
    tous.push(nouveau);
    clientDe.set(pid, nouveau.id);
  }

  const lignes: VenteOdoo[] = r.lignes.map(l => ({
    source: l.source,
    perimetre: r.perimetre,
    odoo_ligne_id: l.odooLigneId,
    odoo_document_id: l.odooDocumentId,
    numero: l.numero,
    type_document: l.typeDocument,
    date: l.date,
    statut: l.statut || null,
    partenaire_odoo_id: l.partenaireId,
    partenaire_nom: l.partenaireId !== null ? partenaires.get(l.partenaireId)?.nom ?? null : null,
    client_id: l.partenaireId !== null ? clientDe.get(l.partenaireId) ?? null : null,
    commercial: l.commercial || null,
    reference: l.reference || null,
    designation: l.designation || null,
    categorie: l.categorie || null,
    quantite: l.quantite,
    total_ht: l.totalHT,
    reference_affaire: l.referenceAffaire || null,
  }));
  return { nouveauxClients, lignes, rattaches };
}

// ── Base ───────────────────────────────────────────────────────────────────

const table = () => supabase.from('ventes_odoo' as never);

/** Toutes les lignes (quelques milliers au plus), par pages de 1 000. */
export async function lireVentesOdoo(): Promise<VenteOdoo[]> {
  const out: VenteOdoo[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await table().select('*').order('id').range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const lot = (data ?? []) as unknown as VenteOdoo[];
    out.push(...lot);
    if (lot.length < 1000) return out;
  }
}

export interface BilanImport {
  factures: number;
  commandes: number;
  clientsCrees: number;
  clientsRattaches: number;
  journal: string[];
}

/**
 * Lit Odoo, crée les fiches manquantes (`ajouterClients`, l'écriture du
 * store) et REMPLACE les lignes de l'année et du périmètre.
 */
export async function importerVentesOdoo(
  annee: number,
  perimetre: PerimetreVentes,
  clients: Client[],
  ajouterClients: (nouveaux: Client[]) => void,
): Promise<BilanImport> {
  const { data, error } = await supabase.functions.invoke('odoo-ventes', { body: { mode: 'lire', annee, perimetre } });
  if (error) throw new Error(error.message);
  if (data?.erreur) throw new Error(data.erreur);
  const r = data as ResultatOdooVentes;

  const { data: prec, error: e1 } = await table().select('partenaire_odoo_id, client_id').eq('perimetre', perimetre);
  if (e1) throw new Error(e1.message);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { nouveauxClients, lignes, rattaches } = preparerImport(r, clients, (prec ?? []) as never, aujourdhui);

  if (nouveauxClients.length) ajouterClients(nouveauxClients);

  const { error: e2 } = await table().delete()
    .eq('perimetre', perimetre).gte('date', `${annee}-01-01`).lte('date', `${annee}-12-31`);
  if (e2) throw new Error(e2.message);
  for (let i = 0; i < lignes.length; i += 500) {
    const { error: e3 } = await table().upsert(lignes.slice(i, i + 500) as never, { onConflict: 'source,odoo_ligne_id' });
    if (e3) throw new Error(e3.message);
  }
  return {
    factures: new Set(lignes.filter(l => l.source === 'facture').map(l => l.odoo_document_id)).size,
    commandes: new Set(lignes.filter(l => l.source === 'commande').map(l => l.odoo_document_id)).size,
    clientsCrees: nouveauxClients.length,
    clientsRattaches: rattaches,
    journal: r.journal || [],
  };
}
