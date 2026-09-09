/**
 * Le CHANTIER, lu dans la demande du client.
 *
 * Odoo tient une case « Chantier » (`x_studio_chantier`) à côté de la
 * référence client, et c'est elle qui regroupe les commandes d'un même site.
 * Le client, lui, l'écrit dans l'objet de son mail — « Consultation Chantier
 * PANTIN » — et jamais dans un champ prévu pour.
 *
 * ⚠️ **« CHANTIER » EST AUSSI UN MOT DE LA SIGNALISATION**, et c'est tout le
 * problème : « panneaux KC1 chantier interdit au public » parle du panneau, pas
 * du lieu. Proposer « INTERDIT » comme chantier serait pire que ne rien
 * proposer — on le corrigerait une fois sur deux, et le jour où on oublie, le
 * devis part avec un chantier inventé.
 *
 * Deux garde-fous, et ils suffisent sur les cas réels :
 *
 * — **Ce qui suit doit être écrit comme un NOM PROPRE** : « PANTIN », « Zac des
 *   Vignes ». La prose de signalisation qui suit « chantier » est en minuscules
 *   (« interdit », « mobile », « en cours ») ; un nom de commune ne l'est pas.
 * — **L'OBJET DU MAIL D'ABORD.** C'est là que le chantier se nomme, et le corps
 *   du message est justement l'endroit où « chantier » qualifie des panneaux.
 *   On ne descend dans le corps que si l'objet est muet.
 */

/** Mots qui suivent « chantier » sans jamais le nommer. */
const APRES_CHANTIER_INTERDITS = new Set([
  'INTERDIT', 'INTERDITE', 'MOBILE', 'FIXE', 'BARRE', 'BARREE', 'EN', 'DE',
  'DU', 'DES', 'LE', 'LA', 'LES', 'AU', 'AUX', 'ET', 'SUR', 'POUR', 'AVEC',
  'PAR', 'SANS', 'COURS', 'ROUTE', 'PANNEAU', 'PANNEAUX', 'SIGNALISATION',
  'BALISAGE', 'TEMPORAIRE', 'PUBLIC', 'DANGER', 'TRAVAUX',
]);

function sansAccents(t: string) {
  return t.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** « PANTIN », « Zac » — une majuscule initiale, ou tout en capitales. */
function estNomPropre(mot: string): boolean {
  if (mot.length < 2) return false;
  if (!/^[A-ZÀ-Þ]/.test(mot)) return false;
  return !APRES_CHANTIER_INTERDITS.has(sansAccents(mot).toUpperCase());
}

/** Cherche « chantier <Nom…> » dans un fragment, et rend le nom seul. */
function chantierDansFragment(fragment: string): string | null {
  const m = /chantiers?\s+(.{0,60})/i.exec(sansAccents(fragment));
  if (!m) return null;
  /* On repart du texte D'ORIGINE pour garder les accents du nom : « Séméac »
     ne doit pas être proposé « Semeac ». L'index est le même, `sansAccents`
     ne changeant pas la longueur (les caractères composés sont recomposés
     un à un). */
  const suite = fragment.slice(m.index + m[0].length - m[1].length);
  const mots = suite.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);

  const retenus: string[] = [];
  for (const mot of mots) {
    if (!estNomPropre(mot)) break;
    retenus.push(mot);
    /* Deux mots suffisent — « Zac des Vignes » perd son « des » et c'est très
       bien : le chantier se retrouve à « Zac », pas à la préposition. */
    if (retenus.length === 2) break;
  }
  return retenus.length ? retenus.join(' ') : null;
}

/**
 * Le chantier proposé pour cette demande, ou `null` quand rien ne se dégage.
 *
 * Rendre `null` est une réponse, pas un échec : une case vide se remplit en
 * trois secondes, un chantier inventé se recopie dans Odoo.
 */
export function chantierDansTexte(texte: string): string | null {
  if (!texte?.trim()) return null;
  const lignes = texte.split(/\r?\n/);

  /* L'objet d'abord : c'est là que le chantier se nomme. */
  for (const ligne of lignes) {
    if (!/^\s*(objet|sujet|subject)\s*[:\-]/i.test(ligne)) continue;
    const trouve = chantierDansFragment(ligne);
    if (trouve) return trouve;
  }

  for (const ligne of lignes) {
    const trouve = chantierDansFragment(ligne);
    if (trouve) return trouve;
  }
  return null;
}
