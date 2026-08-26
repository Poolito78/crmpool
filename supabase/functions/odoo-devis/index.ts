/**
 * Création d'un devis dans Odoo, depuis le serveur.
 *
 * Jusqu'ici MonCRM ne savait que PRÉPARER le devis : il le déposait quelque
 * part — serveur local du Chiffrage ou presse-papiers — puis l'utilisateur
 * ouvrait Odoo et cliquait un marque-page qui injectait un pont dans la page
 * pour créer la commande. Trois gestes, un favori à installer, et rien de
 * tout cela ne marche depuis un téléphone.
 *
 * Cette fonction fait le travail elle-même, en XML-RPC, avec le compte Odoo
 * déjà utilisé par `odoo-prix`. Un clic, et la commande existe.
 *
 * Elle ÉCRIT dans Odoo — c'est la seule. `odoo-prix` reste en lecture seule,
 * et cette séparation est délibérée : une erreur ici ne peut pas casser le
 * calcul des prix.
 *
 * Ce qu'elle crée est un BROUILLON, comme le faisait le pont. Rien n'est
 * confirmé, rien n'est envoyé au client, tout se supprime dans Odoo.
 *
 * Trois issues possibles :
 *   - « client-ambigu » : plusieurs sociétés portent ce nom. On ne devine
 *     pas : la liste remonte à l'écran, l'utilisateur tranche, et rappelle
 *     avec `partnerId`.
 *   - « verifie » (dryRun) : tout est résolu, RIEN n'est écrit. C'est le
 *     mode à employer la première fois, ou quand un devis inquiète.
 *   - « cree » : la commande existe, avec son numéro et son lien.
 *
 * Secrets : ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY (les mêmes).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ----------------------------------------------------------------- Odoo

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
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method: methode, args },
      }),
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

  async kw(
    modele: string,
    methode: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ) {
    await this.connexion();
    return await this.appel("object", "execute_kw", [
      this.db, this.uid, this.cle, modele, methode, args, kwargs,
    ]);
  }
}

// ----------------------------------------------------------------- outils

/** Domaine « l'un OU l'autre » au format polonais d'Odoo. */
function ouBien(conds: unknown[][]): unknown[] {
  const d: unknown[] = [];
  for (let i = 0; i < conds.length - 1; i++) d.push("|");
  return d.concat(conds as unknown[]);
}

