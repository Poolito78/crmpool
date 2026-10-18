/**
 * Les documents joints d'un devis, à portée de clic depuis la liste.
 *
 * Un devis né du Chiffrage ISOSIGN porte le PDF du métré (plan annoté +
 * résumé, `depotChiffrage.ts`) ; d'autres portent le plan du client, un
 * devis fournisseur, un lien OneDrive. Il fallait ouvrir le devis, puis
 * « Notes & Fichiers », pour les voir : la carte de la liste les montre
 * désormais, chacun ouvrable d'un clic.
 *
 * Ne sont retenus que les FICHIERS et LIENS du devis lui-même : les notes
 * n'ont rien à ouvrir, et une image rattachée à une ligne (`ligne_id`) est
 * une illustration du PDF, pas un document joint.
 *
 * ⚠️ Le bucket `devis-pj` est privé : l'URL enregistrée est signée (10 ans
 * à l'envoi), mais une copie de devis y range une URL publique qui ne
 * s'ouvre pas. On signe donc une URL fraîche au clic, comme
 * `DevisChatter.getSignedUrl`.
 */
import { supabase } from '@/integrations/supabase/client';

/** Lien externe (OneDrive, dossier, WhatsApp…) rangé en « fichier » avec ce type. */
export const MIME_LIEN = 'application/x-link';

export interface FichierDevis {
  id: string;
  devisId: string;
  nom: string;
  url: string;
  mime?: string;
  confidentiel: boolean;
}

/** Des milliers d'identifiants dans un seul `in()` font une URL trop longue. */
const PAQUET = 150;

/** Les fichiers joints de ces devis, par devis, du plus ancien au plus récent. */
export async function chargerFichiersDevis(devisIds: string[]): Promise<Map<string, FichierDevis[]>> {
  const parDevis = new Map<string, FichierDevis[]>();
  const ids = [...new Set(devisIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += PAQUET) {
    const { data, error } = await supabase.from('devis_pieces_jointes')
      .select('id, devis_id, fichier_nom, fichier_url, fichier_mime, confidentiel, date')
      .in('devis_id', ids.slice(i, i + PAQUET))
      .eq('type', 'fichier')
      .is('ligne_id', null)
      .order('date', { ascending: true });
    if (error) { console.error('[pièces jointes devis]', error.message); continue; }
    for (const r of data ?? []) {
      if (!r.fichier_url) continue;
      const f: FichierDevis = {
        id: r.id, devisId: r.devis_id,
        nom: r.fichier_nom || 'document',
        url: r.fichier_url, mime: r.fichier_mime ?? undefined,
        confidentiel: !!r.confidentiel,
      };
      const liste = parDevis.get(f.devisId);
      if (liste) liste.push(f); else parDevis.set(f.devisId, [f]);
    }
  }
  return parDevis;
}

/** URL à ouvrir : signée à l'instant pour un fichier du bucket, telle quelle sinon. */
export async function urlOuverture(f: Pick<FichierDevis, 'url' | 'mime'>): Promise<string> {
  if (f.mime === MIME_LIEN) return f.url;
  const chemin = f.url.match(/\/devis-pj\/([^?]+)/);
  if (chemin) {
    const { data } = await supabase.storage.from('devis-pj')
      .createSignedUrl(decodeURIComponent(chemin[1]), 60);
    if (data?.signedUrl) return data.signedUrl;
  }
  return f.url;
}

/**
 * Ouvre le document dans un nouvel onglet.
 *
 * L'onglet s'ouvre AVANT la signature : ouvert après un `await`, il serait
 * pris pour une fenêtre surgissante et bloqué par le navigateur.
 */
export async function ouvrirFichierDevis(f: FichierDevis): Promise<void> {
  const onglet = window.open('about:blank', '_blank');
  const url = await urlOuverture(f);
  if (onglet) {
    onglet.opener = null;
    onglet.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
