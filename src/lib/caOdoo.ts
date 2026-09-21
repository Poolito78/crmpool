import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── CA Odoo par marque — lecture du jeu publié par le poste du bureau ────────
//
// Le tableau de bord « CA par client » (poolito78.github.io/ca-mouhot) vit hors
// de crmpool : un script local extrait Odoo, calcule, et pousse le résultat dans
// `ca_dashboard_data` à chaque ACTUALISER.bat. Ce module en lit la ligne
// `latest` pour en donner le résumé au tableau de bord du CRM.
//
// ⚠️ ON NE RECALCULE RIEN ICI. Les totaux et la projection par client viennent
// du calcul officiel (pondération saisonnière + taux de croissance mixte, voir
// la note de méthode du tableau de bord CA). Recalculer de notre côté ferait
// diverger deux chiffres censés être le même.
//
// ⚠️ Accès : la policy RLS de `ca_dashboard_data` exige `ca_access = true` dans
// `veille_roles`. Sans ce droit la requête ne renvoie simplement AUCUNE ligne —
// pas d'erreur. C'est le signal qu'on utilise pour masquer la tuile : un compte
// non autorisé ne doit pas même apprendre l'existence des montants.
//
// ⚠️ La ventilation de la PROJECTION par marque reprend, à l'identique, celle du
// tableau de bord CA (`brandFullYearVsProjection`) : la projection d'un client
// est un total, et le reste à courir se répartit entre ses marques au prorata de
// leur reste à courir 2025 (année pleine − à date, jamais négatif). C'est la
// seule façon que la somme des marques retombe exactement sur la projection
// globale. Toute autre clé de répartition ferait un écart qui ne se voit pas.

type CaRow = {
  client: string;
  t26: number; t25ytd: number; t25full: number; proj26: number;
  isosign_sv26?: number; isosign_sv25?: number; isosign_sv25full?: number;
  isomark26?: number; isomark25?: number; isomark25full?: number;
  isofloor26?: number; isofloor25?: number; isofloor25full?: number;
  sti26?: number; sti25?: number; sti25full?: number;
  rte26?: number; rte25?: number; rte25full?: number;
};

/**
 * Réalisé mensuel, tel que la fonction `ca-refresh` le publie.
 *
 * Le CA 2026 vient entièrement d'Odoo : son découpage par mois est exact.
 *
 * ⚠️ Absent des jeux publiés avant l'arrivée de l'actualisation à la demande :
 * toujours prévoir le cas où il n'y a rien à montrer.
 */
export type CaMois = {
  mois: number;
  isomark: number;
  isofloor: number;
  isosign: number;
  sti: number;
  rte: number;
  total: number;
};

/**
 * Un mois 2025 complet. Le STI d'Odoo (faux de près de 700 000 € sur l'année)
 * y est REMPLACÉ par le réel mensuel du rapport commercial, dans ISOSIGN comme
 * dans le total ; `sti_odoo` garde ce qu'Odoo annonçait.
 */
export type CaMois2025 = CaMois & { sti_odoo: number; sti_reel: true };

/**
 * Un mois 2025 vu à même date pour la comparaison du mois en cours. ⚠️ HORS STI : le STI
 * 2025 d'Odoo est faux, la fonction le retire d'ISOSIGN et du total et publie
 * `sti: null`. On compare donc le 2026 hors STI lui aussi.
 */
export type CaMoisN1 = Omit<CaMois, 'sti'> & { sti: null; hors_sti: true };

export type CaCommandeEnCours = {
  commande: string;
  client: string;
  date: string | null;
  pret: number;
  a_livrer: number;
  reste: number;
  statut: 'dans_le_mois' | 'retard' | 'au_dela' | 'sans_date' | 'retard_ancien';
};

/** Estimation de fin de mois (voir `estimerFinDeMois`, fonction `ca-refresh`). */
export type CaEstimationMois =
  | { erreur: string }
  | {
      fin_mois: string;
      pret_a_facturer: CaMois;
      a_livrer_fin_mois: CaMois;
      dont_retard: number;
      estimation: CaMois;
      hors_estimation: { sans_date: number; au_dela_du_mois: number; retard_ancien: number; retard_max_jours: number };
      nb_commandes: number;
      commandes: CaCommandeEnCours[];
    };

/** Mois en cours : réalisé 2026, N-1 à même date (hors STI), estimation de fin de mois. */
export type CaMoisEnCours = {
  mois: number;
  jour: number;
  mtd26: CaMois;
  mtd25: CaMoisN1;
  /** STI réel mensuel depuis l'actualisation qui le publie ; hors STI avant. */
  mois25_complet: CaMoisN1 | CaMois2025;
  estimation: CaEstimationMois;
};

