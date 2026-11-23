/**
 * L'ARTICLE ISOMARK / ISOFLOOR QUI RÉPOND À UN PRODUIT CONCURRENT.
 *
 * Un tarif GEVEKO nomme ses produits par leur marque — « 3SRoute™ ECO TEMPO
 * 20.00KG », « MMARoute™ Enduit Urbain 8.00KG » — et aucun mot n'en est
 * commun avec notre catalogue : le rapprochement par les mots ne trouvait rien.
 * Ce qui les relie, c'est la NATURE du produit : une peinture solvantée
 * répond à une peinture ISOMARK, un enduit à froid MMA à un enduit ISOSIGN.
 *
 * La table des gammes vient du site du fabricant (geveko-markings.fr, relu le
 * 23/11/2026) : 3SRoute = peintures solvantées, AquaRoute = peintures à l'eau,
 * MMARoute = enduits à froid bi-composants, ViaTherm / ThermLite = enduits à
 * chaud, PREMARK / T SIGN / DecoMark = préfabriqués thermocollés, TacPad /
 * TacGuide = bandes podotactiles, etc. Les mots génériques (« peinture
 * solvantée », « diluant ») valent pour tout autre concurrent.
 *
 * ⚠️ On PROPOSE, on ne retient pas : la famille donne les articles comparables,
 * l'utilisateur clique. Dans une famille, l'article désigné par la gamme passe
 * d'abord (Eco Tempo, jaune temporaire → ISOMARK TEMPORAIRE), puis le
 * conditionnement le plus proche (20 kg face à 25 kg avant 5 kg).
 * Fonctions PURES.
 */
import { designationProduit, type Produit } from './store';
import { prixApplicateur, publicPourQuantite } from './remiseGammes';

interface Famille {
  cle: string;
  libelle: string;
  /** Reconnaît le produit concurrent (désignation normalisée, minuscules sans accents). */
  concurrent: RegExp;
  /** Reconnaît NOS articles de la famille (référence + désignation, majuscules). */
  notre: (ref: string, designation: string, categorie: string) => boolean;
  /** Gamme concurrente → nos références à proposer en premier. */
  preferees?: { si: RegExp; references: string[] }[];
}

