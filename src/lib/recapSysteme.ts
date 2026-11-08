/**
 * recapSysteme.ts — LA FICHE RÉCAP DU SYSTÈME REJOINT LES FICHIERS DU DEVIS.
 *
 * Un devis chiffré en système doit porter sa fiche récap dans « Notes &
 * Fichiers » (règle du 08/11/2026). Il fallait aller la chercher dans le devis
 * modèle et la joindre à la main.
 *
 * Deux sources, dans cet ordre :
 *   1. les fichiers du DEVIS MODÈLE dont le système vient (« SYS - Flowseal EPW
 *      Mat » porte fiche-recap-flowseal-epw.pdf) ;
 *   2. la fiche récap de la TABLE `systemes` dont le nom est contenu dans celui
 *      du système (« Flowseal EPW » pour « Flowseal EPW Mat »), le plus précis
 *      d'abord.
 *
 * Seule la récap est reprise : un modèle porte aussi ses fiches produit et ses
 * PDF de mise en œuvre, propres à d'autres chantiers. Le fichier est COPIÉ dans
 * le devis : il ne dépend plus du modèle, qui peut changer ou disparaître.
 * Sans récap trouvée, on le dit — on n'en joint pas une approchante.
 */
import { supabase } from '@/integrations/supabase/client';
import { joindreAuDevis } from '@/lib/depotChiffrage';
import { systemeEstObjet, type Systeme } from '@/lib/systemes';
import { PREFIXE_SYSTEME_DEVIS } from '@/lib/systemesDevis';

export const estFicheRecap = (nom: string | null | undefined): boolean =>
  /fiche[\s_-]*r[eé]cap/i.test(nom ?? '');

export interface PieceDuModele {
  fichier_nom: string | null;
  fichier_url: string | null;
}

export interface SourceRecap {
  nom: string;
  /** Chemin dans le bucket privé `devis-pj`, pour une récap de devis modèle. */
  chemin?: string;
  /** URL publique, pour une récap de la table `systemes`. */
  url?: string;
}

type SystemeTable = Pick<Systeme, 'nom' | 'recapUrl'>;

const nomDepuisUrl = (url: string): string =>
  decodeURIComponent(url.split('?')[0].split('/').pop() ?? '').replace(/^\d+[-_]/, '') || 'fiche-recap.pdf';

/** D'où vient la fiche récap de ce système : le modèle d'abord, sinon la table. */
export function choisirRecap(
  systeme: Pick<Systeme, 'nom'>,
  piecesDuModele: PieceDuModele[],
  table: SystemeTable[],
): SourceRecap | undefined {
  for (const p of piecesDuModele) {
    const chemin = p.fichier_url?.match(/\/devis-pj\/([^?]+)/)?.[1];
    if (estFicheRecap(p.fichier_nom) && chemin) {
      return { nom: p.fichier_nom!, chemin: decodeURIComponent(chemin) };
    }
  }
  const candidat = table
    .filter(s => s.recapUrl?.trim() && systemeEstObjet(s, [systeme.nom]))
    .sort((a, b) => b.nom.length - a.nom.length)[0];
  if (!candidat) return undefined;
  const url = candidat.recapUrl!.trim();
  return { nom: nomDepuisUrl(url), url };
}

async function piecesDuModele(systeme: Pick<Systeme, 'id'>): Promise<PieceDuModele[]> {
  if (!systeme.id.startsWith(PREFIXE_SYSTEME_DEVIS)) return [];
  const { data, error } = await supabase.from('devis_pieces_jointes')
    .select('fichier_nom, fichier_url')
    .eq('devis_id', systeme.id.slice(PREFIXE_SYSTEME_DEVIS.length))
    .eq('type', 'fichier')
    .is('ligne_id', null);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function contenu(source: SourceRecap): Promise<Blob> {
  if (source.chemin) {
    const { data, error } = await supabase.storage.from('devis-pj').download(source.chemin);
    if (error || !data) throw new Error(error?.message || 'fichier illisible');
    return data;
  }
  const reponse = await fetch(source.url!);
  if (!reponse.ok) throw new Error(`téléchargement refusé (${reponse.status})`);
  return reponse.blob();
}

/** Joint au devis la fiche récap de chaque système. Rend ce qui a été joint et ce qui manque. */
export async function joindreFichesRecap(
  devisId: string,
  systemes: Pick<Systeme, 'id' | 'nom'>[],
  table: SystemeTable[],
): Promise<{ joints: string[]; absentes: string[] }> {
  const joints: string[] = [];
  const absentes: string[] = [];
  for (const systeme of systemes) {
    const source = choisirRecap(systeme, await piecesDuModele(systeme), table);
    if (!source) { absentes.push(systeme.nom); continue; }
    if (joints.includes(source.nom)) continue;
    await joindreAuDevis(devisId, new File([await contenu(source)], source.nom, { type: 'application/pdf' }));
    joints.push(source.nom);
  }
  return { joints, absentes };
}
