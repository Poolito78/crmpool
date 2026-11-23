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

/**
 * STI 2025 RÉEL du 01/01 au même jour 2025 : les mois complets du rapport
 * commercial (`CA_2025_MENSUEL_REEL`) + le mois en cours au prorata des jours.
 *
 * ⚠️ Ce fut une constante, 749 776 € = STI du 01/01 au 30/09. Passé septembre,
 * le « à date » restait figé au 30/09 alors que l'année pleine, elle, comptait
 * octobre : 126 720 € de STI d'octobre (et la part de novembre) passaient pour
 * un reste à courir. Au 20/11/2026, la projection en était gonflée de ~86 k€
 * et l'évolution annoncée à −0,7 % pour −6,3 % réels. Le « à date » DOIT
 * suivre la date d'arrêté.
 *
 * Le prorata du mois en cours est la seule supposition : le fichier ne donne
 * que des montants mensuels (voir `CA_2025_MENSUEL_REEL`).
 */
function sti2025AuJour(cutoff2025: string): number {
  const mois = Number(cutoff2025.slice(5, 7));
  const jour = Number(cutoff2025.slice(8, 10));
  const joursDuMois = new Date(Date.UTC(2025, mois, 0)).getUTCDate();
  let total = 0;
  for (let m = 1; m < mois; m++) total += CA_2025_MENSUEL_REEL[m - 1].sti;
  total += CA_2025_MENSUEL_REEL[mois - 1].sti * Math.min(jour / joursDuMois, 1);
  return r2(total);
}

/** STI 2025 RÉEL du 01/01 à la fin du mois `mois` (rapport commercial). */
function sti2025FinMois(mois: number): number {
  let total = 0;
  for (let m = 1; m <= mois; m++) total += CA_2025_MENSUEL_REEL[m - 1].sti;
  return r2(total);
}

/**
 * CA 2025 RÉEL, mois par mois (janvier → décembre), portefeuille François
 * MOUHOT. Source : « 12 CA ISOSIGN 2025 y compris STI.xlsx », onglet
 * « CA 2025 - N-1 », ligne « François Mouhot » de chaque mois, bloc « Réel CA
 * 2025 » : SV+Service+Divers, SH, STI. Le total du fichier (ISO + STI) est
 * leur somme. Le STI de janvier → septembre retombe exactement sur les
 * 749 776 € du « à date » d'origine : c'est la même source.
 *
 * ⚠️ C'EST LE FICHIER QUI FAIT FOI pour chaque mois 2025 complet, pas Odoo
 * (dont le STI 2025 est faux). SH = ISOMARK ; ISOSIGN = SV + STI. Le fichier
 * ne détaille ni ISOFLOOR ni RTE : ils sont publiés à `null` (« n.c. »), jamais
 * repris d'Odoo — un « dont » d'une autre source que sa marque ne tomberait pas
 * juste.
 *
 * ⚠️ Montants MENSUELS, sans découpage au jour : le N-1 « à même date » du mois
 * en cours reste donc lu dans Odoo, hors STI — on ne répartit pas un mois sur
 * ses jours.
 */
