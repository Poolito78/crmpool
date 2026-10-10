import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TypeDocument } from './analyseDocument';

/**
 * Mini-GED fournisseurs : les pièces glissées dans l'Analyse (PDF, courriel
 * .eml/.msg, Excel) se rangent sur la fiche du fournisseur.
 *
 * LE FICHIER ORIGINAL EST CONSERVÉ TEL QUEL — un .msg reste un .msg, avec ses
 * pièces jointes : on ne garde pas le texte extrait, qui ne vaut pas la pièce.
 *
 * STOCKAGE : bucket privé `ged-fournisseurs`, un dossier par utilisateur
 * (`{user_id}/{fournisseur_id}/{horodatage}-{nom}`), 25 Mo par fichier. Le
 * forfait Supabase est le gratuit (1 Go) : le plafond par fichier protège le
 * quota, et la suppression d'une ligne supprime aussi le fichier.

 * La table et le bucket viennent de la migration 20261009100000.
 */

export type GenreDocFournisseur = 'devis' | 'commande' | 'bon_livraison' | 'facture' | 'autre';

export const GENRES_DOC_FOURNISSEUR: GenreDocFournisseur[] =
  ['devis', 'commande', 'bon_livraison', 'facture', 'autre'];

export const LIBELLE_GENRE_FOURNISSEUR: Record<GenreDocFournisseur, string> = {
  devis: 'Devis',
  commande: 'Commande',
  bon_livraison: 'Bon de livraison',
  facture: 'Facture',
  autre: 'Autre',
};

export interface DocumentFournisseur {
  id: string;
  fournisseurId: string;
  genre: GenreDocFournisseur;
  libelle: string;
  numero: string;
  dateDocument: string;
  montantHT?: number;
  fichierNom: string;
  fichierPath: string;
  fichierTaille: number;
  fichierMime: string;
  createdAt: string;
}

export const TAILLE_MAX_GED = 25 * 1024 * 1024;

/** Genre proposé d'après le type que l'analyse a reconnu. */
export function genreDepuisType(t?: TypeDocument): GenreDocFournisseur {
  switch (t) {
    case 'devis_fournisseur': return 'devis';
    case 'commande_fournisseur': return 'commande';
    case 'bon_livraison': return 'bon_livraison';
    case 'facture_fournisseur': return 'facture';
    default: return 'autre';
  }
}

export function formatTaille(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

const BUCKET = 'ged-fournisseurs';
const table = () => supabase.from('documents_fournisseur');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function depuisLigne(r: any): DocumentFournisseur {
  return {
    id: r.id,
    fournisseurId: r.fournisseur_id,
    genre: r.genre,
    libelle: r.libelle ?? '',
    numero: r.numero ?? '',
    dateDocument: r.date_document ?? '',
    montantHT: r.montant_ht != null ? Number(r.montant_ht) : undefined,
    fichierNom: r.fichier_nom,
    fichierPath: r.fichier_path,
    fichierTaille: Number(r.fichier_taille ?? 0),
    fichierMime: r.fichier_mime ?? '',
    createdAt: r.created_at,
  };
}

/** Nom sûr pour une clé de stockage (accents et caractères spéciaux retirés). */
function nomSur(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'document';
}

export interface EntreeGed {
  fournisseurId: string;
  genre: GenreDocFournisseur;
  libelle?: string;
  numero?: string;
  dateDocument?: string;
  montantHT?: number;
}

/** Range un fichier : téléverse l'original puis écrit la ligne. */
export async function ajouterDocumentFournisseur(file: File, e: EntreeGed): Promise<DocumentFournisseur> {
  if (file.size > TAILLE_MAX_GED) {
    throw new Error(`${file.name} dépasse ${formatTaille(TAILLE_MAX_GED)} (${formatTaille(file.size)}).`);
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Session expirée — reconnectez-vous.');

  const path = `${user.id}/${e.fournisseurId}/${Date.now()}-${nomSur(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) throw new Error(`Téléversement impossible : ${upErr.message}`);

  const { data, error } = await table().insert({
    user_id: user.id,
    fournisseur_id: e.fournisseurId,
    genre: e.genre,
    libelle: e.libelle || null,
    numero: e.numero || null,
    date_document: e.dateDocument || null,
    montant_ht: e.montantHT ?? null,
    fichier_nom: file.name,
    fichier_path: path,
    fichier_taille: file.size,
    fichier_mime: file.type || null,
  }).select().single();
  if (error) {
    // Pas de fichier orphelin si la ligne n'a pas pu s'écrire.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Enregistrement impossible : ${error.message}`);
  }
  return depuisLigne(data);
}

export async function supprimerDocumentFournisseur(d: DocumentFournisseur): Promise<void> {
  const { error } = await table().delete().eq('id', d.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([d.fichierPath]);
}

/** Lien signé (10 min) vers le fichier. */
export async function lienDocumentFournisseur(d: DocumentFournisseur): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.fichierPath, 600);
  if (error || !data) throw new Error(error?.message ?? 'Lien indisponible');
  return data.signedUrl;
}

/** Documents d'un fournisseur, du plus récent au plus ancien. */
export function useDocumentsFournisseur(fournisseurId: string | undefined) {
  const [documents, setDocuments] = useState<DocumentFournisseur[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  const recharger = useCallback(async () => {
    if (!fournisseurId) { setDocuments([]); return; }
    setChargement(true);
    const { data, error } = await table().select('*')
      .eq('fournisseur_id', fournisseurId).order('created_at', { ascending: false });
    setChargement(false);
    if (error) { setErreur(error.message); setDocuments([]); return; }
    setErreur('');
    setDocuments((data ?? []).map(depuisLigne));
  }, [fournisseurId]);

  useEffect(() => { void recharger(); }, [recharger]);

  return { documents, chargement, erreur, recharger };
}

/** Nombre de documents rangés par fournisseur (pastille de la liste). */
export function useNombreDocumentsFournisseur() {
  const [nombres, setNombres] = useState<Record<string, number>>({});

  const recharger = useCallback(async () => {
    const { data, error } = await table().select('fournisseur_id');
    if (error || !data) return;
    const n: Record<string, number> = {};
    for (const r of data) n[r.fournisseur_id] = (n[r.fournisseur_id] ?? 0) + 1;
    setNombres(n);
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  return { nombres, recharger };
}
