import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Produit } from '@/lib/store';

/**
 * Systèmes de mise en œuvre, tels que les décrivent les fiches techniques.
 *
 * Un article seul ne suffit pas à chiffrer un marquage. La peinture ALPES
 * s'applique à 440 g/m² sous l'homologation 1 RH 1216 S1 et à 515 g/m² sous
 * 1 H 1215 S3 — et jamais sans billes de verre, qui ont leur propre dosage. La
 * résine Flowfast 319 se mélange à une charge dans un rapport de 1 pour 1,5, se
 * catalyse selon la température du support, et réclame un primaire sur béton.
 *
 * `produit.consommation` sait dire « 2,5 kg/m² » pour un enduit couleur. Elle
 * ne sait rien dire de ce qui précède.
 */

/**
 * Le rôle tenu par un composant dans la mise en œuvre.
 *
 * Les valeurs ci-dessous sont celles qu'on écrit ; la base en porte d'autres,
 * recopiées mot pour mot des fiches système — « couche de masse - liant »,
 * « saupoudrage à refus », « finition teintée ». Les enfermer dans une union
 * fermée obligerait à réécrire la fiche pour la faire entrer dans nos cases,
 * et c'est la fiche qui fait foi. Le type reste donc ouvert, tout en gardant
 * l'autocomplétion sur les rôles courants.
 */
export type RoleComposant =
  | 'base' | 'charge' | 'billes' | 'pigment' | 'catalyseur'
  | 'primaire' | 'silice' | 'quartz' | 'durcisseur' | 'autre'
  | (string & {});

export interface PalierTemperature {
  de: number;
  a: number;
  pourcentage: number;
}

export interface SystemeComposant {
  id: string;
  systemeId: string;
  ordre: number;
  produitId?: string;
  libelle: string;
  role: RoleComposant;
  /** kg par m² traité. */
  consommation?: number;
  /** Multiple du composant de base — la charge vaut 1,5 fois la résine. */
  ratioBase?: number;
  /** Part du composant de base, en pourcentage — pigment à 0,5 %. */
  pourcentage?: number;
  /** Le catalyseur ne se dose pas au m² mais à la température du support. */
  dosageTemperature?: PalierTemperature[];
  obligatoire: boolean;
  condition?: string;
  phraseSource?: string;
  /**
   * Le composant entre dans le PETIT MÉLANGE du système : sa quantité
   * s'arrondit au kit entier. Voir `Systeme.surfaceKitM2`.
   */
  auKit?: boolean;
  /**
   * Le contenant, en kg, quand aucun article du catalogue ne le dit : le SNL
   * Concrete se vend en sacs de 1,255 kg et n'a pas d'article. Le poids de
   * l'article rattaché, lui, l'emporte toujours.
   */
  conditionnementKg?: number;
}

export interface Systeme {
  id: string;
  nom: string;
  famille?: string;
  /** L'homologation ou la finition qui distingue deux variantes. */
  variante?: string;
  usage?: string;
  /**
   * Les exigences de support, telles que la fiche les écrit — « Béton ou
   * chape ciment, résistance mini 25 N/mm², HR max 93 % ». Trois valeurs
   * codées ne sauraient pas dire cela, et c'est cette phrase-là qu'un
   * applicateur doit lire avant de commander.
   */
  support: string;
  description?: string;
  sourceFiche?: string;
  sourceDrive?: string;
  /**
   * Surface couverte par un petit mélange — 5 m² pour le Flowfast 319
   * Concrete : 2,5 kg de résine, 1,255 kg de SNL Concrete, 0,2 kg de pigments.
   * Une bande de 0,10 m ne se trace pas avec un mélange de 20 kg, qui prend
   * avant d'être posé.
   */
  surfaceKitM2?: number;
  /**
   * Au-delà, une surface PLEINE se chiffre au kilo. Une bande se chiffre
   * toujours en petits mélanges, quelle que soit sa longueur.
   */
  kitSurfaceMaxM2?: number;
  actif: boolean;
  composants: SystemeComposant[];
}

/* ── Mapping base ↔ application ──────────────────────────────────────────── */

function dbToComposant(r: any): SystemeComposant {
  return {
    id: r.id,
    systemeId: r.systeme_id,
    ordre: r.ordre ?? 0,
    produitId: r.produit_id || undefined,
    libelle: r.libelle,
    role: (r.role || 'base') as RoleComposant,
    consommation: r.consommation != null ? Number(r.consommation) : undefined,
    ratioBase: r.ratio_base != null ? Number(r.ratio_base) : undefined,
    pourcentage: r.pourcentage != null ? Number(r.pourcentage) : undefined,
    dosageTemperature: (r.dosage_temperature as PalierTemperature[]) || undefined,
    obligatoire: r.obligatoire ?? true,
    condition: r.condition || undefined,
    phraseSource: r.phrase_source || undefined,
    auKit: r.au_kit ?? false,
    conditionnementKg: r.conditionnement_kg != null ? Number(r.conditionnement_kg) : undefined,
  };
}

