/**
 * LES DOCUMENTS D'UN CONCURRENT : tarif ou devis classé sur sa fiche.
 *
 * Le tarif GEVEKO rapporté par CS ROUTE était lu, ses prix enregistrés… et
 * le PDF perdu : impossible de relire d'où venait un 4,77 €/kg six mois plus
 * tard. L'analyse le classe désormais sur la fiche du concurrent, et la fiche
 * (onglet Documents) le rouvre.
 *
 * Table `concurrent_documents` + bucket PRIVÉ `concurrents-docs` (migration
 * 20261123160000) : partagés entre utilisateurs connectés, comme toute la
 * veille. Le fichier s'ouvre par lien signé (une heure). Chemin
 * `{concurrent}/{horodatage}-{nom}` : deux dépôts du même nom ne s'écrasent
 * pas. La table n'est pas dans `types.ts` (pas régénéré) : lue en `as never`.
 */
import { supabase } from '@/integrations/supabase/client';

export const BUCKET_CONCURRENTS = 'concurrents-docs';

export interface ConcurrentDocument {
  id: string;
  concurrentId: string;
  nom: string;
  chemin: string;
  taille?: number;
  typeMime?: string;
  libelle?: string;
  clientNom?: string;
  dateDocument?: string;
  createdByEmail?: string;
  createdAt: string;
}

interface LigneDb {
  id: string; concurrent_id: string; nom: string; chemin: string;
  taille: number | null; type_mime: string | null; libelle: string | null;
  client_nom: string | null; date_document: string | null;
  created_by_email: string | null; created_at: string;
}

const versDocument = (r: LigneDb): ConcurrentDocument => ({
  id: r.id,
  concurrentId: r.concurrent_id,
  nom: r.nom,
  chemin: r.chemin,
  taille: r.taille ?? undefined,
  typeMime: r.type_mime ?? undefined,
  libelle: r.libelle ?? undefined,
  clientNom: r.client_nom ?? undefined,
  dateDocument: r.date_document ?? undefined,
  createdByEmail: r.created_by_email ?? undefined,
  createdAt: r.created_at,
});

/** Nom de fichier sûr pour le stockage (accents, espaces, ™ retirés). Fonction PURE. */
export function nomStockage(nom: string): string {
  const propre = nom.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return propre || 'document';
}

export async function listerDocumentsConcurrent(concurrentId: string): Promise<ConcurrentDocument[]> {
  const { data, error } = await supabase
    .from('concurrent_documents' as never)
    .select('*')
    .eq('concurrent_id', concurrentId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[concurrent_documents] lecture :', error.message); return []; }
  return ((data ?? []) as unknown as LigneDb[]).map(versDocument);
}

/** Classe un fichier sur la fiche du concurrent. Lève une erreur lisible en cas d'échec. */
export async function classerDocumentConcurrent(
  concurrentId: string,
  fichier: File,
  meta: { libelle?: string; clientNom?: string; dateDocument?: string } = {},
): Promise<ConcurrentDocument> {
  const chemin = `${concurrentId}/${Date.now()}-${nomStockage(fichier.name)}`;
  const { error: errDepot } = await supabase.storage.from(BUCKET_CONCURRENTS)
    .upload(chemin, fichier, { contentType: fichier.type || undefined, upsert: false });
  if (errDepot) throw new Error(`Dépôt du fichier refusé : ${errDepot.message}`);

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('concurrent_documents' as never)
    .insert({
      concurrent_id: concurrentId,
      nom: fichier.name,
      chemin,
      taille: fichier.size,
      type_mime: fichier.type || null,
      libelle: meta.libelle ?? null,
      client_nom: meta.clientNom ?? null,
      date_document: meta.dateDocument ?? null,
      created_by_email: user?.email ?? null,
    } as never)
    .select('*')
    .single();
  if (error || !data) {
    /* Pas de fiche sans fichier, pas de fichier orphelin. */
    await supabase.storage.from(BUCKET_CONCURRENTS).remove([chemin]);
    throw new Error(`Classement refusé : ${error?.message ?? 'réponse vide'}`);
  }
  return versDocument(data as unknown as LigneDb);
}

/** Lien signé (une heure) pour ouvrir le document. */
export async function lienDocumentConcurrent(doc: ConcurrentDocument): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_CONCURRENTS).createSignedUrl(doc.chemin, 3600);
  if (error || !data?.signedUrl) throw new Error(`Document introuvable : ${error?.message ?? ''}`);
  return data.signedUrl;
}

export async function supprimerDocumentConcurrent(doc: ConcurrentDocument): Promise<void> {
  const { error } = await supabase.from('concurrent_documents' as never).delete().eq('id', doc.id);
  if (error) throw new Error(`Suppression refusée : ${error.message}`);
  await supabase.storage.from(BUCKET_CONCURRENTS).remove([doc.chemin]);
}