type CaSummary = {
  cutoff_2026?: string;
  generated_at_odoo?: string;
  overall_26?: number;
  overall_25ytd?: number;
  overall_25full?: number;
  overall_projection?: number;
  overall_growth_rate?: number;
  monthly?: CaMois[];
  monthly_2025?: CaMois2025[];
  mois_en_cours?: CaMoisEnCours;
};

type CaPayload = { summary: CaSummary; rows: CaRow[] };

/** Un sous-ensemble DÉJÀ COMPRIS dans sa marque — à afficher, jamais à additionner. */
export type CaSousMarque = { key: string; label: string; ca26: number; ca25: number; projection: number };

/** Une marque telle qu'elle s'affiche : un total, et les « dont » qu'il contient déjà. */
export type CaMarque = {
  key: string;
  label: string;
  ca26: number;
  ca25: number;
  projection: number;
  /** Sous-ensembles DÉJÀ COMPRIS dans les montants ci-dessus — ne jamais les additionner. */
  donts: CaSousMarque[];
};

export type CaOdooData = {
  /** Date d'arrêté du CA 2026 (ISO, ex. 2026-09-20). */
  cutoff: string | null;
  /** Horodatage de l'extraction Odoo. */
  genereLe: string | null;
  /** Date de publication du jeu de données. */
  publieLe: string | null;
  ca26: number;
  ca25ytd: number;
  ca25full: number;
  projection: number;
  tauxCroissance: number;
  nbClients: number;
  marques: CaMarque[];
  /** Réalisé mensuel 2026. Vide tant qu'aucune actualisation n'a eu lieu. */
  mois: CaMois[];
  /** Réalisé mensuel 2025, STI réel. Vide avant l'actualisation qui le publie. */
  mois2025: CaMois2025[];
  /** Mois en cours (comparaison N-1 + estimation). Absent avant la première actualisation qui le produit. */
  moisEnCours: CaMoisEnCours | null;
};

const n = (v: number | undefined | null) => (typeof v === 'number' && isFinite(v) ? v : 0);

/**
 * Ventile la projection de chaque client entre ses marques, au prorata du reste
 * à courir 2025 de chacune. Reprise fidèle de `brandFullYearVsProjection` du
 * tableau de bord CA — les deux doivent rendre les mêmes chiffres.
 */
function ventiler(rows: CaRow[]) {
  const a26 = { isosign_sv: 0, isomark: 0, isofloor: 0, sti: 0, rte: 0 };
  const a25 = { isosign_sv: 0, isomark: 0, isofloor: 0, sti: 0, rte: 0 };
  const proj = { isosign_sv: 0, isomark: 0, isofloor: 0, sti: 0, rte: 0 };

  for (const r of rows) {
    a26.isosign_sv += n(r.isosign_sv26); a25.isosign_sv += n(r.isosign_sv25);
    a26.isomark += n(r.isomark26);       a25.isomark += n(r.isomark25);
    a26.isofloor += n(r.isofloor26);     a25.isofloor += n(r.isofloor25);
    a26.sti += n(r.sti26);               a25.sti += n(r.sti25);
    a26.rte += n(r.rte26);               a25.rte += n(r.rte25);

    // Reste à courir déjà projeté par le calcul officiel, au niveau du client.
    const extra = n(r.proj26) - n(r.t26);
    const reste = {
      isosign_sv: Math.max(n(r.isosign_sv25full) - n(r.isosign_sv25), 0),
      isomark: Math.max(n(r.isomark25full) - n(r.isomark25), 0),
      sti: Math.max(n(r.sti25full) - n(r.sti25), 0),
      rte: Math.max(n(r.rte25full) - n(r.rte25), 0),
    };
    const resteSum = reste.isosign_sv + reste.isomark + reste.sti + reste.rte;

    let exSv = 0, exMark = 0, exSti = 0, exRte = 0;
    if (resteSum > 0 && extra) {
      exSv = extra * (reste.isosign_sv / resteSum);
      exMark = extra * (reste.isomark / resteSum);
      exSti = extra * (reste.sti / resteSum);
      exRte = extra * (reste.rte / resteSum);
    }
    proj.isosign_sv += n(r.isosign_sv26) + exSv;
    proj.isomark += n(r.isomark26) + exMark;
    proj.sti += n(r.sti26) + exSti;
    proj.rte += n(r.rte26) + exRte;

    // ISOFLOOR : sa part du reste ISOMARK, en cascade (il est DANS ISOMARK).
    const resteFloor = Math.max(n(r.isofloor25full) - n(r.isofloor25), 0);
    const exFloor = reste.isomark > 0 ? exMark * (resteFloor / reste.isomark) : 0;
    proj.isofloor += n(r.isofloor26) + exFloor;
  }

  return { a26, a25, proj };
}