export function dbToSysteme(r: any): Systeme {
  return {
    id: r.id,
    nom: r.nom,
    famille: r.famille || undefined,
    variante: r.variante || undefined,
    usage: r.usage || undefined,
    support: (r.support || 'tous') as Systeme['support'],
    description: r.description || undefined,
    sourceFiche: r.source_fiche || undefined,
    sourceDrive: r.source_drive || undefined,
    surfaceKitM2: r.surface_kit_m2 != null ? Number(r.surface_kit_m2) : undefined,
    kitSurfaceMaxM2: r.kit_surface_max_m2 != null ? Number(r.kit_surface_max_m2) : undefined,
    actif: r.actif ?? true,
    composants: ((r.systeme_composants as any[]) || [])
      .map(dbToComposant)
      .sort((a, b) => a.ordre - b.ordre),
  };
}

/* ── Calcul des quantités ────────────────────────────────────────────────── */

export interface LigneSysteme {
  composant: SystemeComposant;
  /** Quantité en kg pour la surface demandée. */
  quantiteKg: number;
  /** Nombre de contenants, arrondi au supérieur — on n'achète pas un demi-seau. */
  contenants?: number;
  /** Ce qui a servi au calcul, à afficher pour que le chiffrage soit relisible. */
  explication: string;
  /** Nombre de petits mélanges, quand le composant se prépare en kits. */
  kits?: number;
}

/**
 * Nombre de petits mélanges pour une surface, ou `undefined` quand le système
 * se chiffre au kilo.
 *
 * Une bande se prépare TOUJOURS en petits mélanges ; une surface pleine
 * seulement jusqu'au plafond du système — au-delà, un grand mélange se pose
 * avant de prendre.
 */
export function kitsPour(systeme: Systeme, surfaceM2: number, bande = false): number | undefined {
  const s = systeme.surfaceKitM2;
  if (!s || !(s > 0) || !(surfaceM2 > 0)) return undefined;
  if (!bande && systeme.kitSurfaceMaxM2 != null && surfaceM2 > systeme.kitSurfaceMaxM2) {
    return undefined;
  }
  /* 96,5 m² font 19,3 kits : on en prépare 20. La tolérance évite qu'un
     arrondi flottant — 50,000000001 — n'en ajoute un. */
  return Math.ceil(surfaceM2 / s - 1e-9);
}

/**
 * Décline un système sur une surface.
 *
 * Les composants se calculent dans l'ordre : d'abord ceux qui ont une
 * consommation au m², qui donnent la masse de base ; ensuite ceux qui s'y
 * rapportent — la charge, le pigment, le catalyseur. Un composant qu'on ne
 * sait pas calculer est renvoyé à zéro avec son explication, jamais estimé au
 * jugé : sur un devis, une quantité inventée coûte plus cher qu'une case vide.
 */
