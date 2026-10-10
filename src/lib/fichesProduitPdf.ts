import { supabase } from '@/integrations/supabase/client';

/**
 * Fiche technique PDF déposée sur un article : le fichier part dans le seau
 * public `produits-fiches` et son adresse devient le lien de la fiche, celui
 * que reprennent les mails et les devis (voir `liensProduit.ts`).
 *
 * Seau PUBLIC : le lien est lu par le client, sans connexion. Pas de
 * compression possible sur un PDF — d'où le plafond de 15 Mo, à surveiller
 * dans Paramètres → Quotas (forfait gratuit : 1 Go).
 */

const SEAU_FICHES = 'produits-fiches';
export const OCTETS_MAX_FICHE = 15 * 1024 * 1024;

export function estFichePdf(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

function nomSur(nom: string): string {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'fiche.pdf';
}

export async function deposerFicheTechnique(
  produitId: string, file: File,
): Promise<{ url: string; label: string } | { erreur: string }> {
  if (file.size > OCTETS_MAX_FICHE) {
    return { erreur: `${file.name} dépasse 15 Mo (${(file.size / 1024 / 1024).toFixed(1)} Mo).` };
  }
  const chemin = `${produitId}/${Date.now()}-${nomSur(file.name)}`;
  const { error } = await supabase.storage.from(SEAU_FICHES)
    .upload(chemin, file, { upsert: false, contentType: 'application/pdf' });
  if (error) return { erreur: `Envoi impossible : ${error.message}` };
  const { data } = supabase.storage.from(SEAU_FICHES).getPublicUrl(chemin);
  return { url: data.publicUrl, label: file.name };
}
