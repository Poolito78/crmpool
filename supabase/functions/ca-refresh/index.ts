import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ───────────────────────────────────────────────────────────────────────────
// ca-refresh — actualisation à la demande du CA par client (François MOUHOT)
//
// Porte, côté serveur, les trois scripts qui tournaient sur le PC du bureau :
// extraction Odoo, correction STI 2025 figée, projection fin d'année. Le
// résultat est écrit dans `ca_dashboard_data` (ligne `latest`), que lisent le
// tableau de bord en ligne et le bloc CA du CRM.
//
// ⚠️ CETTE FONCTION EST LE SEUL CALCUL. ACTUALISER.bat ne calcule plus : il
// appelle cette fonction et se contente de construire le classeur Excel à
// partir du résultat. Deux implémentations de la même règle finiraient par
// diverger, et un écart entre l'Excel et l'écran ne se voit sur aucun des deux.
//
// ⚠️ Le CA 2026 vient intégralement d'Odoo, en temps réel. Le CA STI 2025 est
// FIGÉ sur `ca_sti_2025_fige` (fichier client + rapport commercial) : Odoo
// sous-estime très fortement le STI sur 2025 — il n'en recense que ~38 600 €
// là où le réel est de 749 776 €. Ne jamais « corriger » ça en refaisant
// confiance à Odoo sur cette période.
//
// Accès : compte authentifié portant `ca_access` dans `veille_roles`, ou la
// clé service_role (appel depuis ACTUALISER.bat).
// ───────────────────────────────────────────────────────────────────────────

const SALESPERSON_ID = 642; // François MOUHOT côté Odoo

/** Réel connu (rapport commercial), STI 2025 du 01/01 au 30/09. */
const STI_YTD_2025_REEL = 749776.0;

/**
 * STI 2025 RÉEL, mois par mois (janvier → décembre), portefeuille François
 * MOUHOT. Source : « 12 CA ISOSIGN 2025 y compris STI.xlsx », onglet
 * « CA 2025 - N-1 », ligne « François Mouhot » de chaque mois, colonne STI du
 * bloc « Réel CA 2025 ». Janvier → septembre retombe exactement sur
 * STI_YTD_2025_REEL (749 776 €) : c'est la même source.
 *
 * ⚠️ Montants MENSUELS, sans découpage au jour : le N-1 « à même date » du mois
 * en cours reste donc hors STI — on ne répartit pas un mois sur ses jours.
 */
const STI_2025_MENSUEL_REEL = [
  47425, 85260, 74497, 70528, 95280, 141620,
  117306, 43453, 74407, 126720, 59960, 10192,
];

/**
 * Seuil de crédibilité (€ de CA 2025 à date) au-delà duquel on fait
 * entièrement confiance à l'évolution propre du client plutôt qu'au taux
 * global. En dessous, lissage progressif vers le taux global : un client avec
 * 50 € de CA 2025 à date ne doit pas dicter +5 000 % sur une seule facture.
 */
const K_CREDIBILITE = 2000.0;

/** Bornes de sécurité sur le taux appliqué au reste à courir d'un client. */
const CLIP_MIN = -0.85;
const CLIP_MAX = 2.0;

/** Clients dont la projection est imposée à la main (taux de croissance). */
const MANUAL_OVERRIDES: Record<string, number> = {
  // Plus d'affaire attendue sur le reste de l'année (confirmé par l'utilisateur).
  "DRS SIGNALISATION": 0.0,
};

/** Deux appels rapprochés ne rejouent pas l'extraction Odoo pour rien. */
const ANTI_REBOND_MS = 30_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─────────────────────────────────────────────────────────── Odoo (JSON-RPC)

class Odoo {
  url: string;
  db: string;
  login: string;
  cle: string;
  uid: number | null = null;

  constructor() {
    this.url = (Deno.env.get("ODOO_URL") || "").replace(/\/+$/, "");
    this.db = Deno.env.get("ODOO_DB") || "";
    this.login = Deno.env.get("ODOO_LOGIN") || "";
    this.cle = Deno.env.get("ODOO_APIKEY") || "";
    if (!this.url || !this.db || !this.login || !this.cle) {
      throw new Error(
        "Accès Odoo non configuré : renseignez ODOO_URL, ODOO_DB, ODOO_LOGIN " +
          "et ODOO_APIKEY dans les secrets des Edge Functions.",
      );
    }
  }

