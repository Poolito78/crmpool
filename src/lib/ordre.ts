/** Déplace l'élément `i` d'un cran (`delta` = -1 vers le haut, +1 vers le bas). Rend une copie ; hors bornes, la liste est rendue telle quelle. */
export function deplacer<T>(liste: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= liste.length || j < 0 || j >= liste.length) return liste;
  const copie = [...liste];
  [copie[i], copie[j]] = [copie[j], copie[i]];
  return copie;
}
