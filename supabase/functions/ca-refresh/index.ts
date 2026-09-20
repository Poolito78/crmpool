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
 * Réalisé mensuel 2026, par marque d'affichage.
 *
 * ⚠️ 2026 SEULEMENT, et c'est volontaire. Le CA 2026 vient intégralement
 * d'Odoo : son découpage mensuel est donc exact. Le CA STI 2025 est en
 * revanche FIGÉ au niveau de l'année (fichier client + rapport commercial) et
 * ne se décompose pas par mois — en afficher un découpage mensuel reviendrait
 * à publier les chiffres d'Odoo, ceux-là mêmes qu'on corrige parce qu'ils sont
 * faux. On préfère ne rien montrer que montrer un mois inventé.
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
    if (!parMois.has(m)) parMois.set(m, { mois: m, isomark: 0, isofloor: 0, isosign: 0, sti: 0, rte: 0, total: 0 });
    return parMois.get(m)!;
  };

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
      const mb = seau(Number(d.slice(5, 7)));
      mb.total += montant;
      if (brand === "isomark") {
        mb.isomark += montant;
        if (precision === "isofloor") mb.isofloor += montant;
      } else {
        mb.isosign += montant;
        if (brand === "sti") mb.sti += montant;
        else if (brand === "rte") mb.rte += montant;
      }
    } else if (annee === "2025") {
      add(row, "t25full", montant);
      add(row, `${brand}25full`, montant);
      if (precision === "isofloor") add(row, "isofloor25full", montant);
      else if (precision === "transport") add(row, "exclu25full", montant);
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

  const monthly = [...parMois.values()]
    .sort((a, b) => a.mois - b.mois)
    .map((m) => ({
      mois: m.mois,
      isomark: r2(m.isomark), isofloor: r2(m.isofloor),
      isosign: r2(m.isosign), sti: r2(m.sti), rte: r2(m.rte),
      total: r2(m.total),
    }));

  return { rows, monthly, cutoff2026, cutoff2025, nbLignes: lignes.length };
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

    const { rows, monthly, cutoff2026, cutoff2025, nbLignes } = await extraireOdoo(journal);
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
      // Réalisé mensuel 2026 (voir le commentaire du type Mois : 2026 seulement).
      monthly,
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