  private async appel(service: string, methode: string, args: unknown[]) {
    const r = await fetch(`${this.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method: methode, args } }),
    });
    const j = await r.json();
    if (j.error) {
      const d = j.error.data || {};
      throw new Error(d.message || j.error.message || "erreur Odoo");
    }
    return j.result;
  }

  async connexion() {
    if (this.uid) return this.uid;
    const uid = await this.appel("common", "login", [this.db, this.login, this.cle]);
    if (!uid) throw new Error("Odoo a refusé l'identification.");
    this.uid = uid as number;
    return this.uid;
  }

  async kw(modele: string, methode: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    await this.connexion();
    return await this.appel("object", "execute_kw", [this.db, this.uid, this.cle, modele, methode, args, kwargs]);
  }
}

// ───────────────────────────────────────────────────────────────── utilitaires

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * Date du jour à Paris. Le runtime tourne en UTC : sans ce décalage, entre
 * minuit et 2 h du matin heure française la coupure reculerait d'un jour et le
 * CA « à date » perdrait une journée.
 */
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Marque d'une ligne, déduite du NOM COMPLET de la catégorie produit — plus
 * fiable ici que le lien parent/enfant, cassé par endroits dans Odoo.
 * La précision est un sous-ensemble DÉJÀ COMPRIS dans sa marque.
 */
function categBrand(completeName: string | null | undefined): [string, string | null] {
  if (!completeName) return ["isosign_sv", null];
  const n = completeName.toUpperCase();
  if (n.startsWith("ISOMARK")) {
    if (n.startsWith("ISOMARK / FLOORING")) return ["isomark", "isofloor"];
    return ["isomark", null];
  }
  if (n.startsWith("PLASTIQUE") || n.startsWith("SEMI-FINIS / STI") || n === "STI") return ["sti", null];
  if (n.startsWith("RTE")) return ["rte", null];
  if (n.startsWith("TRANSPORT") || n.startsWith("ALL / DELIVERIES") || n.includes("TRANSPORT")) {
    return ["isosign_sv", "transport"];
  }
  return ["isosign_sv", null];
}

type Row = Record<string, number | string | boolean | null>;

function ligneVide(client: string): Row {
  return {
    client,
    t26: 0, t25ytd: 0, t25full: 0,
    isosign_sv26: 0, isosign_sv25: 0,
    isomark26: 0, isomark25: 0,
    isofloor26: 0, isofloor25: 0,
    sti26: 0, sti25: 0,
    rte26: 0, rte25: 0,
    exclu26: 0, exclu25: 0,
    isosign_sv25full: 0, isomark25full: 0, isofloor25full: 0,
    sti25full: 0, rte25full: 0, exclu25full: 0,
  };
}

const num = (r: Row, k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
const add = (r: Row, k: string, v: number) => { r[k] = num(r, k) + v; };

/**
 * Réalisé mensuel, par marque d'affichage.
 *
 * Le CA 2026 vient intégralement d'Odoo : son découpage mensuel est exact. Le
 * 2025 aussi, SAUF le STI, faux chez Odoo : chaque mois 2025 publié remplace
 * le STI d'Odoo par le réel du rapport commercial (`STI_2025_MENSUEL_REEL`),
 * dans ISOSIGN comme dans le total (`avecStiReel`).
 */
type Mois = {
  mois: number;
  isomark: number;
  isofloor: number;
  isosign: number;
  sti: number;
  rte: number;
  total: number;
};

const moisVide = (m: number): Mois => ({ mois: m, isomark: 0, isofloor: 0, isosign: 0, sti: 0, rte: 0, total: 0 });

/**
 * Range un montant dans un seau d'affichage. ISOSIGN = signalisation verticale
 * + STI + RTE ; ISOFLOOR, STI et RTE sont des sous-ensembles DÉJÀ COMPRIS dans
 * leur marque — jamais des montants à additionner.
 */
function ventilerMois(mb: Mois, brand: string, precision: string | null, montant: number) {
  mb.total += montant;
  if (brand === "isomark") {
    mb.isomark += montant;
    if (precision === "isofloor") mb.isofloor += montant;
  } else {
    mb.isosign += montant;
    if (brand === "sti") mb.sti += montant;
    else if (brand === "rte") mb.rte += montant;
  }
}

const arrondirMois = (m: Mois): Mois => ({
  mois: m.mois,
  isomark: r2(m.isomark), isofloor: r2(m.isofloor),
  isosign: r2(m.isosign), sti: r2(m.sti), rte: r2(m.rte),
  total: r2(m.total),
});

/** Un mois 2025 sans le STI d'Odoo, qui est faux : retiré d'ISOSIGN et du total. */
const horsSti = (m: Mois) => ({
  ...m,
  isosign: r2(m.isosign - m.sti),
  total: r2(m.total - m.sti),
  sti: null,
  hors_sti: true,
});

/**
 * Un mois 2025 complet, STI d'Odoo remplacé par le réel mensuel du rapport
 * commercial — dans ISOSIGN et dans le total. `sti_odoo` garde la trace de ce
 * qui a été retiré.
 */
const avecStiReel = (m: Mois) => {
  const reel = STI_2025_MENSUEL_REEL[m.mois - 1] ?? 0;
  return {
    ...m,
    isosign: r2(m.isosign - m.sti + reel),
    total: r2(m.total - m.sti + reel),
    sti: reel,
    sti_odoo: m.sti,
    sti_reel: true,
  };
};

// ─────────────────────────────────────────────────────── 1. extraction Odoo

async function extraireOdoo(journal: string[]) {
  const odoo = new Odoo();
  const today = aujourdhuiParis();
  const cutoff2026 = today;
  const cutoff2025 = "2025" + today.slice(4); // même jour/mois, année 2025

  const cats = await odoo.kw("product.category", "search_read", [[]], {
    fields: ["id", "complete_name"],
    limit: 1000,
  }) as { id: number; complete_name: string }[];
  const categName = new Map<number, string>(cats.map((c) => [c.id, c.complete_name]));
  journal.push(`${cats.length} catégories produit`);

  const domain = [
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["move_id.state", "=", "posted"],
    ["move_id.invoice_user_id", "=", SALESPERSON_ID],
    ["invoice_date", ">=", "2025-01-01"],
    ["invoice_date", "<=", cutoff2026],
  ];

  const total = await odoo.kw("account.move.line", "search_count", [domain]) as number;
  journal.push(`${total} lignes de facture/avoir à lire`);

  type Ligne = {
    invoice_date: string;
    partner_id: [number, string] | false;
    product_id: [number, string] | false;
    price_subtotal: number;
    move_type: string;
  };
  const lignes: Ligne[] = [];
  const LOT = 2000;
  for (let offset = 0; offset < total; offset += LOT) {
    const chunk = await odoo.kw("account.move.line", "search_read", [domain], {
      fields: ["invoice_date", "partner_id", "product_id", "price_subtotal", "move_type"],
      limit: LOT,
      offset,
      order: "id asc",
    }) as Ligne[];
    lignes.push(...chunk);
  }

  const prodIds = [...new Set(lignes.filter((l) => l.product_id).map((l) => (l.product_id as [number, string])[0]))];
  const prodCateg = new Map<number, number | null>();
  for (let i = 0; i < prodIds.length; i += LOT) {
    const prods = await odoo.kw("product.product", "read", [prodIds.slice(i, i + LOT)], {
      fields: ["id", "categ_id"],
    }) as { id: number; categ_id: [number, string] | false }[];
    for (const p of prods) prodCateg.set(p.id, p.categ_id ? p.categ_id[0] : null);
  }
  journal.push(`${prodIds.length} produits catégorisés`);

  const clients = new Map<string, Row>();
  // Réalisé mensuel 2026 : un seau par mois, alimenté en même temps que
  // l'agrégation par client — les deux lisent exactement les mêmes lignes.
  const parMois = new Map<number, Mois>();
  const seau = (m: number) => {
    if (!parMois.has(m)) parMois.set(m, moisVide(m));
    return parMois.get(m)!;
  };
  // Réalisé mensuel 2025, les douze mois — son STI est remplacé par le réel
  // du rapport commercial à la publication (`avecStiReel`).
  const parMois25 = new Map<number, Mois>();
  for (let m = 1; m <= 12; m++) parMois25.set(m, moisVide(m));
  // Mois en cours, vu en 2025 : du 1er au même jour (mtd25) et mois complet
  // (plein25). ⚠️ Le STI 2025 d'Odoo est FAUX (voir en-tête) : ces seaux le
  // portent, mais l'écran ne le publie jamais comme un réel — ISOSIGN et le
  // total s'y comparent HORS STI.
  const moisCourant = Number(today.slice(5, 7));
  const debutMois25 = "2025-" + today.slice(5, 7) + "-01";
  const finMois25 = "2025-" + today.slice(5, 7) + "-31";
  const mtd25 = moisVide(moisCourant);
  const plein25 = moisVide(moisCourant);

  for (const l of lignes) {
    if (!l.partner_id) continue;
    const client = l.partner_id[1];
    let montant = l.price_subtotal || 0;
    // Un avoir vient EN DÉDUCTION du CA. L'oublier surestime le chiffre à
    // chaque retour client (écart constaté sur ISOMARK/ISOFLOOR le 17/09/2026).
    if (l.move_type === "out_refund") montant = -montant;

    const d = l.invoice_date;
    const annee = d.slice(0, 4);
    const cid = l.product_id ? prodCateg.get(l.product_id[0]) ?? null : null;
    const [brand, precision] = categBrand(cid !== null ? categName.get(cid) : null);

    if (!clients.has(client)) clients.set(client, ligneVide(client));
    const row = clients.get(client)!;

    if (annee === "2026" && d <= cutoff2026) {
      add(row, "t26", montant);
      add(row, `${brand}26`, montant);
      if (precision === "isofloor") add(row, "isofloor26", montant);
      else if (precision === "transport") add(row, "exclu26", montant);

      // Même ligne, vue par mois. ISOSIGN = signalisation verticale + STI + RTE,
      // conformément à l'affichage ; ISOFLOOR et STI restent des sous-ensembles
      // DÉJÀ COMPRIS dans leur marque, jamais des montants à additionner.
      ventilerMois(seau(Number(d.slice(5, 7))), brand, precision, montant);
    } else if (annee === "2025") {
      add(row, "t25full", montant);
      add(row, `${brand}25full`, montant);
      if (precision === "isofloor") add(row, "isofloor25full", montant);
      else if (precision === "transport") add(row, "exclu25full", montant);
      ventilerMois(parMois25.get(Number(d.slice(5, 7)))!, brand, precision, montant);
      if (d >= debutMois25 && d <= finMois25) {
        ventilerMois(plein25, brand, precision, montant);
        if (d <= cutoff2025) ventilerMois(mtd25, brand, precision, montant);
      }
      if (d <= cutoff2025) {
        add(row, "t25ytd", montant);
        add(row, `${brand}25`, montant);
        if (precision === "isofloor") add(row, "isofloor25", montant);
        else if (precision === "transport") add(row, "exclu25", montant);
      }
    }
  }

  const rows = [...clients.values()].sort((a, b) => String(a.client).localeCompare(String(b.client)));
  for (const r of rows) {
    for (const k of Object.keys(r)) if (typeof r[k] === "number") r[k] = r2(r[k] as number);
  }

  const monthly = [...parMois.values()].sort((a, b) => a.mois - b.mois).map(arrondirMois);
  const monthly25 = [...parMois25.values()].map((m) => avecStiReel(arrondirMois(m)));

  return {
    rows, monthly, monthly25, cutoff2026, cutoff2025, nbLignes: lignes.length,
    mtd25: arrondirMois(mtd25), plein25: arrondirMois(plein25),
    odoo, categName, prodCateg,
  };
}

// ─────────────────────────────── 1bis. estimation de fin du mois en cours

/** Une commande au-delà de ce retard (date prévue dépassée) n'entre plus dans l'estimation. */
const RETARD_MAX_JOURS = 90;

type CtxOdoo = {
  odoo: Odoo;
  categName: Map<number, string>;
  prodCateg: Map<number, number | null>;
};

/**
 * Estimation du CA du mois en cours à la fin du mois :
 *   facturé à date (Odoo, mois en cours)
 * + prêt à facturer  : `untaxed_amount_to_invoice` des lignes de commande
 *                      (livré ou facturable, pas encore facturé)
 * + à livrer d'ici la fin du mois : reste non facturé et non encore facturable
 *                      des commandes dont la date prévue (engagement, à défaut
 *                      date prévue Odoo) tombe au plus tard le dernier jour du mois.
 *
 * ⚠️ On ne devine rien : une commande sans date, prévue après le mois, ou en
 * retard de plus de RETARD_MAX_JOURS jours est montrée À PART et reste HORS de
 * l'estimation. Mieux vaut une estimation prudente et lisible qu'un chiffre
 * gonflé par des commandes qui traînent depuis un an.
 *
 * Les montants sont HT, remises déduites (price_subtotal), commandes de
 * François MOUHOT (user_id) confirmées et pas encore entièrement facturées.
 */
async function estimerFinDeMois(ctx: CtxOdoo, today: string, mtd26: Mois, journal: string[]) {
  const { odoo, categName, prodCateg } = ctx;
  const moisCourant = Number(today.slice(5, 7));
  const annee = Number(today.slice(0, 4));
  const dernierJour = new Date(Date.UTC(annee, moisCourant, 0)).getUTCDate();
  const finMois = `${today.slice(0, 8)}${String(dernierJour).padStart(2, "0")}`;
  const debutMois = `${today.slice(0, 8)}01`;
  const limiteRetard = new Date(Date.parse(today + "T00:00:00Z") - RETARD_MAX_JOURS * 86_400_000)
    .toISOString().slice(0, 10);

  const champs = await odoo.kw("sale.order.line", "fields_get", [], { attributes: ["type"] }) as Record<string, unknown>;
  if (!("untaxed_amount_to_invoice" in champs) || !("untaxed_amount_invoiced" in champs)) {
    throw new Error("Odoo ne publie pas les montants à facturer / facturés des lignes de commande.");
  }

  type Cde = {
    id: number; name: string; partner_id: [number, string] | false;
    commitment_date: string | false; expected_date: string | false; invoice_status: string;
  };
  const commandes = await odoo.kw("sale.order", "search_read", [[
    ["user_id", "=", SALESPERSON_ID],
    ["state", "in", ["sale", "done"]],
    ["invoice_status", "in", ["to invoice", "no"]],
  ]], {
    fields: ["id", "name", "partner_id", "commitment_date", "expected_date", "invoice_status"],
    limit: 5000,
  }) as Cde[];
  journal.push(`${commandes.length} commandes en cours (non entièrement facturées)`);

  const pret = moisVide(moisCourant);
  const aLivrer = moisVide(moisCourant);
  const horsEstimation = { sans_date: 0, au_dela_du_mois: 0, retard_ancien: 0 };
  let dontRetard = 0;

  type Detail = {
    commande: string; client: string; date: string | null;
    pret: number; a_livrer: number; reste: number;
    statut: "dans_le_mois" | "retard" | "au_dela" | "sans_date" | "retard_ancien";
  };
  const details = new Map<number, Detail>();
  const statutDe = new Map<number, Detail["statut"]>();
  for (const c of commandes) {
    const brute = (c.commitment_date || c.expected_date || "") as string;
    const date = brute ? brute.slice(0, 10) : null;
    let statut: Detail["statut"];
    if (!date) statut = "sans_date";
    else if (date > finMois) statut = "au_dela";
    else if (date < limiteRetard) statut = "retard_ancien";
    else if (date < debutMois) statut = "retard";
    else statut = "dans_le_mois";
    statutDe.set(c.id, statut);
    details.set(c.id, {
      commande: c.name, client: c.partner_id ? c.partner_id[1] : "—", date,
      pret: 0, a_livrer: 0, reste: 0, statut,
    });
  }

  if (commandes.length) {
    type LigneCde = {
      order_id: [number, string]; product_id: [number, string] | false;
      price_subtotal: number; untaxed_amount_to_invoice: number; untaxed_amount_invoiced: number;
    };
    const ids = commandes.map((c) => c.id);
    const lignes: LigneCde[] = [];
    const LOT = 2000;
    for (let i = 0; i < ids.length; i += 500) {
      const dom = [["order_id", "in", ids.slice(i, i + 500)], ["display_type", "=", false]];
      for (let offset = 0; ; offset += LOT) {
        const chunk = await odoo.kw("sale.order.line", "search_read", [dom], {
          fields: ["order_id", "product_id", "price_subtotal", "untaxed_amount_to_invoice", "untaxed_amount_invoiced"],
          limit: LOT, offset, order: "id asc",
        }) as LigneCde[];
        lignes.push(...chunk);
        if (chunk.length < LOT) break;
      }
    }

    const manquants = [...new Set(lignes.filter((l) => l.product_id).map((l) => (l.product_id as [number, string])[0]))]
      .filter((id) => !prodCateg.has(id));
    for (let i = 0; i < manquants.length; i += LOT) {
      const prods = await odoo.kw("product.product", "read", [manquants.slice(i, i + LOT)], {
        fields: ["id", "categ_id"],
      }) as { id: number; categ_id: [number, string] | false }[];
      for (const p of prods) prodCateg.set(p.id, p.categ_id ? p.categ_id[0] : null);
    }

    for (const l of lignes) {
      const oid = l.order_id[0];
      const det = details.get(oid);
      const statut = statutDe.get(oid);
      if (!det || !statut) continue;
      const cid = l.product_id ? prodCateg.get(l.product_id[0]) ?? null : null;
      const [brand, precision] = categBrand(cid !== null ? categName.get(cid) : null);

      const p = l.untaxed_amount_to_invoice || 0;
      const reste = Math.max((l.price_subtotal || 0) - (l.untaxed_amount_invoiced || 0) - p, 0);

      // Prêt à facturer : livré (ou facturable à la commande) — il ne dépend
      // plus d'aucune date, sauf pour une commande ancienne qu'on laisse de côté.
      if (statut === "retard_ancien") {
        horsEstimation.retard_ancien += p + reste;
        det.reste += p + reste;
        continue;
      }
      ventilerMois(pret, brand, precision, p);
      det.pret += p;

      if (statut === "dans_le_mois" || statut === "retard") {
        ventilerMois(aLivrer, brand, precision, reste);
        det.a_livrer += reste;
        if (statut === "retard") dontRetard += reste;
      } else {
        if (statut === "sans_date") horsEstimation.sans_date += reste;
        else horsEstimation.au_dela_du_mois += reste;
        det.reste += reste;
      }
    }
  }

  const finDeMois = moisVide(moisCourant);
  for (const k of ["isomark", "isofloor", "isosign", "sti", "rte", "total"] as const) {
    finDeMois[k] = mtd26[k] + pret[k] + aLivrer[k];
  }

  const liste = [...details.values()]
    .filter((d) => Math.abs(d.pret) + d.a_livrer + d.reste >= 0.01)
    .map((d) => ({ ...d, pret: r2(d.pret), a_livrer: r2(d.a_livrer), reste: r2(d.reste) }))
    .sort((a, b) => (b.pret + b.a_livrer) - (a.pret + a.a_livrer) || b.reste - a.reste)
    .slice(0, 60);

  return {
    fin_mois: finMois,
    pret_a_facturer: arrondirMois(pret),
    a_livrer_fin_mois: arrondirMois(aLivrer),
    dont_retard: r2(dontRetard),
    estimation: arrondirMois(finDeMois),
    hors_estimation: {
      sans_date: r2(horsEstimation.sans_date),
      au_dela_du_mois: r2(horsEstimation.au_dela_du_mois),
      retard_ancien: r2(horsEstimation.retard_ancien),
      retard_max_jours: RETARD_MAX_JOURS,
    },
    nb_commandes: commandes.length,
    commandes: liste,
  };
}

// ──────────────────────────────────── 2. correction STI 2025 (figée) + totaux

async function appliquerCorrectionSti(rows: Row[], journal: string[]) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/ca_sti_2025_fige?select=client,montant`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!rep.ok) throw new Error(`Lecture ca_sti_2025_fige impossible (HTTP ${rep.status})`);
  const stiRows = await rep.json() as { client: string; montant: number }[];
  const stiReel = new Map<string, number>();
  for (const s of stiRows) {
    const nom = s.client.trim();
    stiReel.set(nom, (stiReel.get(nom) || 0) + Number(s.montant));
  }
  journal.push(`STI 2025 figé : ${stiReel.size} clients, ${r2([...stiReel.values()].reduce((a, b) => a + b, 0))} €`);

  const parClient = new Map<string, Row>(rows.map((r) => [String(r.client).trim().toUpperCase(), r]));

  const stiYtdOdooTotal = r2(rows.reduce((s, r) => s + num(r, "sti25"), 0));
  const stiFullOdooTotal = r2(rows.reduce((s, r) => s + num(r, "sti25full"), 0));

  // 1. année pleine : le réel REMPLACE Odoo, client par client.
  const corrections = new Map<string, number>();
  const nouvelles: Row[] = [];
  let corriges = 0, crees = 0;

  for (const [nom, reel] of stiReel) {
    const cle = nom.trim().toUpperCase();
    const r = parClient.get(cle);
    if (r) {
      const odooVal = num(r, "sti25full");
      const delta = r2(reel - odooVal);
      r.sti25full = r2(reel);
      r.t25full = r2(num(r, "t25full") - odooVal + reel);
      r.sti25full_correction = delta;
      r.sti_full_year_corrected = true;
      corrections.set(cle, delta);
      corriges++;
    } else {
      // Client STI seul, absent du portefeuille Odoo de François Mouhot.
      const nr = ligneVide(nom);
      nr.t25full = r2(reel);
      nr.sti25full = r2(reel);
      nr.new_client_sti_only = true;
      nr.sti_full_year_corrected = true;
      nr.sti25full_correction = r2(reel);
      nouvelles.push(nr);
      parClient.set(cle, nr);
      corrections.set(cle, r2(reel)); // poids = valeur entière, rien à soustraire
      crees++;
    }
  }
  rows.push(...nouvelles);
  journal.push(`STI année pleine : ${corriges} clients corrigés, ${crees} créés`);

  // 2. « à date » : le réel connu (749 776 €) réparti au prorata du poids de
  //    chaque client dans la correction année pleine.
  const poidsTotal = r2([...corrections.values()].reduce((a, b) => a + b, 0));
  let alloue = 0;
  for (const [cle, poids] of corrections) {
    const r = parClient.get(cle)!;
    const part = poidsTotal ? poids / poidsTotal : 0;
    const alloc = r2(part * STI_YTD_2025_REEL);
    const odooYtd = num(r, "sti25");
    r.sti25 = alloc;
    r.t25ytd = r2(num(r, "t25ytd") - odooYtd + alloc);
    r.sti25ytd_correction = r2(alloc - odooYtd);
    r.sti_ytd_corrected = true;
    alloue += alloc;
  }
  // Le reliquat d'arrondi va au plus gros, pour tomber exactement sur la cible.
  const reliquat = r2(STI_YTD_2025_REEL - alloue);
  if (Math.abs(reliquat) >= 0.01) {
    let plusGros = "", max = -Infinity;
    for (const [cle, poids] of corrections) if (poids > max) { max = poids; plusGros = cle; }
    const r = parClient.get(plusGros)!;
    r.sti25 = r2(num(r, "sti25") + reliquat);
    r.t25ytd = r2(num(r, "t25ytd") + reliquat);
  }

  return {
    stiYtdOdooTotal,
    stiFullOdooTotal,
    poidsTotal,
    stiFullReelTotal: r2([...stiReel.values()].reduce((a, b) => a + b, 0)),
    corriges,
    crees,
    montantExistants: r2([...corrections.entries()].filter(([c]) => !nouvelles.some((n) => String(n.client).trim().toUpperCase() === c)).reduce((s, [, v]) => s + v, 0)),
    montantNouveaux: r2(nouvelles.reduce((s, n) => s + num(n, "sti25full"), 0)),
    stiYtdAlloue: r2(alloue + reliquat),
  };
}

// ───────────────────────────────────────────────── 3. projection fin d'année

function projeter(rows: Row[]) {
  const overall26 = r2(rows.reduce((s, r) => s + num(r, "t26"), 0));
  const overall25ytd = r2(rows.reduce((s, r) => s + num(r, "t25ytd"), 0));
  const overall25full = r2(rows.reduce((s, r) => s + num(r, "t25full"), 0));

  // Taux global observé à date : il porte la tendance d'ensemble de 2026.
  const tauxGlobal = overall25ytd
    ? Math.round(((overall26 - overall25ytd) / overall25ytd) * 10000) / 10000
    : 0;

  for (const r of rows) {
    const t26 = num(r, "t26");
    const t25ytd = num(r, "t25ytd");
    const t25full = num(r, "t25full");
    const override = MANUAL_OVERRIDES[String(r.client)];

    // Reste à courir saisonnier PROPRE au client : la part de son CA 2025
    // réalisée après la date de coupure. Jamais négatif.
    const reste25 = Math.max(t25full - t25ytd, 0);

    let tauxClient: number, credibilite: number;
    if (t25ytd > 0) {
      tauxClient = (t26 - t25ytd) / t25ytd;
      credibilite = Math.min(t25ytd / K_CREDIBILITE, 1.0);
    } else {
      // Pas d'historique 2025 à date exploitable : repli complet sur le global.
      tauxClient = tauxGlobal;
      credibilite = 0;
    }

    let tauxMixte = credibilite * tauxClient + (1 - credibilite) * tauxGlobal;
    tauxMixte = Math.max(CLIP_MIN, Math.min(CLIP_MAX, tauxMixte));

    const resteEstime = Math.max(reste25 * (1 + tauxMixte), 0);

    if (override !== undefined) {
      r.proj26 = r2(t26 * (1 + override));
      r.proj_override_growth = override;
      r.proj_client_growth = null;
      r.proj_blended_growth = null;
    } else {
      r.proj26 = r2(t26 + resteEstime);
      r.proj_override_growth = null;
      r.proj_client_growth = t25ytd > 0 ? Math.round(tauxClient * 10000) / 10000 : null;
      r.proj_blended_growth = Math.round(tauxMixte * 10000) / 10000;
    }
  }

  const projection = r2(rows.reduce((s, r) => s + num(r, "proj26"), 0));
  return { overall26, overall25ytd, overall25full, tauxGlobal, projection };
}

// ─────────────────────────────────────────────────────────────── autorisation

async function autorise(req: Request): Promise<{ ok: boolean; raison?: string }> {
  const auth = req.headers.get("Authorization") || "";
  const jeton = auth.replace(/^Bearer\s+/i, "");
  if (!jeton) return { ok: false, raison: "Authentification requise." };

  // Le JWT est déjà validé par la passerelle (verify_jwt) : on se contente d'en
  // lire les revendications pour savoir QUI appelle.
  let claims: { role?: string; sub?: string };
  try {
    claims = JSON.parse(atob(jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return { ok: false, raison: "Jeton illisible." };
  }

  // Clé service_role : appel depuis ACTUALISER.bat, tous droits.
  if (claims.role === "service_role") return { ok: true };

  if (!claims.sub) return { ok: false, raison: "Jeton sans utilisateur." };
  const rep = await fetch(
    `${SUPABASE_URL}/rest/v1/veille_roles?select=ca_access,crm_active&user_id=eq.${claims.sub}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const lignes = await rep.json() as { ca_access: boolean; crm_active: boolean }[];
  if (!lignes.length || !lignes[0].ca_access || !lignes[0].crm_active) {
    return { ok: false, raison: "Ce compte n'a pas le droit « Accès CA »." };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────── handler

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const droit = await autorise(req);
    if (!droit.ok) return json({ erreur: droit.raison }, 403);

    const depart = Date.now();
    const journal: string[] = [];

    // Anti-rebond : deux clics rapprochés ne rejouent pas l'extraction.
    const actuel = await fetch(
      `${SUPABASE_URL}/rest/v1/ca_dashboard_data?id=eq.latest&select=updated_at`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    ).then((r) => r.json()).catch(() => []) as { updated_at: string }[];
    if (actuel.length) {
      const age = Date.now() - new Date(actuel[0].updated_at).getTime();
      if (age >= 0 && age < ANTI_REBOND_MS) {
        return json({ ignore: true, message: "Données actualisées il y a quelques secondes.", age_ms: age });
      }
    }

    const { rows, monthly, monthly25, cutoff2026, cutoff2025, nbLignes, mtd25, plein25, odoo, categName, prodCateg } =
      await extraireOdoo(journal);

    // Mois en cours : comparaison N-1 à même date + estimation de fin de mois.
    // L'estimation ne doit JAMAIS faire tomber l'actualisation : en cas
    // d'échec, le reste du jeu est publié et l'écran affiche l'erreur.
    const moisCourant = Number(cutoff2026.slice(5, 7));
    const mtd26 = monthly.find((m) => m.mois === moisCourant) ?? moisVide(moisCourant);
    let estimation: Record<string, unknown>;
    try {
      estimation = await estimerFinDeMois({ odoo, categName, prodCateg }, cutoff2026, mtd26, journal);
    } catch (e) {
      estimation = { erreur: e instanceof Error ? e.message : String(e) };
      journal.push(`Estimation de fin de mois impossible : ${estimation.erreur}`);
    }
    const moisEnCours = {
      mois: moisCourant,
      jour: Number(cutoff2026.slice(8, 10)),
      mtd26,
      // ⚠️ STI 2025 d'Odoo : faux (voir en-tête), donc JAMAIS publié. À même
      // date, le N-1 part HORS STI (le réel n'existe qu'au mois) : ISOSIGN et
      // total en sont retirés, `sti` vaut null, et l'écran compare le 2026
      // hors STI lui aussi. Le mois complet, lui, porte le STI réel mensuel.
      mtd25: horsSti(mtd25),
      mois25_complet: avecStiReel(plein25),
      estimation,
    };
    const sti = await appliquerCorrectionSti(rows, journal);
    const { overall26, overall25ytd, overall25full, tauxGlobal, projection } = projeter(rows);

    const marques = ["isosign_sv", "isomark", "sti", "rte"] as const;
    const libelles: Record<string, string> = {
      isosign_sv: "ISOSIGN SV (dont hors marque / transport)",
      isomark: "ISOMARK (dont ISOFLOOR)",
      sti: "STI",
      rte: "RTE",
    };
    const totauxMarque = (suffixe: string) =>
      Object.fromEntries(marques.map((m) => [libelles[m], r2(rows.reduce((s, r) => s + num(r, m + suffixe), 0))]));

    const maintenant = new Date().toISOString();
    const summary = {
      overall_26: overall26,
      overall_25ytd: overall25ytd,
      overall_25full: overall25full,
      overall_growth_rate: tauxGlobal,
      overall_ratio: tauxGlobal,
      fallback_ratio: tauxGlobal,
      overall_projection: projection,
      k_credibilite: K_CREDIBILITE,
      clip_min: CLIP_MIN,
      clip_max: CLIP_MAX,
      brand_totals_26: totauxMarque("26"),
      brand_totals_25: totauxMarque("25"),
      sti25ytd_correction_total: sti.stiYtdAlloue,
      sti25ytd_real_total: STI_YTD_2025_REEL,
      sti25ytd_odoo_total: sti.stiYtdOdooTotal,
      sti25full_correction_total: sti.poidsTotal,
      sti25full_real_total: sti.stiFullReelTotal,
      sti25full_odoo_total: sti.stiFullOdooTotal,
      sti_2025_full_year_correction: {
        clients_corrected: sti.corriges,
        amount_added_existing_clients: sti.montantExistants,
        new_clients_added: sti.crees,
        amount_added_new_clients: sti.montantNouveaux,
        total_amount_integrated: sti.stiFullReelTotal,
      },
      n_clients: rows.length,
      generated_at_odoo: maintenant,
      cutoff_2026: cutoff2026,
      cutoff_2025: cutoff2025,
      // Réalisé mensuel 2026, et 2025 avec le STI réel (voir le type Mois).
      monthly,
      monthly_2025: monthly25,
      mois_en_cours: moisEnCours,
      projection_method:
        "Par client : CA 2026 à date + MAX(CA 2025 année pleine − CA 2025 à date, 0) × (1 + taux de " +
        "croissance appliqué au reste à courir). Ce taux combine (i) l'évolution propre du client à date " +
        "quand son historique 2025 à date est suffisant, et (ii) le taux de croissance global observé " +
        `(${(tauxGlobal * 100).toFixed(2)} %) en repli pour les clients à faible historique — poids ` +
        `proportionnel au CA 2025 à date, jusqu'à ${K_CREDIBILITE} € pour une confiance totale au taux ` +
        "propre du client. Le reste à courir reflète la pondération saisonnière propre à chaque client. " +
        `Taux borné entre ${CLIP_MIN * 100} % et +${CLIP_MAX * 100} %. Override manuel : DRS SIGNALISATION ` +
        "(+0 %, plus d'affaire attendue). CA 2026 en temps réel depuis Odoo ; CA STI 2025 figé sur les " +
        "données réelles (Odoo incorrect sur cette période).",
    };

    const payload = { summary, rows };

    const ecriture = await fetch(`${SUPABASE_URL}/rest/v1/ca_dashboard_data?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ id: "latest", payload, updated_at: maintenant, updated_by: "ca-refresh" }),
    });
    if (!ecriture.ok) {
      throw new Error(`Écriture ca_dashboard_data refusée (HTTP ${ecriture.status}) : ${await ecriture.text()}`);
    }

    return json({
      ok: true,
      duree_ms: Date.now() - depart,
      lignes_odoo: nbLignes,
      journal,
      resume: {
        cutoff_2026: cutoff2026,
        n_clients: rows.length,
        ca_2026_a_date: overall26,
        ca_2025_a_date: overall25ytd,
        ca_2025_annee_pleine: overall25full,
        taux_croissance: tauxGlobal,
        projection_fin_2026: projection,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ erreur: message }, 500);
  }
});
