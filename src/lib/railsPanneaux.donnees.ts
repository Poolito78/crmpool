/**
 * Nombre de rails par panneau — la table du catalogue ISOSIGN.
 *
 * ⚠️ **UNE BRIDE PAR RAIL.** C'est la règle, et elle ne se déduit ni de la
 * surface ni du nombre de mâts : le catalogue donne le nombre de rails pour
 * chaque famille de panneau et chaque gamme de taille, et c'est lui qui fait
 * foi. Un A13a en 700 porte 2 rails, le même en 1250 en porte 3 ; un B21a1 en
 * porte 4 quelle que soit sa taille.
 *
 * Les valeurs sont relevées sur les pages « NBRE DE RAILS » du catalogue
 * (types A, AB, B, C, CE, J4, J5, G, fluviaux, décors). Toute page non encore
 * saisie doit rester ABSENTE de ces tables : `railsDuPanneau` rend alors
 * `null`, l'écran compte la ligne comme « à vérifier » et n'invente rien. Un
 * rail oublié, c'est une bride qui manque sur le chantier ; un rail inventé,
 * c'est une ligne de trop sur le devis du client.
 */

/** Rails par famille tarifaire, indexés par la cote (mm) du panneau. */
export const RAILS_PANNEAU: Record<string, Record<string, number>> = {
  /* TYPE A — signalisation de danger (triangles). */
  A: { '500': 2, '700': 2, '1000': 2, '1250': 3, '1500': 3 },

  /* TYPE AB — intersection et priorité. */
  AB3: { '500': 2, '700': 2, '1000': 2, '1250': 3 },
  AB4: { '400': 2, '600': 2, '800': 2, '1000': 2 },
  AB6: { '350': 2, '500': 2, '700': 2, '900': 3 },

  /* TYPE B — interdiction, obligation, stationnement. */
  B: { '450': 2, '650': 2, '850': 2, '1050': 2, '1250': 3 },
  /* B21a1 / B21a2 : 4 rails, hors domaine certifié. */
  B21A: { '450': 4, '650': 4, '850': 4 },

  /* TYPE C — indication. C107/C108/C207/C208. */
  C107: { '900': 3, '1050': 3, '1200': 3 },
  /* TYPE CE — indication des services. */
  CE: { '350': 2, '500': 2, '700': 2, '900': 3, '1050': 3 },

  /* TYPE J5 — balises de contournement. */
  J5: { '350': 2, '500': 2, '700': 2, '900': 3, '1050': 3 },
};

/**
 * Familles dont le nombre de rails ne dépend pas de la taille.
 * G1, G1a, G1b, G1c : 3 rails. M9h : 2. M9b : 1.
 */
export const RAILS_FIXES: Record<string, number> = {
  G1: 3,
  M9H: 2,
  M9B: 1,
};

/**
 * TYPE B — zones de circulation particulière (B30, B51, B56, B57).
 * Cotes rectangulaires, pas une gamme.
 */
export const RAILS_ZONE: Record<string, number> = {
  '500x650': 2,
  '700x900': 3,
};

/** TYPE J4 — balises à chevrons, par format. */
export const RAILS_J4: Record<string, number> = {
  '400x400': 2,
  '800x400': 2,
  '1200x400': 2,
  '1600x400': 2,
  '2000x400': 2,
  '600x600': 2,
  '1200x600': 2,
  '1800x600': 3,
  '800x800': 2,
  '1600x800': 3,
  '2400x800': 3,
  '1000x1000': 3,
};

/**
 * PANONCEAUX — par format, toutes associations confondues.
 *
 * ⚠️ **UN DÉSACCORD CONNU** : le 350×350 vaut 1 rail sur la page AB et 2 sur
 * la page B. On retient 2 — une bride en trop se voit sur le devis, une bride
 * en moins se découvre sur le chantier. À trancher avec le catalogue papier.
 */
export const RAILS_PANONCEAU: Record<string, number> = {
  '150x350': 1,
  '200x500': 1,
  '200x700': 2,
  '350x150': 1,
  '350x250': 1,
  '350x350': 2,
  '500x150': 1,
  '500x200': 1,
  '500x250': 1,
  '500x300': 1,
  '500x350': 1,
  '500x500': 2,
  '700x200': 1,
  '700x350': 1,
  '700x700': 2,
  '900x250': 1,
  '900x500': 2,
  '900x900': 3,
  '1000x300': 1,
  '1000x600': 2,
  '1200x400': 2,
  '1200x600': 2,
};