export function declinerSysteme(
  systeme: Systeme,
  surfaceM2: number,
  options: {
    temperatureSupport?: number;
    /** Poids du contenant par article, pour convertir les kg en seaux. */
    poidsParProduit?: (produitId?: string) => number | undefined;
    /** Les composants conditionnels retenus, par identifiant. */
    conditionnelsRetenus?: Set<string>;
    /** La demande est une bande (0,10 m, 0,12 m…) : petits mélanges d'office. */
    bande?: boolean;
  } = {},
): LigneSysteme[] {
  const { temperatureSupport, poidsParProduit, conditionnelsRetenus, bande } = options;
  if (!(surfaceM2 > 0)) return [];
  const kits = kitsPour(systeme, surfaceM2, bande);
  const surfaceKit = systeme.surfaceKitM2 ?? 0;

  const retenus = systeme.composants.filter(
    c => c.obligatoire || conditionnelsRetenus?.has(c.id),
  );

  /* LA BASE SERT DE RÉFÉRENCE AUX RATIOS ET AUX POURCENTAGES.
   *
   * Les fiches système n'écrivent presque jamais le mot « base » : elles
   * parlent de « couche de masse », de « revêtement », de « liant ». Prendre
   * le premier composant venu désignait le PRIMAIRE — 0,3 kg/m² — comme
   * référence, et la charge d'un mortier s'en trouvait divisée par quinze.
   * On cherche donc, dans l'ordre : la base déclarée, puis la couche qui en
   * tient lieu, puis n'importe quel composant qui sache dire un dosage. */
  const ROLE_PORTEUR = /base|masse|rev[eê]tement|liant|autolissant|mortier/i;
  const base =
    retenus.find(c => c.role === 'base' && c.consommation != null)
    ?? retenus.find(c => ROLE_PORTEUR.test(c.role) && c.consommation != null)
    ?? retenus.find(c => c.consommation != null)
    ?? retenus[0];
  const masseBase = base?.consommation ? base.consommation * surfaceM2 : 0;

  return retenus.map((c) => {
    let kg = 0;
    let explication = '';

    let kitsComposant: number | undefined;

    if (c.consommation != null && c.auKit && kits) {
      /* Le petit mélange se prépare entier : 20 kits de 5 m² pour 96,5 m². */
      kitsComposant = kits;
      kg = c.consommation * surfaceKit * kits;
      explication = `${kits} kit${kits > 1 ? 's' : ''} de ${surfaceKit} m² × ${c.consommation} kg/m²`;
    } else if (c.consommation != null) {
      kg = c.consommation * surfaceM2;
      explication = `${c.consommation} kg/m² × ${surfaceM2} m²`;
    } else if (c.ratioBase != null && masseBase > 0) {
      kg = c.ratioBase * masseBase;
      explication = `${c.ratioBase} × ${masseBase.toFixed(1)} kg de ${base?.libelle}`;
    } else if (c.pourcentage != null && masseBase > 0) {
      kg = (c.pourcentage / 100) * masseBase;
      explication = `${c.pourcentage} % de ${masseBase.toFixed(1)} kg`;
    } else if (c.dosageTemperature?.length) {
      if (temperatureSupport == null) {
        explication = 'température du support non renseignée — dosage non calculé';
      } else {
        const palier = c.dosageTemperature.find(
          p => temperatureSupport >= p.de && temperatureSupport < p.a,
        );
        if (!palier) {
          explication = `aucun palier pour ${temperatureSupport} °C`;
        } else if (masseBase > 0) {
          kg = (palier.pourcentage / 100) * masseBase;
          explication = `${palier.pourcentage} % à ${temperatureSupport} °C`;
        } else {
          explication = 'masse de base inconnue — dosage non calculé';
        }
      }
    } else {
      explication = 'aucun dosage dans la fiche';
    }

    /* L'article du catalogue dit le contenant ; à défaut, la fiche. */
    const poids = poidsParProduit?.(c.produitId) ?? c.conditionnementKg;
    return {
      composant: c,
      quantiteKg: Math.round(kg * 1000) / 1000,
      contenants: kg > 0 && poids ? Math.ceil(kg / poids - 1e-9) : undefined,
      explication,
      ...(kitsComposant ? { kits: kitsComposant } : {}),
    };
  });
}

/* ── Un système, plusieurs zones ─────────────────────────────────────────── */

/** Une zone d'un même chantier : une ligne jaune, des flèches bleues… */
export interface ZoneSysteme {
  id: string;
  libelle: string;
  surfaceM2: number;
  bande: boolean;
  couleur?: string;
}

export interface LigneChiffreeSysteme {
  /** Clé stable de la ligne — composant, et zone pour un pigment. */
  cle: string;
  composant: SystemeComposant;
  /** La zone, pour une ligne qui lui est propre (le pigment de sa teinte). */
  zone?: ZoneSysteme;
  libelle: string;
  quantiteKg: number;
  contenants?: number;
  kits?: number;
  explication: string;
}

/* Le mot entier : « Flowfast 319 Unpigmented » est une résine, pas un pigment. */
const EST_PIGMENT = /\bpigments?\b/i;

/**
 * Chiffre un système sur plusieurs zones, comme le devis Odoo AF037640 :
 * primaire, quartz, résine, charge et finition une fois pour tout le
 * chantier ; le PIGMENT une fois par teinte.
 *
 * Chaque zone se décline d'abord seule — une bande se prépare en petits
 * mélanges, une surface pleine de plus de 50 m² au kilo — puis on additionne
 * les kilogrammes avant de les convertir en contenants : 117,5 kg de 319 font
 * six seaux de 20 kg, pas un seau par zone arrondi quatre fois.
 *
 * La teinte choisit le pigment : une zone jaune prend le pigment jaune que la
 * fiche dose à part (0,1 kg/m²), les autres les pigments standards. Un pigment
 * de teinte ne sert jamais une zone d'une autre couleur.
 */