const FAMILLES: Famille[] = [
  {
    cle: 'peinture-solvant', libelle: 'Peinture solvantée',
    concurrent: /\b(3s ?route|zenith|cezar|elite|sirius|ecolux|safrano|neva|quasar|eco tempo|peinture solvant\w*)\b/,
    notre: ref => /^PST/.test(ref),
    preferees: [
      { si: /\b(eco tempo|safrano|tempo|temporaire)\b/, references: ['PSTTEMPO25P ISO'] },
      { si: /\bjaune\b/, references: ['PSTJAUNE25P ISO', 'PSTJAUNE5 ISO'] },
      { si: /\b(neva|zenith|cezar|elite|sirius|ecolux|blanc\w*)\b/, references: ['PSTSANCY25'] },
    ],
  },
  {
    cle: 'peinture-eau', libelle: "Peinture à l'eau",
    concurrent: /\b(aqua ?route|iska|triton|mark vntp|mark tempo|pre ?signal|peinture a l eau|phase aqueuse)\b/,
    notre: ref => /^PAO/.test(ref),
  },
  {
    cle: 'enduit-froid', libelle: 'Enduit à froid (MMA bi-composant)',
    concurrent: /\b(mma ?route|enduit urbain|nordik|siberie|calgary|solaris|scandik|prisma|baltik|enduit color|rollgrip|rollplast|spraygrip|sprayplast|enduit a froid|plastique a froid)\b/,
    notre: (ref, d) => /^(EAF|ELONYX)/.test(ref) && /^ENDUIT/.test(d),
    preferees: [
      { si: /\b(solaris|jaune)\b/, references: ['EAFJAUNE8 ISO', 'EAFJAUNE8ACTIVE'] },
      { si: /\b(enduit urbain|siberie|calgary)\b/, references: ['EAFEVEREST8 ISO', 'EAFHIMAL8 ISO'] },
      { si: /\b(nordik|scandik|prisma|baltik)\b/, references: ['EAFHIMAL8 ISO', 'EAFEVEREST8 ISO'] },
    ],
  },
  {
    cle: 'enduit-chaud', libelle: 'Enduit à chaud (thermoplastique)',
    concurrent: /\b(via ?therm|therm ?lite|vulcain|route thermo|enduit a chaud)\b/,
    notre: ref => /^EAC/.test(ref),
  },
  {
    cle: 'prefa', libelle: 'Préfabriqué thermocollé',
    concurrent: /\b(premark|t ?sign|decomark|advia|ribline|stamark|prefabrique\w*|thermocoll\w*)\b/,
    notre: (ref, d, cat) => /PREFA THERMO/.test(cat) || /^(MARQT|LIGNE)/.test(ref) || /THERMOCOLL/.test(d),
  },
  {
    cle: 'podotactile', libelle: 'Bande podotactile / guidage',
    concurrent: /\b(tacpad|tac ?guide?|podotactile\w*|eveil de vigilance|bande de guidage)\b/,
    notre: ref => /^(BEV|GUIDGRIP|CLOU)/.test(ref),
  },
  {
    cle: 'gravillonnee', libelle: 'Résine gravillonnée',
    concurrent: /\b(via ?decor|resine gravillonnee|resine drainante|resipox)\b/,
    notre: (ref, d) => /GRAVILLON/.test(d) || /DIAMANT/.test(ref),
  },
  {
    cle: 'diluant', libelle: 'Diluant',
    concurrent: /\b(diluant|dilution)\b/,
    notre: ref => /^DIL/.test(ref),
  },
  {
    cle: 'billes', libelle: 'Microbilles de verre',
    concurrent: /\b(billes? de verre|microbilles?|starlitebead|echostar|minigrain|gem 500|vialux|\d{3} \d{3} sbp)\b/,
    notre: ref => /^MB/.test(ref),
  },
  {
    cle: 'vernis', libelle: 'Vernis',
    concurrent: /\b(vernis|univernis)\b/,
    notre: (_r, d) => /VERNIS/.test(d),
  },
  {
    cle: 'primaire', libelle: 'Primaire',
    concurrent: /\b(viaprim|primaire|primer)\b/,
    notre: (ref, d) => /^PRIM/.test(ref) || /PRIMAIRE|PRIMER/.test(d),
  },
  {
    cle: 'durcisseur', libelle: 'Durcisseur / catalyseur',
    concurrent: /\b(durcisseur|mta|peroxyde|catalys\w*)\b/,
    notre: (_r, d) => /DURCISSEUR|CATALYS|PEROXYDE/.test(d),
  },
  {
    cle: 'granulats', libelle: 'Granulats / charges',
    concurrent: /\b(granulats?|marbre|silice|bauxite|aggrefill|charge antiderapante)\b/,
    notre: (_r, d, cat) => /GRANULATS/.test(cat) || /QUARTZ|SILICE|GRANIT/.test(d),
  },
  {
    cle: 'resine-sol', libelle: 'Résine de sol',
    concurrent: /\b(roc|sol industriel|resine de sol|epoxy|polyurethane)\b/,
    notre: (_r, _d, cat) => /FLOORING \/ (EPOXY|PU|MMA)/.test(cat),
  },
];