function construire(payload: CaPayload): CaOdooData {
  const s = payload.summary || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const { a26, a25, proj } = ventiler(rows);

  // ISOSIGN regroupe la signalisation verticale, le STI et le RTE : c'est le
  // périmètre ISOSIGN au sens commercial. STI et RTE s'affichent chacun en
  // sous-ligne « dont », comme ISOFLOOR sous ISOMARK — ce qui reste après eux
  // est la signalisation verticale elle-même.
  const marques: CaMarque[] = [
    {
      key: 'isomark',
      label: 'ISOMARK',
      ca26: a26.isomark,
      ca25: a25.isomark,
      projection: proj.isomark,
      donts: [
        { key: 'isofloor', label: 'dont ISOFLOOR (résine)', ca26: a26.isofloor, ca25: a25.isofloor, projection: proj.isofloor },
      ],
    },
    {
      key: 'isosign',
      label: 'ISOSIGN',
      ca26: a26.isosign_sv + a26.sti + a26.rte,
      ca25: a25.isosign_sv + a25.sti + a25.rte,
      projection: proj.isosign_sv + proj.sti + proj.rte,
      donts: [
        { key: 'sti', label: 'dont STI (gamme plastique)', ca26: a26.sti, ca25: a25.sti, projection: proj.sti },
        { key: 'rte', label: 'dont RTE', ca26: a26.rte, ca25: a25.rte, projection: proj.rte },
      ],
    },
  ];

  return {
    cutoff: s.cutoff_2026 ?? null,
    genereLe: s.generated_at_odoo ?? null,
    publieLe: null,
    ca26: n(s.overall_26),
    ca25ytd: n(s.overall_25ytd),
    ca25full: n(s.overall_25full),
    projection: n(s.overall_projection),
    tauxCroissance: n(s.overall_growth_rate),
    nbClients: rows.length,
    marques,
    mois: Array.isArray(s.monthly) ? s.monthly : [],
    mois2025: Array.isArray(s.monthly_2025) ? s.monthly_2025 : [],
    moisEnCours: s.mois_en_cours && s.mois_en_cours.mtd26 ? s.mois_en_cours : null,
  };
}

/* Une seule lecture pour tous les consommateurs.
 *
 * Le tableau de bord appelle ce hook deux fois : une fois pour savoir s'il doit
 * proposer l'onglet « CA Odoo », une fois dans le panneau lui-même. Sans cette
 * mémo, la même ligne serait lue deux fois à chaque affichage. La promesse vit
 * le temps de la page : les chiffres ne bougent qu'à une actualisation, qui
 * recharge de toute façon. */
let lecturePartagee: Promise<CaOdooData | null> | null = null;

async function chargerJeu(): Promise<CaOdooData | null> {
  // cast : ca_dashboard_data n'est pas dans les types générés tant que
  // gen-types.ps1 n'a pas été relancé après la migration.
  const { data: ligne, error } = await (supabase as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => {
          maybeSingle: () => Promise<{ data: { payload: CaPayload; updated_at: string } | null; error: unknown }>;
        };
      };
    };
  })
    .from('ca_dashboard_data')
    .select('payload, updated_at')
    .eq('id', 'latest')
    .maybeSingle();

  if (error || !ligne || !ligne.payload) return null;
  const construit = construire(ligne.payload);
  construit.publieLe = ligne.updated_at ?? null;
  return construit;
}

/**
 * Lit le dernier jeu publié. `autorise` est faux tant qu'aucune ligne ne
 * remonte : soit le compte n'a pas le droit « Accès CA », soit rien n'a encore
 * été publié — dans les deux cas il n'y a rien à montrer.
 */
export function useCaOdoo() {
  const [data, setData] = useState<CaOdooData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    if (!lecturePartagee) lecturePartagee = chargerJeu();
    lecturePartagee.then((jeu) => {
      if (annule) return;
      setData(jeu);
      setLoading(false);
    });
    return () => { annule = true; };
  }, []);

  return { data, loading, autorise: !!data };
}

export const CA_ODOO_URL = 'https://poolito78.github.io/ca-mouhot/';