export function chiffrerZones(
  systeme: Systeme,
  zones: ZoneSysteme[],
  options: {
    temperatureSupport?: number;
    poidsParProduit?: (produitId?: string) => number | undefined;
    conditionnelsRetenus?: Set<string>;
  } = {},
): LigneChiffreeSysteme[] {
  const { poidsParProduit } = options;
  const utiles = zones.filter(z => z.surfaceM2 > 0);
  if (!utiles.length) return [];

  const teinteDe = (c: SystemeComposant) =>
    EST_PIGMENT.test(c.role) || EST_PIGMENT.test(c.libelle)
      ? ['jaune', 'blanc', 'vert', 'bleu', 'rouge', 'noir', 'gris', 'orange']
        .find(t => new RegExp(`\\b${t}`, 'i').test(`${c.role} ${c.libelle}`))
      : undefined;

  const cumul = new Map<string, LigneChiffreeSysteme>();
  const pigments: LigneChiffreeSysteme[] = [];

  for (const z of utiles) {
    /* Le pigment de la teinte de la zone, s'il existe, remplace les
       pigments standards ; ceux des autres teintes sont écartés. */
    const specifique = systeme.composants.find(c => z.couleur && teinteDe(c) === z.couleur);
    const retenus = new Set(options.conditionnelsRetenus ?? []);
    if (specifique) retenus.add(specifique.id);
    const composants = systeme.composants.filter(c => {
      const pig = EST_PIGMENT.test(c.role) || EST_PIGMENT.test(c.libelle);
      if (!pig) return true;
      const teinte = teinteDe(c);
      if (specifique) return c.id === specifique.id;
      return !teinte;
    }).map(c => (c.id === specifique?.id ? { ...c, obligatoire: true } : c));

    const declinees = declinerSysteme({ ...systeme, composants }, z.surfaceM2, {
      ...options, conditionnelsRetenus: retenus, bande: z.bande,
    });

    for (const ls of declinees) {
      const c = ls.composant;
      if (EST_PIGMENT.test(c.role) || EST_PIGMENT.test(c.libelle)) {
        pigments.push({
          cle: `${c.id}:${z.id}`, composant: c, zone: z,
          libelle: `${c.libelle} — ${z.couleur ?? z.libelle}`,
          quantiteKg: ls.quantiteKg, contenants: ls.contenants, kits: ls.kits,
          explication: `${z.libelle} : ${ls.explication}`,
        });
        continue;
      }
      const prec = cumul.get(c.id);
      if (prec) {
        prec.quantiteKg += ls.quantiteKg;
        prec.kits = (prec.kits ?? 0) + (ls.kits ?? 0) || undefined;
      } else {
        cumul.set(c.id, {
          cle: c.id, composant: c, libelle: c.libelle,
          quantiteKg: ls.quantiteKg, kits: ls.kits, explication: '',
        });
      }
    }
  }

  const surfaceTotale = utiles.reduce((s, z) => s + z.surfaceM2, 0);
  const communs = [...cumul.values()].map(l => {
    const kg = Math.round(l.quantiteKg * 1000) / 1000;
    const poids = poidsParProduit?.(l.composant.produitId) ?? l.composant.conditionnementKg;
    const contenants = kg > 0 && poids ? Math.ceil(kg / poids - 1e-9) : undefined;
    const c = l.composant;
    const explication = kg <= 0
      ? 'aucun dosage calculable dans la fiche'
      : l.kits
        ? `${l.kits} kits de ${systeme.surfaceKitM2} m² × ${c.consommation} kg/m² = ${kg} kg`
        : c.consommation != null
          ? `${c.consommation} kg/m² × ${Math.round(surfaceTotale * 1000) / 1000} m² = ${kg} kg`
          : `${kg} kg`;
    return { ...l, quantiteKg: kg, contenants, explication };
  });

  /* L'ordre de la fiche, les pigments à la suite de leur composant. */
  return [...communs, ...pigments].sort((a, b) => a.composant.ordre - b.composant.ordre);
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

export function useSystemes() {
  const [systemes, setSystemes] = useState<Systeme[]>([]);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async () => {
    const { data, error } = await supabase
      .from('systemes')
      .select('*, systeme_composants(*)')
      .eq('actif', true)
      .order('nom');
    if (error) {
      // La table peut ne pas exister sur un environnement pas encore migré :
      // le devis doit continuer de fonctionner sans les systèmes.
      console.warn('[systemes]', error.message);
      setSystemes([]);
    } else {
      setSystemes((data || []).map(dbToSysteme));
    }
    setChargement(false);
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  return { systemes, chargement, recharger };
}

/** Systèmes proposés pour un article donné, via son rôle de base. */
export function systemesPour(systemes: Systeme[], produit?: Produit | null) {
  if (!produit) return [];
  return systemes.filter(s =>
    s.composants.some(c => c.produitId === produit.id && c.role === 'base'));
}
