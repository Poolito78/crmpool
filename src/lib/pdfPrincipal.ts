/**
 * Le PDF à analyser, parmi ceux qu'un mail joint.
 *
 * L'analyse ne lit qu'un PDF : le premier venu. Le mail d'AFC Communication
 * (devis DV5214, 12/10/2026) joint ses CGV AVANT le devis — l'IA lisait
 * trois pages de conditions de vente, n'y trouvait aucune ligne, et l'écran
 * « Offre de prix reçue » restait vide alors que le devis portait quatre
 * lignes chiffrées.
 *
 * On ne devine pas le contenu au nom du fichier seul : on lit le texte de
 * chaque pièce et l'on retient celle qui ressemble à un document chiffré —
 * des montants, un en-tête de document, des colonnes de prix. Des conditions
 * générales, elles, en sont écartées : elles parlent de prix sans en porter.
 * À égalité, l'ordre du mail est gardé. Une pièce sans texte (scan) ne peut
 * pas se juger : elle garde son rang, sans bonus ni malus.
 */

const CONDITIONS = /conditions\s+g[ée]n[ée]rales|\bc\.?\s?g\.?\s?v\b/i;
const NOM_CONDITIONS = /(^|[^a-z])(cgv|cga|conditions?[ _-]*g[ée]n[ée]rales?)([^a-z]|$)/i;
const EN_TETE = /\b(devis|facture|commande|bon\s+de\s+livraison|offre\s+de\s+prix|proforma|pro-forma)\b/i;
const COLONNES = /quantit[ée]|qt[ée]|prix\s+unitaire|p\.?\s?u\.?\b|montant|total\s+h\.?\s?t/i;
const MONTANT = /\d[\d\s.]*,\d{2}\b/g;

/** Note d'une pièce : plus elle est haute, plus c'est le document chiffré. */
export function notePdf(nom: string, pages: string[]): number {
  const texte = pages.join('\n');
  if (texte.replace(/\s/g, '').length < 40) return 0;
  const montants = (texte.match(MONTANT) ?? []).length;
  let note = 0;
  if (EN_TETE.test(texte)) note += 3;
  if (COLONNES.test(texte)) note += 3;
  note += Math.min(montants, 20) / 4;
  /* Des conditions générales citent « prix », « commande », « facture » à
     chaque paragraphe : le malus doit dépasser tout ce qu'elles ramassent.
     Mais un devis renvoie souvent à ses CGV en pied de page — c'est alors
     ses montants qui le désignent. */
  if (NOM_CONDITIONS.test(nom)) note -= 20;
  if (CONDITIONS.test(texte) && montants < 3) note -= 10;
  return note;
}

/** Indice de la pièce à analyser ; le premier à égalité. */
export function choisirPdfPrincipal(sources: { name: string; pages: string[] }[]): number {
  let meilleur = 0;
  let noteMax = -Infinity;
  sources.forEach((s, i) => {
    const n = notePdf(s.name, s.pages);
    if (n > noteMax) { noteMax = n; meilleur = i; }
  });
  return meilleur;
}
