/**
 * LA QUANTITÉ D'UNE OPTION PAR KIT ET SELON LA TEINTE (pigment PIGMENTKG).
 *
 * Une option se règle sur la fiche article (`LigneKit`) :
 *   - `parUnite` : la quantité vaut PAR UNITÉ de l'article (par kit) — la
 *     ligne de l'option suit la quantité de l'article dans le devis ;
 *   - `quantitesParTeinte` : des exceptions selon la teinte choisie sur
 *     l'option (1 kg de pigment pour tous les RAL, 2 kg pour le RAL 1023).
 *
 * Insérée au devis, la ligne garde sa règle (`LigneDevis.optionDe`) : la
 * quantité suit les kits et la teinte tant qu'elle n'est pas forcée à la
 * main (`qteMode: 'manuel'`), comme un granulat.
 */

export interface QteTeinte {
  /** « RAL 1023 » ou « 1023 » — un numéro RAL se compare au numéro, le reste au libellé. */
  teinte: string;
  quantite: number;
}

const numeroRal = (s: string) => s.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1];

/** La teinte de la règle désigne-t-elle cette valeur de variante ? */
export function teinteCorrespond(regle: string, valeur: string): boolean {
  const r = regle.trim().toLowerCase();
  if (!r) return false;
  const n = numeroRal(r);
  if (n) return numeroRal(valeur) === n;
  return valeur.trim().toLowerCase() === r;
}

/** La quantité de l'option pour les teintes choisies : l'exception de la teinte, sinon la quantité de base. */
export function quantitePourTeinte(base: number, parTeinte: QteTeinte[] | undefined, variantes?: Record<string, string>): number {
  const valeurs = Object.values(variantes ?? {}).filter(Boolean);
  const exception = (parTeinte ?? []).find(e => e.teinte.trim() && valeurs.some(v => teinteCorrespond(e.teinte, v)));
  return exception ? exception.quantite : base;
}

/** Quantité de la ligne de l'option : par teinte, × la quantité de l'article quand elle vaut par kit. */
export function quantiteOption(
  regle: { quantite: number; parUnite?: boolean; quantitesParTeinte?: QteTeinte[] },
  variantes: Record<string, string> | undefined,
  qteArticle: number,
): number {
  const q = quantitePourTeinte(regle.quantite, regle.quantitesParTeinte, variantes);
  return regle.parUnite ? Math.round(q * (qteArticle || 0) * 1000) / 1000 : q;
}

const nombre = (n: number) => String(n).replace('.', ',');

/** La règle en clair, pour la fiche et la fenêtre des options : « 1 U par kit de l'article ; RAL 1023 : 2 U par kit ». */
export function resumeQuantiteOption(regle: { quantite: number; unite: string; parUnite?: boolean; quantitesParTeinte?: QteTeinte[] }): string {
  const par = regle.parUnite ? ' par kit de l\'article' : '';
  const exceptions = (regle.quantitesParTeinte ?? []).filter(e => e.teinte.trim())
    .map(e => `${e.teinte.trim()} : ${nombre(e.quantite)} ${regle.unite}${regle.parUnite ? ' par kit' : ''}`);
  const base = `${nombre(regle.quantite)} ${regle.unite}${par}`;
  return exceptions.length ? `${base} (autres teintes) ; ${exceptions.join(' ; ')}` : base;
}