/** À la lettre près : sans casse, sans accents, sans ponctuation. */
function nu(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev: number[] = [];
  let cur: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function ressemblance(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = Math.max(a.length, b.length);
  return m ? 1 - lev(a, b) / m : 0;
}

// ----------------------------------------------------------------- types

interface Ligne {
  type: "section" | "note" | "product";
  desc: string;
  ref?: string;
  qty?: number;
  pu?: number;
  rem?: number;
  port?: boolean;
}

interface Payload {
  numero: string;
  client: string;
  contact?: string;
  ref?: string;
  validity?: string;
  note?: string;
  company_id: number;
  negoce_code: string;
  negoce_id: number;
  port_id: number;
  lines: Ligne[];
}

// ----------------------------------------------------------------- client

/**
 * La société d'Odoo, ou la liste des prétendantes.
 *
 * Le pont laissait l'utilisateur choisir dans une liste. Ici personne n'est
 * là pour répondre : on ne tranche que lorsqu'une seule société convient, ou
 * que l'une porte EXACTEMENT le nom cherché. Sinon on rend la main.
 */
async function trouverClient(o: Odoo, nom: string, ctx: Record<string, unknown>) {
  const q = String(nom || "").trim();
  if (!q) throw new Error("Aucun nom de client à chercher dans Odoo.");
  const parts = await o.kw(
    "res.partner",
    "search_read",
    [[["name", "ilike", q]], ["id", "name", "city", "is_company", "parent_id"]],
    { limit: 20, order: "is_company desc, name", context: ctx },
  ) as any[];

  if (!parts.length) return { choisi: null, candidats: [] as any[] };

  const societes = parts.filter((p) => p.is_company);
  const exactes = societes.filter((p) => nu(p.name) === nu(q));
  if (exactes.length === 1) return { choisi: exactes[0], candidats: parts };
  if (societes.length === 1) return { choisi: societes[0], candidats: parts };
  return { choisi: null, candidats: parts };
}

// --------------------------------------------------------------- articles

/**
 * Chaque référence du devis vers son article Odoo.
 *
 * Quatre passes, reprises telles quelles du pont qui tourne aujourd'hui :
 * code exact, code à la casse près, code contenu (si unique), puis un
 * rapprochement à la ressemblance pour les codes qui ne diffèrent que par la
 * ponctuation — GRANITEGRIS051 chez nous, GRANITGRIS0,5/1 chez Odoo.
 */
async function resoudreArticles(
  o: Odoo,
  lignes: Ligne[],
  ctx: Record<string, unknown>,
) {
  const refs = [...new Set(lignes.filter((l) => l.ref).map((l) => l.ref as string))];
  const descOf: Record<string, string> = {};
  for (const l of lignes) if (l.ref && !descOf[l.ref]) descOf[l.ref] = l.desc || "";

  const resolus: Record<string, number> = {};
  const comment: Record<string, string> = {};
  if (!refs.length) return { resolus, comment, refs };

  // Passe 1 — code exact
  const p1 = await o.kw(
    "product.product",
    "search_read",
    [[["default_code", "in", refs]], ["id", "default_code"]],
    { limit: 500, context: ctx },
  ) as any[];
  for (const p of p1) {
    resolus[p.default_code] = p.id;
    comment[p.default_code] = "code exact";
  }

  // Passe 2 — casse et espaces
  let reste = refs.filter((r) => !resolus[r]);
  if (reste.length) {
    const p2 = await o.kw(
      "product.product",
      "search_read",
      [ouBien(reste.map((r) => ["default_code", "=ilike", r])), ["id", "default_code"]],
      { limit: 500, context: ctx },
    ) as any[];
    for (const r of reste) {
      const hit = p2.find((p) =>
        String(p.default_code || "").trim().toLowerCase() === r.toLowerCase()
      );
      if (hit) {
        resolus[r] = hit.id;
        comment[r] = "code " + hit.default_code;
      }
    }
  }

  // Passe 3 — code contenu, et seulement si UN SEUL article correspond
  reste = refs.filter((r) => !resolus[r] && r.length >= 5);
  if (reste.length) {
    const p3 = await o.kw(
      "product.product",
      "search_read",
      [ouBien(reste.map((r) => ["default_code", "ilike", r])), ["id", "default_code"]],
      { limit: 500, context: ctx },
    ) as any[];
    for (const r of reste) {
      const hits = p3.filter((p) =>
        String(p.default_code || "").toLowerCase().includes(r.toLowerCase())
      );
      if (hits.length === 1) {
        resolus[r] = hits[0].id;
        comment[r] = "code " + hits[0].default_code;
      }
    }
  }

  // Passe 4 — ressemblance, tranchée seulement si le premier devance nettement
  reste = refs.filter((r) => !resolus[r]);
  if (reste.length) {
    const conds: unknown[][] = [];
    for (const r of reste) {
      const pre = r.replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
      if (pre.length >= 4) conds.push(["default_code", "ilike", pre]);
      const mot = String(descOf[r] || "").split(/[^A-Za-zÀ-ÿ0-9]+/)
        .sort((a, b) => b.length - a.length)[0] || "";
      if (mot.length >= 5) conds.push(["name", "ilike", mot]);
    }
    if (conds.length) {
      const cands = await o.kw(
        "product.product",
        "search_read",
        [ouBien(conds), ["id", "default_code", "name"]],
        { limit: 400, context: ctx },
      ) as any[];
      for (const r of reste) {
        const nr = nu(r);
        const nd = nu(descOf[r] || "");
        const notes = cands.map((p) => ({
          p,
          s: Math.max(
            ressemblance(nr, nu(p.default_code)),
            nd ? ressemblance(nd, nu(p.name)) : 0,
          ),
        })).sort((a, b) => b.s - a.s);
        const premier = notes[0];
        const second = notes[1];
        if (premier && premier.s >= 0.82 && (!second || premier.s - second.s >= 0.04)) {
          resolus[r] = premier.p.id;
          comment[r] = "ressemblance " + premier.p.default_code
            + " (" + Math.round(premier.s * 100) + " %)";
        }
      }
    }
  }

  return { resolus, comment, refs };
}

// ----------------------------------------------------------------- serve

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const entree = await req.json();
    const payload = entree?.payload as Payload;
    const dryRun = !!entree?.dryRun;
    const partnerId = entree?.partnerId ? Number(entree.partnerId) : null;

    if (!payload?.lines?.length) {
      return json({ erreur: "Devis vide : rien à créer dans Odoo." }, 400);
    }

    const o = new Odoo();
    const cid = payload.company_id || null;
    const ctx: Record<string, unknown> = cid ? { allowed_company_ids: [cid] } : {};

    // ---- 1. la société ------------------------------------------------
    let societe: any = null;
    if (partnerId) {
      const lu = await o.kw("res.partner", "read", [[partnerId], ["id", "name", "city"]], {
        context: ctx,
      }) as any[];
      societe = lu[0] || null;
      if (!societe) {
        return json({ erreur: "Le client #" + partnerId + " n'existe pas dans Odoo." }, 404);
      }
    } else {
      const { choisi, candidats } = await trouverClient(o, payload.client, ctx);
      if (!choisi) {
        return json({
          etat: candidats.length ? "client-ambigu" : "client-introuvable",
          cherche: payload.client,
          candidats: candidats.map((p) => ({
            id: p.id,
            nom: p.name,
            ville: p.city || "",
            estSociete: !!p.is_company,
            societeMere: Array.isArray(p.parent_id) ? p.parent_id[1] : "",
          })),
        });
      }
      societe = choisi;
    }

    // ---- 2. les articles ----------------------------------------------
    const { resolus, comment } = await resoudreArticles(o, payload.lines, ctx);

    // Article de repli : la désignation part alors dans le libellé de ligne.
    let negId = payload.negoce_id || 0;
    try {
      const n = await o.kw(
        "product.product",
        "search_read",
        [[["default_code", "=", payload.negoce_code || "NEG.ISO"]], ["id"]],
        { limit: 1, context: ctx },
      ) as any[];
      if (n.length) negId = n[0].id;
    } catch {
      /* on garde l'identifiant de secours */
    }

    const enNegoce = payload.lines
      .filter((l) => l.type === "product" && !l.port && !(l.ref && resolus[l.ref]))
      .map((l) => (l.ref ? l.ref + " — " : "") + l.desc);

    const rapport = {
      client: { id: societe.id, nom: societe.name, ville: societe.city || "" },
      articles: Object.entries(resolus).map(([ref, id]) => ({ ref, id, par: comment[ref] })),
      negoce: enNegoce,
      lignes: payload.lines.length,
    };

    // ---- 3. vérification seule -----------------------------------------
    if (dryRun) return json({ etat: "verifie", rapport });

    // ---- 4. TVA et champs Studio ---------------------------------------
    let tvaId: number | null = null;
    try {
      const domaineTva: unknown[] = [
        ["name", "ilike", "20"],
        ["type_tax_use", "=", "sale"],
        ["active", "=", true],
      ];
      if (cid) domaineTva.push(["company_id", "=", cid]);
      const t = await o.kw("account.tax", "search_read", [domaineTva, ["id", "name"]], {
        limit: 5,
        context: ctx,
      }) as any[];
      tvaId = t.length ? t[0].id : null;
    } catch {
      /* Odoo appliquera la TVA par défaut */
    }

    let champChantier: string | null = null;
    let champContact: string | null = null;
    try {
      const tous = await o.kw("sale.order", "fields_get", [], {
        attributes: ["string", "type"],
        context: ctx,
      }) as Record<string, any>;
      for (const k of Object.keys(tous)) {
        const s = String(tous[k]?.string || "").toLowerCase();
        if (!champChantier && s.includes("chantier")) champChantier = k;
      }
      if (tous.x_studio_contact_de_laffaire) champContact = "x_studio_contact_de_laffaire";
    } catch {
      /* champs optionnels */
    }

    let contactId: number | null = null;
    if (payload.contact && champContact) {
      try {
        const c = await o.kw(
          "res.partner",
          "search_read",
          [[["parent_id", "=", societe.id], ["name", "ilike", payload.contact]], ["id", "name"]],
          { limit: 3, context: ctx },
        ) as any[];
        if (c.length) contactId = c[0].id;
      } catch {
        /* sans contact */
      }
    }

    // ---- 5. l'en-tête ---------------------------------------------------
    const vals: Record<string, unknown> = {
      partner_id: societe.id,
      partner_invoice_id: societe.id,
      partner_shipping_id: societe.id,
    };
    if (cid) vals.company_id = cid;
    if (payload.validity) vals.validity_date = payload.validity;
    if (payload.ref && champChantier) vals[champChantier] = String(payload.ref).slice(0, 200);
    else if (payload.ref) vals.client_order_ref = String(payload.ref).slice(0, 200);
    if (contactId && champContact) vals[champContact] = contactId;

    const orderId = await o.kw("sale.order", "create", [vals], { context: ctx }) as number;

    const erreurs: string[] = [];

    if (payload.note) {
      try {
        await o.kw(
          "sale.order.line",
          "create",
          [{ order_id: orderId, display_type: "line_note", name: payload.note, sequence: 5 }],
          { context: ctx },
        );
      } catch (e) {
        erreurs.push(("Note : " + (e as Error).message).slice(0, 140));
      }
    }

    // ---- 6. les lignes ---------------------------------------------------
    const aRetarifer: { id: number; l: Ligne; garderLibelle: boolean }[] = [];
    let seq = 10;
    let faites = 0;

    for (const l of payload.lines) {
      seq += 10;
      const v: Record<string, unknown> = { order_id: orderId, sequence: seq, customer_lead: 0 };
      if (l.type === "section") {
        v.display_type = "line_section";
        v.name = l.desc;
      } else if (l.type === "note") {
        v.display_type = "line_note";
        v.name = l.desc;
      } else {
        const resolu = !!(l.ref && resolus[l.ref]);
        v.product_id = resolu ? resolus[l.ref as string] : (l.port ? payload.port_id : negId);
        /* LA DÉSIGNATION D'ODOO RESTE CELLE D'ODOO.
         *
         * On envoyait toujours le libellé MonCRM : la commande affichait
         * « FLOWFAST 107 Primer (20 kg) » sur un article Odoo qui s'appelle
         * « FLOWFAST 107 CERAMIC PRIMER (180KG) » — deux articles sur une
         * seule ligne, illisible et faux. Quand l'article est reconnu, on ne
         * dit rien et Odoo écrit sa propre désignation, exactement comme
         * pour une ligne saisie à la main. Le libellé MonCRM ne sert plus
         * qu'aux lignes sans article : négoce et port, où il EST
         * l'information. */
        if (!resolu) v.name = l.desc;
        v.product_uom_qty = l.qty || 1;
        v.price_unit = l.pu || 0;
        v.discount = 0;
        if (tvaId) v.tax_id = [[6, 0, [tvaId]]];
      }
      try {
        const id = await o.kw("sale.order.line", "create", [v], { context: ctx }) as number;
        faites++;
        if (l.type === "product") {
          aRetarifer.push({ id, l, garderLibelle: !(l.ref && resolus[l.ref]) });
        }
      } catch (e) {
        erreurs.push((l.desc + " : " + (e as Error).message).slice(0, 140));
      }
    }

    /* ---- 7. LE PRIX, IMPOSÉ APRÈS COUP ---------------------------------
     *
     * Odoo RECALCULE `price_unit` à la création de la ligne, d'après la
     * liste de prix du client ou le prix de la fiche — qui vaut 0 ou 1 € sur
     * presque tout le catalogue ISOSIGN. La valeur envoyée est écrasée. On
     * réimpose donc les prix nets du devis une fois les lignes créées. C'est
     * ce que fait le pont depuis toujours ; l'oublier mettrait des devis
     * entiers à 1 €. */
    for (const m of aRetarifer) {
      const maj: Record<string, unknown> = { price_unit: m.l.pu || 0, discount: 0 };
      if (m.garderLibelle) maj.name = m.l.desc;
      try {
        await o.kw("sale.order.line", "write", [[m.id], maj], { context: ctx });
      } catch (e) {
        erreurs.push(("P.U. « " + m.l.desc + " » : " + (e as Error).message).slice(0, 120));
      }
    }

    // ---- 8. relecture -----------------------------------------------------
    let numero = "";
    let montantHT = 0;
    try {
      const so = await o.kw("sale.order", "read", [[orderId], ["name", "amount_untaxed"]], {
        context: ctx,
      }) as any[];
      numero = so[0]?.name || "";
      montantHT = so[0]?.amount_untaxed || 0;
    } catch {
      /* la commande existe quand même */
    }

    const base = (Deno.env.get("ODOO_URL") || "").replace(/\/+$/, "");
    const url = base + "/web#cids=" + (cid || 1) + "&menu_id=178&action=302"
      + "&model=sale.order&view_type=form&id=" + orderId;

    return json({
      etat: "cree",
      orderId,
      numero,
      montantHT,
      url,
      lignes: faites,
      erreurs,
      rapport,
    });
  } catch (e) {
    return json({ erreur: (e as Error).message || "Échec inattendu." }, 500);
  }
});
