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
  };
}

function dbToSysteme(r: any): Systeme {
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
  } = {},
): LigneSysteme[] {
  const { temperatureSupport, poidsParProduit, conditionnelsRetenus } = options;
  if (!(surfaceM2 > 0)) return [];

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

    if (c.consommation != null) {
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

    const poids = poidsParProduit?.(c.produitId);
    return {
      composant: c,
      quantiteKg: Math.round(kg * 1000) / 1000,
      contenants: kg > 0 && poids ? Math.ceil(kg / poids) : undefined,
      explication,
    };
  });
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