const CA_2025_MENSUEL_REEL: { sv: number; sh: number; sti: number }[] = [
  { sv: 64032, sh: 23502, sti: 47425 },    // janvier
  { sv: 135878, sh: 31336, sti: 85260 },   // février
  { sv: 174681, sh: 62458, sti: 74497 },   // mars
  { sv: 155740, sh: 79133, sti: 70528 },   // avril
  { sv: 101113, sh: 62736, sti: 95280 },   // mai
  { sv: 118285, sh: 60328, sti: 141620 },  // juin
  { sv: 219757, sh: 162918, sti: 117306 }, // juillet
  { sv: 93968, sh: 24612, sti: 43453 },    // août
  { sv: 172841, sh: 93251, sti: 74407 },   // septembre
  { sv: 150182, sh: 50848, sti: 126720 },  // octobre
  { sv: 89349, sh: 36859, sti: 59960 },    // novembre
  { sv: 139898, sh: 28096, sti: 10192 },   // décembre
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
    // 2025 du 01/01 à la FIN du mois en cours (voir `projeter`).
    t25finmois: 0, sti25finmois: 0,
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
 * Le CA 2026 vient intégralement d'Odoo : son découpage mensuel est exact.
 * Chaque mois 2025 complet vient, lui, du fichier du rapport commercial
 * (`CA_2025_MENSUEL_REEL`, `mois2025Reel`).
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
 * Un mois 2025 complet, tel que le fichier du rapport commercial le donne
 * (voir `CA_2025_MENSUEL_REEL`). ISOFLOOR et RTE n'y sont pas : `null`.
 */
const mois2025Reel = (mois: number) => {
  const r = CA_2025_MENSUEL_REEL[mois - 1] ?? { sv: 0, sh: 0, sti: 0 };
  return {
    mois,
    isomark: r.sh,
    isofloor: null,
    isosign: r.sv + r.sti,
    sti: r.sti,
    rte: null,
    total: r.sv + r.sh + r.sti,
    source: "rapport_commercial",
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
    move_id: [number, string] | false;
  };
  const lignes: Ligne[] = [];
  const LOT = 2000;
  for (let offset = 0; offset < total; offset += LOT) {
    const chunk = await odoo.kw("account.move.line", "search_read", [domain], {
      fields: ["invoice_date", "partner_id", "product_id", "price_subtotal", "move_type", "move_id"],
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
  // Mois en cours, vu en 2025 : du 1er au même jour (mtd25) ; le mois complet
  // vient du rapport commercial (`mois2025Reel`). ⚠️ Le STI 2025 d'Odoo est
  // FAUX (voir en-tête) : ce seau le porte, mais l'écran ne le publie jamais
  // comme un réel — ISOSIGN et le total s'y comparent HORS STI.
  const moisCourant = Number(today.slice(5, 7));
  const debutMois25 = "2025-" + today.slice(5, 7) + "-01";
  const finMois25 = "2025-" + today.slice(5, 7) + "-" +
    String(new Date(Date.UTC(2025, moisCourant, 0)).getUTCDate()).padStart(2, "0");
  const mtd25 = moisVide(moisCourant);
  // Facturé du jour : les mêmes lignes, datées d'aujourd'hui — avoirs déduits.
  const jourFacture = moisVide(moisCourant);
  const facturesJour = new Map<string, { piece: string; client: string; avoir: boolean; montant: number }>();

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

      if (d === cutoff2026) {
        ventilerMois(jourFacture, brand, precision, montant);
        const piece = l.move_id ? l.move_id[1] : "—";
        if (!facturesJour.has(piece)) {
          facturesJour.set(piece, { piece, client, avoir: l.move_type === "out_refund", montant: 0 });
        }
        facturesJour.get(piece)!.montant += montant;
      }
    } else if (annee === "2025") {
      add(row, "t25full", montant);
      add(row, `${brand}25full`, montant);
      if (precision === "isofloor") add(row, "isofloor25full", montant);
      else if (precision === "transport") add(row, "exclu25full", montant);
      if (d >= debutMois25 && d <= cutoff2025) ventilerMois(mtd25, brand, precision, montant);
      if (d <= finMois25) {
        add(row, "t25finmois", montant);
        if (brand === "sti") add(row, "sti25finmois", montant);
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

  return {
    rows, monthly, cutoff2026, cutoff2025, nbLignes: lignes.length,
    mtd25: arrondirMois(mtd25),
    jourFacture: arrondirMois(jourFacture),
    facturesJour: [...facturesJour.values()]
      .map((f) => ({ ...f, montant: r2(f.montant) }))
      .sort((a, b) => b.montant - a.montant),
    odoo, categName, prodCateg,
  };
}

// ───────────────────────────────────────── 1quater. commandes confirmées du jour

/** Date (AAAA-MM-JJ) à Paris d'un datetime Odoo, stocké en UTC (« 2026-10-15 07:12:00 »). */
function dateParis(utc: string): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(utc.replace(" ", "T") + "Z"));
}

function heureParis(utc: string | Date): string {
  const d = typeof utc === "string" ? new Date(utc.replace(" ", "T") + "Z") : utc;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d);
}

/**
 * Commandes de François MOUHOT CONFIRMÉES aujourd'hui (heure de Paris), HT
 * remises déduites, ventilées par marque comme le facturé.
 *
 * ⚠️ « Confirmée aujourd'hui » = `date_order` du jour : Odoo la remplace par
 * l'instant de la confirmation (`action_confirm`). Un devis daté d'hier et
 * confirmé ce matin compte donc bien aujourd'hui. `date_order` est en UTC :
 * on lit depuis la veille et on trie en heure de Paris, sans quoi une commande
 * confirmée entre minuit et 2 h tomberait la veille.
 */
async function commandesDuJour(ctx: CtxOdoo, today: string, journal: string[]) {
  const { odoo, categName, prodCateg } = ctx;
  const veille = new Date(Date.parse(today + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);

  type Cde = { id: number; name: string; partner_id: [number, string] | false; date_order: string; amount_untaxed: number };
  const lues = await odoo.kw("sale.order", "search_read", [[
    ["user_id", "=", SALESPERSON_ID],
    ["state", "in", ["sale", "done"]],
    ["date_order", ">=", `${veille} 00:00:00`],
  ]], { fields: ["id", "name", "partner_id", "date_order", "amount_untaxed"], limit: 500 }) as Cde[];
  const commandes = lues.filter((c) => c.date_order && dateParis(c.date_order) === today);
  journal.push(`${commandes.length} commandes confirmées aujourd'hui`);

  const parMarque = moisVide(Number(today.slice(5, 7)));
  if (commandes.length) {
    type LigneCde = { order_id: [number, string]; product_id: [number, string] | false; price_subtotal: number };
    const lignes = await odoo.kw("sale.order.line", "search_read", [[
      ["order_id", "in", commandes.map((c) => c.id)],
      ["display_type", "=", false],
    ]], { fields: ["order_id", "product_id", "price_subtotal"], limit: 5000 }) as LigneCde[];

    const manquants = [...new Set(lignes.filter((l) => l.product_id).map((l) => (l.product_id as [number, string])[0]))]
      .filter((id) => !prodCateg.has(id));
    if (manquants.length) {
      const prods = await odoo.kw("product.product", "read", [manquants], { fields: ["id", "categ_id"] }) as
        { id: number; categ_id: [number, string] | false }[];
      for (const p of prods) prodCateg.set(p.id, p.categ_id ? p.categ_id[0] : null);
    }
    for (const l of lignes) {
      const cid = l.product_id ? prodCateg.get(l.product_id[0]) ?? null : null;
      const [brand, precision] = categBrand(cid !== null ? categName.get(cid) : null);
      ventilerMois(parMarque, brand, precision, l.price_subtotal || 0);
    }
  }

  return {
    commande: arrondirMois(parMarque),
    commandes: commandes
      .map((c) => ({
        commande: c.name,
        client: c.partner_id ? c.partner_id[1] : "—",
        heure: heureParis(c.date_order),
        montant: r2(c.amount_untaxed || 0),
      }))
      .sort((a, b) => b.montant - a.montant),
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

  // Le client d'une commande, nommé comme sur les lignes de facture : la
  // SOCIÉTÉ (partenaire commercial), pas le contact « SOCIÉTÉ, M. X » que la
  // commande porte souvent. C'est la clé qui relie le carnet à la ligne client
  // de la projection (`projeter`).
  const partenaires = [...new Set(commandes.filter((c) => c.partner_id).map((c) => (c.partner_id as [number, string])[0]))];
  const societeDe = new Map<number, string>();
  for (let i = 0; i < partenaires.length; i += 1000) {
    const lus = await odoo.kw("res.partner", "read", [partenaires.slice(i, i + 1000)], {
      fields: ["id", "commercial_partner_id"],
    }) as { id: number; commercial_partner_id: [number, string] | false }[];
    for (const p of lus) if (p.commercial_partner_id) societeDe.set(p.id, p.commercial_partner_id[1]);
  }
  const societeCde = new Map<number, string>(commandes.map((c) => [
    c.id,
    c.partner_id ? societeDe.get(c.partner_id[0]) ?? c.partner_id[1] : "—",
  ]));
  /** Carnet du mois PAR CLIENT (prêt à facturer + à livrer dans le mois), par marque. */
  const carnetParClient = new Map<string, Row>();
  const carnetDe = (client: string) => {
    if (!carnetParClient.has(client)) carnetParClient.set(client, ligneVide(client));
    return carnetParClient.get(client)!;
  };
  const ajouterCarnet = (oid: number, brand: string, precision: string | null, montant: number) => {
    if (!montant) return;
    const c = carnetDe(societeCde.get(oid) ?? "—");
    add(c, "total", montant);
    add(c, brand, montant);
    if (precision === "isofloor") add(c, "isofloor", montant);
  };

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
      ajouterCarnet(oid, brand, precision, p);

      if (statut === "dans_le_mois" || statut === "retard") {
        ventilerMois(aLivrer, brand, precision, reste);
        det.a_livrer += reste;
        ajouterCarnet(oid, brand, precision, reste);
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

  // Le carnet par client ne se publie pas tel quel (il sert à `projeter`),
  // d'où une propriété à part, retirée avant l'écriture du jeu.
  const publie = {
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
  return { publie, carnetParClient };
}

// ─────────────────────── 1ter. Flooring & Quartz, tous commerciaux confondus

/**
 * Le favori Odoo dont on reprend le périmètre, à l'identique (vue « Analyse
 * des factures », Tableaux de bord). Il réunit la résine FLOORING et les quartz
 * et granits — que le catalogue Odoo range en « ISOMARK / H2 », mêlés aux
 * bandes podotactiles « BAO GRANITE » : aucune règle de catégorie ne les
 * départage proprement.
 */
const FAVORI_FLOORING_QUARTZ = "Analyse des factures Flooring&Quartz";

/**
 * Lit un domaine tel que `ir.filters` le stocke : repr Python (tuples, True,
 * guillemets simples) ou JSON. Tout identifiant calculé (`context_today`,
 * `uid`, `relativedelta`…) arrête la lecture : on ne réinterprète pas un
 * domaine dynamique, on le signale.
 */
function lireDomaine(texte: string): unknown[] {
  const s = texte;
  let i = 0;
  const blanc = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const illisible = () => new Error(`domaine du favori illisible près de « ${s.slice(i, i + 25)} »`);
  const valeur = (): unknown => {
    blanc();
    const c = s[i];
    if (c === "[" || c === "(") {
      const fin = c === "[" ? "]" : ")";
      i++;
      const out: unknown[] = [];
      for (;;) {
        blanc();
        if (s[i] === fin) { i++; return out; }
        out.push(valeur());
        blanc();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === fin) { i++; return out; }
        throw illisible();
      }
    }
    if (c === "'" || c === '"') {
      i++;
      let out = "";
      while (i < s.length && s[i] !== c) {
        if (s[i] === "\\") i++;
        out += s[i++];
      }
      if (i >= s.length) throw illisible();
      i++;
      return out;
    }
    const nb = /^-?\d+(\.\d+)?/.exec(s.slice(i));
    if (nb) { i += nb[0].length; return Number(nb[0]); }
    const id = /^[A-Za-z_][\w.]*/.exec(s.slice(i));
    if (id) {
      i += id[0].length;
      if (id[0] === "True" || id[0] === "true") return true;
      if (id[0] === "False" || id[0] === "false") return false;
      if (id[0] === "None" || id[0] === "null") return null;
      throw new Error(`le favori calcule « ${id[0]} » (date relative, utilisateur…) : domaine non repris`);
    }
    throw illisible();
  };
  const v = valeur();
  blanc();
  if (i < s.length || !Array.isArray(v)) throw illisible();
  return v;
}

/**
 * CA Flooring & Quartz de TOUS les commerciaux, mois par mois, puis ce qui
 * reste une fois la part de François MOUHOT retirée : le CA « hors FM »,
 * c'est-à-dire le national hors IDF Nord.
 *
 * ⚠️ LE PÉRIMÈTRE EST CELUI DU FAVORI ODOO, relu à chaque actualisation dans
 * `ir.filters` — pas une liste de catégories écrite ici. Les quartz et granits
 * sont dans « ISOMARK / H2 » avec les BAO GRANITE : une règle de notre cru
 * tomberait à côté sans que rien ne le montre. Favori introuvable ou domaine
 * dynamique → erreur affichée, aucun chiffre de repli.
 *
 * Même modèle (`account.invoice.report`) et même mesure (« Total HT », avoirs
 * déjà en négatif) que le tableau croisé d'Odoo : les montants doivent y
 * retomber au centime. ISOFLOOR = catégorie « ISOMARK / FLOORING… », le reste
 * du favori est rangé en quartz & granit ; les catégories rencontrées sont
 * publiées pour qu'on puisse le vérifier.
 */
async function extraireFlooringQuartz(ctx: Pick<CtxOdoo, "odoo" | "categName">, today: string, journal: string[]) {
  const { odoo, categName } = ctx;
  const annee = today.slice(0, 4);
  const moisCourant = Number(today.slice(5, 7));

  const favoris = await odoo.kw("ir.filters", "search_read", [[
    ["model_id", "=", "account.invoice.report"],
    ["name", "ilike", "Flooring&Quartz"],
  ]], { fields: ["id", "name", "domain", "user_id"] }) as
    { id: number; name: string; domain: string; user_id: [number, string] | false }[];
  const favori = favoris.find((f) => f.name.trim() === FAVORI_FLOORING_QUARTZ) ?? favoris[0];
  if (!favori) {
    throw new Error(
      `favori « ${FAVORI_FLOORING_QUARTZ} » introuvable dans Odoo (Analyse des factures) — ` +
        "il doit appartenir au compte de l'API ou être partagé.",
    );
  }
  const domaineFavori = lireDomaine(favori.domain || "[]");

  // La mesure « Total HT » du tableau croisé, retrouvée par son libellé.
  const champs = await odoo.kw("account.invoice.report", "fields_get", [], { attributes: ["string", "type"] }) as
    Record<string, { string: string; type: string }>;
  const mesure = Object.entries(champs).find(([, c]) =>
    c.string?.trim().toLowerCase() === "total ht" && (c.type === "monetary" || c.type === "float")
  )?.[0] ?? "price_subtotal";
  if (!(mesure in champs)) throw new Error("mesure « Total HT » introuvable sur l'analyse des factures.");

  // Deux domaines bien formés mis bout à bout se combinent en ET.
  // ⚠️ Factures et avoirs CLIENTS seulement : le favori ne porte pas ce filtre,
  // c'est le menu « Analyse des factures » qui l'impose. Sans lui, les factures
  // FOURNISSEURS des mêmes articles (achats de résine, de quartz) entrent en
  // négatif sous « Sans commercial » — −166 068,75 € constatés le 11/10/2026.
  const domaine = [
    ["move_type", "in", ["out_invoice", "out_refund"]],
    ["invoice_date", ">=", `${annee}-01-01`],
    ["invoice_date", "<=", today],
    ...domaineFavori,
  ];

  type LigneRapport = {
    invoice_date: string | false;
    invoice_user_id: [number, string] | false;
    product_categ_id: [number, string] | false;
  } & Record<string, unknown>;
  const total = await odoo.kw("account.invoice.report", "search_count", [domaine]) as number;
  const lignes: LigneRapport[] = [];
  const LOT = 2000;
  for (let offset = 0; offset < total; offset += LOT) {
    const chunk = await odoo.kw("account.invoice.report", "search_read", [domaine], {
      fields: [mesure, "invoice_date", "invoice_user_id", "product_categ_id"],
      limit: LOT, offset, order: "id asc",
    }) as LigneRapport[];
    lignes.push(...chunk);
  }
  journal.push(`Flooring & Quartz : ${lignes.length} lignes (favori « ${favori.name} », mesure ${mesure})`);

  type MoisFq = { isofloor: number; quartz: number; fm_isofloor: number; fm_quartz: number };
  const parMois: MoisFq[] = Array.from({ length: moisCourant }, () => ({ isofloor: 0, quartz: 0, fm_isofloor: 0, fm_quartz: 0 }));
  const commerciaux = new Map<string, { id: number | null; nom: string; mois: number[] }>();
  const categories = new Map<string, number>();

  for (const l of lignes) {
    if (!l.invoice_date) continue;
    const m = Number(String(l.invoice_date).slice(5, 7));
    if (m < 1 || m > moisCourant) continue;
    const montant = typeof l[mesure] === "number" ? (l[mesure] as number) : 0;
    const cid = l.product_categ_id ? l.product_categ_id[0] : null;
    const nomCateg = (cid !== null ? categName.get(cid) : null) ??
      (l.product_categ_id ? l.product_categ_id[1] : "Sans catégorie");
    const isofloor = nomCateg.toUpperCase().startsWith("ISOMARK / FLOORING");
    const fm = !!l.invoice_user_id && l.invoice_user_id[0] === SALESPERSON_ID;

    const b = parMois[m - 1];
    if (isofloor) { b.isofloor += montant; if (fm) b.fm_isofloor += montant; }
    else { b.quartz += montant; if (fm) b.fm_quartz += montant; }

    const cle = l.invoice_user_id ? String(l.invoice_user_id[0]) : "aucun";
    if (!commerciaux.has(cle)) {
      commerciaux.set(cle, {
        id: l.invoice_user_id ? l.invoice_user_id[0] : null,
        nom: l.invoice_user_id ? l.invoice_user_id[1] : "Sans commercial",
        mois: Array(moisCourant).fill(0),
      });
    }
    commerciaux.get(cle)!.mois[m - 1] += montant;
    categories.set(nomCateg, (categories.get(nomCateg) ?? 0) + montant);
  }

  return {
    annee: Number(annee),
    cutoff: today,
    favori: favori.name,
    favori_proprietaire: favori.user_id ? favori.user_id[1] : null,
    mesure,
    domaine: favori.domain,
    nb_lignes: lignes.length,
    mois: parMois.map((b, i) => {
      const total = b.isofloor + b.quartz;
      const fm = b.fm_isofloor + b.fm_quartz;
      return {
        mois: i + 1,
        isofloor: r2(b.isofloor),
        quartz: r2(b.quartz),
        total: r2(total),
        fm_isofloor: r2(b.fm_isofloor),
        fm_quartz: r2(b.fm_quartz),
        fm: r2(fm),
        hors_fm_isofloor: r2(b.isofloor - b.fm_isofloor),
        hors_fm_quartz: r2(b.quartz - b.fm_quartz),
        hors_fm: r2(total - fm),
      };
    }),
    commerciaux: [...commerciaux.values()]
      .map((c) => ({
        id: c.id, nom: c.nom, fm: c.id === SALESPERSON_ID,
        mois: c.mois.map(r2), total: r2(c.mois.reduce((a, v) => a + v, 0)),
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    categories: [...categories.entries()]
      .map(([nom, total]) => ({ nom, total: r2(total), isofloor: nom.toUpperCase().startsWith("ISOMARK / FLOORING") }))
      .sort((a, b) => b.total - a.total),
  };
}

// ──────────────────────────────────── 2. correction STI 2025 (figée) + totaux

async function appliquerCorrectionSti(rows: Row[], cutoff2025: string, journal: string[]) {
  // Cibles « à date » et « fin du mois en cours », lues dans le rapport
  // commercial à la date d'arrêté — jamais une constante (voir `sti2025AuJour`).
  const stiYtdReel = sti2025AuJour(cutoff2025);
  const stiFinMoisReel = sti2025FinMois(Number(cutoff2025.slice(5, 7)));
  journal.push(`STI 2025 réel : ${stiYtdReel} € au ${cutoff2025}, ${stiFinMoisReel} € à fin de mois`);

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

  // 2. « à date » et « fin du mois en cours » : le réel du rapport commercial
  //    à ces deux dates, réparti au prorata du STI 2025 RÉEL de chaque client.
  //    ⚠️ Pas au prorata de la correction (réel − Odoo) : un client où Odoo
  //    dépasse le réel aurait reçu une part négative, et un « à date » pouvait
  //    dépasser l'année pleine du client. Au prorata du réel, le « à date »
  //    reste toujours sous l'année pleine (la cible l'est au total).
  const poidsTotal = r2([...corrections.values()].reduce((a, b) => a + b, 0));
  const reelDe = (cle: string) => num(parClient.get(cle)!, "sti25full");
  const reelTotal = [...corrections.keys()].reduce((s, cle) => s + reelDe(cle), 0);
  const allouer = (cible: number, champSti: string, champTotal: string, marque?: string) => {
    let alloue = 0, plusGros = "", max = -Infinity;
    for (const cle of corrections.keys()) {
      const r = parClient.get(cle)!;
      const reel = reelDe(cle);
      const alloc = r2(reelTotal ? (reel / reelTotal) * cible : 0);
      const odoo = num(r, champSti);
      r[champSti] = alloc;
      r[champTotal] = r2(num(r, champTotal) - odoo + alloc);
      if (marque) r[marque] = r2(alloc - odoo);
      alloue += alloc;
      if (reel > max) { max = reel; plusGros = cle; }
    }
    // Le reliquat d'arrondi va au plus gros, pour tomber exactement sur la cible.
    const reliquat = r2(cible - alloue);
    if (plusGros && Math.abs(reliquat) >= 0.01) {
      const r = parClient.get(plusGros)!;
      r[champSti] = r2(num(r, champSti) + reliquat);
      r[champTotal] = r2(num(r, champTotal) + reliquat);
    }
    return r2(alloue + reliquat);
  };
  const stiYtdAlloue = allouer(stiYtdReel, "sti25", "t25ytd", "sti25ytd_correction");
  allouer(stiFinMoisReel, "sti25finmois", "t25finmois");
  for (const cle of corrections.keys()) parClient.get(cle)!.sti_ytd_corrected = true;

  return {
    stiYtdOdooTotal,
    stiFullOdooTotal,
    poidsTotal,
    stiFullReelTotal: r2([...stiReel.values()].reduce((a, b) => a + b, 0)),
    corriges,
    crees,
    montantExistants: r2([...corrections.entries()].filter(([c]) => !nouvelles.some((n) => String(n.client).trim().toUpperCase() === c)).reduce((s, [, v]) => s + v, 0)),
    montantNouveaux: r2(nouvelles.reduce((s, n) => s + num(n, "sti25full"), 0)),
    stiYtdAlloue,
    stiYtdReel,
    stiFinMoisReel,
  };
}

// ───────────────────────────────────────────────── 3. projection fin d'année

/** Marques d'une ligne client, dans l'ordre de `brandFullYearVsProjection`. */
const MARQUES_PROJ = ["isosign_sv", "isomark", "sti", "rte"] as const;

/**
 * Projection fin d'année, client par client :
 *
 *   CA 2026 à date
 * + reste du MOIS EN COURS  = p × carnet + (1 − p) × statistique
 * + mois suivants           = CA 2025 après la fin du mois × (1 + taux mixte)
 *
 * - carnet : prêt à facturer + à livrer d'ici la fin du mois (le même que
 *   l'estimation de fin de mois, `estimerFinDeMois`), pour CE client ;
 * - statistique : CA 2025 du client entre la date d'arrêté et la fin du mois,
 *   × (1 + taux mixte) — l'ancienne règle, appliquée au seul reste du mois ;
 * - p = jour / jours du mois. Le carnet ne voit que ce qui est déjà commandé :
 *   le 2 du mois il ne dit presque rien du mois, le 25 il dit presque tout.
 *   Le poids glisse donc de la statistique vers le carnet au fil du mois, et
 *   l'estimation affine la projection à chaque actualisation.
 *
 * Sans estimation lisible (`carnet` nul), p = 0 : on retombe sur la règle
 * statistique seule, sans rien deviner.
 *
 * Chaque ligne reçoit aussi sa projection PAR MARQUE (`proj_<marque>`), dont
 * la somme fait exactement `proj26` : le carnet se ventile par sa propre marque
 * (un client sans reste 2025 n'avait aucune clé de répartition), le reste au
 * prorata du reste à courir 2025 de chaque marque, comme avant.
 */
function projeter(rows: Row[], carnet: Map<string, Row> | null, cutoff2026: string) {
  const overall26 = r2(rows.reduce((s, r) => s + num(r, "t26"), 0));
  const overall25ytd = r2(rows.reduce((s, r) => s + num(r, "t25ytd"), 0));
  const overall25full = r2(rows.reduce((s, r) => s + num(r, "t25full"), 0));

  // Taux global observé à date : il porte la tendance d'ensemble de 2026.
  const tauxGlobal = overall25ytd
    ? Math.round(((overall26 - overall25ytd) / overall25ytd) * 10000) / 10000
    : 0;

  const jour = Number(cutoff2026.slice(8, 10));
  const joursDuMois = new Date(Date.UTC(Number(cutoff2026.slice(0, 4)), Number(cutoff2026.slice(5, 7)), 0)).getUTCDate();
  const poidsCarnet = carnet ? Math.round(Math.min(jour / joursDuMois, 1) * 10000) / 10000 : 0;

  // Carnet d'un client sans facture (aucune ligne) : il entre quand même.
  const parNom = new Map<string, Row>(rows.map((r) => [String(r.client), r]));
  if (carnet) {
    for (const [client] of carnet) {
      if (!parNom.has(client) && client !== "—") {
        const nr = ligneVide(client);
        nr.carnet_sans_historique = true;
        rows.push(nr);
        parNom.set(client, nr);
      }
    }
  }

  const detail = { carnet_mois: 0, carnet_retenu: 0, statistique_mois: 0, statistique_retenue: 0, mois_suivants: 0 };

  for (const r of rows) {
    const t26 = num(r, "t26");
    const t25ytd = num(r, "t25ytd");
    const t25full = num(r, "t25full");
    const t25finmois = Math.max(num(r, "t25finmois"), t25ytd);
    const override = MANUAL_OVERRIDES[String(r.client)];
    const c = carnet?.get(String(r.client)) ?? null;
    const carnetClient = Math.max(c ? num(c, "total") : 0, 0);

    // Reste à courir saisonnier PROPRE au client : la part de son CA 2025
    // réalisée après la date de coupure, coupée en deux à la fin du mois en
    // cours. Jamais négatif.
    const reste25 = Math.max(t25full - t25ytd, 0);
    const reste25Mois = Math.max(Math.min(t25finmois, t25full) - t25ytd, 0);
    const reste25Apres = Math.max(reste25 - reste25Mois, 0);

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

    const statMois = Math.max(reste25Mois * (1 + tauxMixte), 0);
    const apres = Math.max(reste25Apres * (1 + tauxMixte), 0);
    const carnetRetenu = poidsCarnet * carnetClient;
    const statRetenue = (1 - poidsCarnet) * statMois;

    // Part ventilée par la marque du carnet, et part ventilée au prorata du
    // reste à courir 2025 de chaque marque (`statistique`).
    let partCarnet = 0, partStat = 0;
    if (override !== undefined) {
      r.proj26 = r2(t26 * (1 + override));
      partStat = num(r, "proj26") - t26;
      r.proj_override_growth = override;
      r.proj_client_growth = null;
      r.proj_blended_growth = null;
    } else {
      partCarnet = carnetRetenu;
      partStat = statRetenue + apres;
      r.proj26 = r2(t26 + partCarnet + partStat);
      r.proj_override_growth = null;
      r.proj_client_growth = t25ytd > 0 ? Math.round(tauxClient * 10000) / 10000 : null;
      r.proj_blended_growth = Math.round(tauxMixte * 10000) / 10000;
      detail.carnet_mois += carnetClient;
      detail.carnet_retenu += carnetRetenu;
      detail.statistique_mois += statMois;
      detail.statistique_retenue += statRetenue;
      detail.mois_suivants += apres;
    }
    r.proj_carnet_mois = r2(carnetClient);
    r.proj_reste_mois = r2(partCarnet + (override !== undefined ? 0 : statRetenue));
    r.proj_mois_suivants = r2(override !== undefined ? 0 : apres);

    // ── Projection par marque : la somme retombe exactement sur proj26.
    const resteM: Record<string, number> = {};
    for (const m of MARQUES_PROJ) resteM[m] = Math.max(num(r, `${m}25full`) - num(r, `${m}25`), 0);
    let poids = { ...resteM };
    let somme = MARQUES_PROJ.reduce((s, m) => s + poids[m], 0);
    if (!(somme > 0)) {
      // Aucun reste 2025 : la répartition du CA 2026 du client, à défaut la SV.
      poids = Object.fromEntries(MARQUES_PROJ.map((m) => [m, Math.max(num(r, `${m}26`), 0)]));
      somme = MARQUES_PROJ.reduce((s, m) => s + poids[m], 0);
      if (!(somme > 0)) { poids = { isosign_sv: 1, isomark: 0, sti: 0, rte: 0 }; somme = 1; }
    }
    const carnetM = (m: string) => (c && carnetClient > 0 ? (num(c, m) / num(c, "total")) * partCarnet : 0);
    let exMark = 0;
    for (const m of MARQUES_PROJ) {
      const ex = partStat * (poids[m] / somme);
      if (m === "isomark") exMark = ex;
      r[`proj_${m}`] = r2(num(r, `${m}26`) + carnetM(m) + ex);
    }
    // ISOFLOOR : dans ISOMARK — sa part du carnet, puis sa part du reste ISOMARK.
    const resteFloor = Math.max(num(r, "isofloor25full") - num(r, "isofloor25"), 0);
    const exFloor = resteM.isomark > 0 ? exMark * (resteFloor / resteM.isomark) : 0;
    const carnetFloor = c && carnetClient > 0 ? (num(c, "isofloor") / num(c, "total")) * partCarnet : 0;
    r.proj_isofloor = r2(num(r, "isofloor26") + carnetFloor + exFloor);
  }

  const projection = r2(rows.reduce((s, r) => s + num(r, "proj26"), 0));
  const projectionDetail = {
    poids_carnet: poidsCarnet,
    jour,
    jours_du_mois: joursDuMois,
    carnet_mois: r2(detail.carnet_mois),
    carnet_retenu: r2(detail.carnet_retenu),
    statistique_mois: r2(detail.statistique_mois),
    statistique_retenue: r2(detail.statistique_retenue),
    mois_suivants: r2(detail.mois_suivants),
  };
  return { overall26, overall25ytd, overall25full, tauxGlobal, projection, projectionDetail };
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

    const { rows, monthly, cutoff2026, cutoff2025, nbLignes, mtd25, jourFacture, facturesJour, odoo, categName, prodCateg } =
      await extraireOdoo(journal);

    // CA du jour : facturé (déjà lu) + commandes confirmées. Les commandes ne
    // font jamais tomber l'actualisation : en cas d'échec, l'écran le dit.
    let commandesJour: Record<string, unknown>;
    try {
      commandesJour = await commandesDuJour({ odoo, categName, prodCateg }, cutoff2026, journal);
    } catch (e) {
      commandesJour = { erreur: e instanceof Error ? e.message : String(e) };
      journal.push(`Commandes du jour impossibles : ${commandesJour.erreur}`);
    }
    const jour = {
      date: cutoff2026,
      heure: heureParis(new Date()),
      facture: jourFacture,
      factures: facturesJour,
      ...commandesJour,
    };

    // Mois en cours : comparaison N-1 à même date + estimation de fin de mois.
    // L'estimation ne doit JAMAIS faire tomber l'actualisation : en cas
    // d'échec, le reste du jeu est publié et l'écran affiche l'erreur.
    const moisCourant = Number(cutoff2026.slice(5, 7));
    const mtd26 = monthly.find((m) => m.mois === moisCourant) ?? moisVide(moisCourant);
    let estimation: Record<string, unknown>;
    let carnet: Map<string, Row> | null = null;
    try {
      const est = await estimerFinDeMois({ odoo, categName, prodCateg }, cutoff2026, mtd26, journal);
      estimation = est.publie;
      carnet = est.carnetParClient;
    } catch (e) {
      estimation = { erreur: e instanceof Error ? e.message : String(e) };
      journal.push(`Estimation de fin de mois impossible : ${estimation.erreur}`);
    }
    // Flooring & Quartz tous commerciaux : même règle que l'estimation, un
    // échec ne fait jamais tomber l'actualisation — l'écran montre l'erreur.
    let flooringQuartz: Record<string, unknown>;
    try {
      flooringQuartz = await extraireFlooringQuartz({ odoo, categName }, cutoff2026, journal);
    } catch (e) {
      flooringQuartz = { erreur: e instanceof Error ? e.message : String(e) };
      journal.push(`Flooring & Quartz impossible : ${flooringQuartz.erreur}`);
    }
    const moisEnCours = {
      mois: moisCourant,
      jour: Number(cutoff2026.slice(8, 10)),
      mtd26,
      // ⚠️ STI 2025 d'Odoo : faux (voir en-tête), donc JAMAIS publié. À même
      // date, le N-1 part HORS STI (le réel n'existe qu'au mois) : ISOSIGN et
      // total en sont retirés, `sti` vaut null, et l'écran compare le 2026
      // hors STI lui aussi. Le mois complet, lui, vient du rapport commercial.
      mtd25: horsSti(mtd25),
      mois25_complet: mois2025Reel(moisCourant),
      estimation,
    };
    const sti = await appliquerCorrectionSti(rows, cutoff2025, journal);
    const { overall26, overall25ytd, overall25full, tauxGlobal, projection, projectionDetail } =
      projeter(rows, carnet, cutoff2026);
    journal.push(
      `Projection : carnet du mois ${projectionDetail.carnet_mois} € (poids ${projectionDetail.poids_carnet}), ` +
      `mois suivants ${projectionDetail.mois_suivants} €`,
    );

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
      // Décomposition du reste à faire : carnet / statistique du mois en cours,
      // mois suivants (voir `projeter`).
      projection_detail: projectionDetail,
      k_credibilite: K_CREDIBILITE,
      clip_min: CLIP_MIN,
      clip_max: CLIP_MAX,
      brand_totals_26: totauxMarque("26"),
      brand_totals_25: totauxMarque("25"),
      sti25ytd_correction_total: sti.stiYtdAlloue,
      sti25ytd_real_total: sti.stiYtdReel,
      sti25finmois_real_total: sti.stiFinMoisReel,
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
      monthly_2025: Array.from({ length: 12 }, (_, i) => mois2025Reel(i + 1)),
      mois_en_cours: moisEnCours,
      // CA du jour (portefeuille F. MOUHOT) : facturé et commandes confirmées.
      jour,
      // Flooring & Quartz, tous commerciaux, et hors FM (national hors IDF Nord).
      flooring_quartz: flooringQuartz,
      projection_method:
        "Par client : CA 2026 à date + reste du mois en cours + mois suivants. Reste du mois = p × carnet " +
        "(prêt à facturer + à livrer d'ici la fin du mois) + (1 − p) × CA 2025 du client sur les mêmes jours " +
        `× (1 + taux), avec p = jour / jours du mois (${projectionDetail.poids_carnet}). Mois suivants = ` +
        "CA 2025 du client après la fin du mois × (1 + taux de croissance appliqué au reste à courir). " +
        "Ce taux combine (i) l'évolution propre du client à date " +
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
