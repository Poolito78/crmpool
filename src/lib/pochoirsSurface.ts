/**
 * Pochoirs de marquage (fiches virages.com) et calcul de la surface à PEINDRE.
 * Les données brutes sont dans `pochoirsCatalogue.ts`.
 *
 * Surface à peindre = surface de la plaque (l × h) × `taux`, la part ajourée
 * du dessin mesurée sur la vignette du pochoir, poignées exclues (elles ne se
 * peignent pas) : précision de quelques %. `pochoirsTaux.ts` (généré avec les
 * images) l'emporte sur le taux du catalogue.
 * À remplacer par la surface vectorielle exacte si l'on obtient les fichiers
 * de découpe.
 */
import { CATALOGUE_POCHOIRS } from './pochoirsCatalogue';
import { TAUX_MESURES } from './pochoirsTaux';

export type CategoriePochoir = 'Piétons & personnes' | 'Vélo & mobilités douces' | 'Véhicules' | 'PMR & accessibilité' | 'Services & divers';

export const CATEGORIES_POCHOIRS: CategoriePochoir[] = [
  'Piétons & personnes', 'Vélo & mobilités douces', 'PMR & accessibilité', 'Véhicules', 'Services & divers',
];

export interface PochoirSurface {
  id: string;
  nom: string;
  categorie: CategoriePochoir;
  /** Vignette retouchée (poignées retirées, noir) : public/pochoirs/<id>.png, générée par scripts/pochoirs-images.mjs. */
  image: string;
  /** Fiche produit chez Virages. */
  url: string;
  /** Part ajourée (0–1) : surface peinte / surface de la plaque. */
  taux: number;
  /** [largeur, hauteur] en cm. Vide : dimension à saisir. */
  tailles: [number, number][];
  /** Défaut connu à signaler à l'utilisateur. */
  note?: string;
  /** Texte de recherche normalisé (nom + synonymes). */
  recherche: string;
}

const VIRAGES = 'https://www.virages.com';

export function sansAccent(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function categorieDe(nom: string): CategoriePochoir {
  const n = sansAccent(nom);
  if (/handicap|fauteuil|pmr|ascenseur|escalator/.test(n)) return 'PMR & accessibilité';
  if (/cycl|velo|bicyclette|trottinette|rollers/.test(n)) return 'Vélo & mobilités douces';
  if (/voiture|camion|bus$|moto|scooter|caravane|camping|tramway|pompiers|taxi|autopartage|covoiturage|enlevement|remorque|golfette|avion|conteneur|lavage|batterie|station de gonflage|station service/.test(n)) return 'Véhicules';
  if (/pieton|homme|femme|famille|enfant|joggeur|randonneur|chien/.test(n)) return 'Piétons & personnes';
  return 'Services & divers';
}

const SYNONYMES: [RegExp, string][] = [
  [/handicap|fauteuil|pmr/, 'pmr handicap handicape fauteuil roulant mobilite reduite accessibilite'],
  [/pieton/, 'pieton pietons marche passage'],
  [/cycliste|velo|bicyclette/, 'cycliste velo cycle piste cyclable bicyclette'],
  [/chariot/, 'chariot caddie supermarche courses'],
];

export const POCHOIRS_SURFACE: PochoirSurface[] = CATALOGUE_POCHOIRS.map(([slug, nom, , tailles, taux, note]) => {
  const n = sansAccent(nom);
  const syn = SYNONYMES.filter(([re]) => re.test(n)).map(([, s]) => s).join(' ');
  return {
    id: slug,
    nom: `Pochoir ${nom}`,
    categorie: categorieDe(nom),
    image: `/pochoirs/${slug}.png`,
    url: `${VIRAGES}/Pochoirs/${slug}`,
    taux: TAUX_MESURES[slug] ?? taux,
    tailles,
    note,
    recherche: sansAccent(`pochoir ${nom} ${syn}`),
  };
});

/** Recherche tous-mots : « chariot palette » ne garde que ce qui contient les deux. */
export function chercherPochoirs(requete: string, catalogue: PochoirSurface[] = POCHOIRS_SURFACE): PochoirSurface[] {
  const mots = sansAccent(requete).split(/\s+/).filter(Boolean);
  if (!mots.length) return catalogue;
  return catalogue.filter(p => mots.every(m => p.recherche.includes(m)));
}

/** Surfaces en m² d'une plaque l × h (cm) : plaque entière, et zone à peindre. */
export function surfaceDimension(p: PochoirSurface, l: number, h: number): { plaque: number; peinte: number } {
  const plaque = (Math.max(l, 0) * Math.max(h, 0)) / 10000;
  return { plaque, peinte: plaque * p.taux };
}