/** Minuscules, sans accents ni ™/®, ponctuation en espaces. */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[™®©]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Le conditionnement en kg écrit dans un libellé (« 20.00KG », « 7,85 kg »). */
export function kgDuLibelle(s: string): number | undefined {
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*KG\b/i);
  const n = m ? parseFloat(m[1].replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** La famille du produit concurrent, ou undefined. */
export function familleConcurrente(texte: string): { cle: string; libelle: string } | undefined {
  const t = normaliser(texte);
  const f = FAMILLES.find(x => x.concurrent.test(t));
  return f ? { cle: f.cle, libelle: f.libelle } : undefined;
}

export type IndexEquivalences = Map<string, Produit[]>;

/** Nos articles ISOMARK / ISOFLOOR rangés par famille — une fois par catalogue. */
export function indexEquivalences(produits: readonly Produit[]): IndexEquivalences {
  const index: IndexEquivalences = new Map(FAMILLES.map(f => [f.cle, [] as Produit[]]));
  for (const p of produits) {
    const cat = (p.categorie || '').toUpperCase();
    if (!/ISOMARK|ISOFLOOR/.test(cat)) continue;
    const ref = (p.reference || '').toUpperCase().trim();
    const d = designationProduit(p).toUpperCase();
    for (const f of FAMILLES) if (f.notre(ref, d, cat)) index.get(f.cle)!.push(p);
  }
  return index;
}

/**
 * Les articles à proposer pour un produit concurrent : ceux que sa gamme
 * désigne, puis les autres de la famille par conditionnement le plus proche.
 */
export function equivalentsPour(
  texte: string,
  index: IndexEquivalences,
  max = 6,
): { famille: string; articles: Produit[] } | undefined {
  const t = normaliser(texte);
  const f = FAMILLES.find(x => x.concurrent.test(t));
  if (!f) return undefined;
  const tous = index.get(f.cle) ?? [];
  const refs = f.preferees?.find(p => p.si.test(t))?.references ?? [];
  const kg = kgDuLibelle(texte);
  const rang = (p: Produit) => {
    const i = refs.indexOf((p.reference || '').toUpperCase().trim());
    return i >= 0 ? i : refs.length;
  };
  const ecartKg = (p: Produit) => {
    if (kg == null) return 0;
    const leur = (p.poids && p.poids > 0 ? p.poids : undefined) ?? kgDuLibelle(designationProduit(p));
    return leur == null ? Number.MAX_SAFE_INTEGER : Math.abs(leur - kg);
  };
  const articles = [...tous].sort((a, b) =>
    rang(a) - rang(b)
    || ecartKg(a) - ecartKg(b)
    /* À égalité, nos articles ISOSIGN avant les copies de laboratoire. */
    || Number(/ISOSIGN| ISO$/i.test(designationProduit(b) + ' ' + b.reference)) - Number(/ISOSIGN| ISO$/i.test(designationProduit(a) + ' ' + a.reference))
    || (a.reference || '').localeCompare(b.reference || ''));
  return { famille: f.libelle, articles: articles.slice(0, max) };
}

/**
 * NOTRE PRIX APPLICATEUR AU KG, face au prix NET du concurrent.
 *
 * Le tarif d'un concurrent à un applicateur est un prix net, remise déduite :
 * le comparer à notre public le flattait de moitié (ISOMARK TEMPORAIRE à
 * 12,51 €/kg public, 6,26 €/kg applicateur). La remise est celle de la gamme
 * (`prixApplicateur`, `remiseGammes.ts` : H1 50 %, H2 et ISOFLOOR 30 %), sur
 * le public du premier palier. Poids : fiche, sinon libellé (« 25KG »).
 */
export function applicateurAuKg(p: Produit): { prix: number; public: number; libelle: string; remise: number } | undefined {
  const kg = (p.poids && p.poids > 0 ? p.poids : undefined) ?? kgDuLibelle(designationProduit(p));
  const app = prixApplicateur(publicPourQuantite(p), p.categorie, p.catalogue);
  if (!kg || !app) return undefined;
  return { prix: app.prix / kg, public: app.public / kg, libelle: app.libelle, remise: app.remise };
}

/** Écart de notre prix au leur, en % de leur prix (+ = nous sommes plus chers). */
export function ecartPrix(notre: number, leur: number): number | undefined {
  return leur > 0 && notre > 0 ? (notre - leur) / leur : undefined;
}
