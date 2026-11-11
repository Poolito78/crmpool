/**
 * odoo-ventes — les lignes de VENTES d'Odoo (factures, commandes), EN LECTURE
 * SEULE, pour l'analyse croisée de MonCRM.
 *
 * Mode « lire » : pour une année et un périmètre (aujourd'hui : « flooring »,
 * les catégories d'articles « ISOMARK / FLOORING… », comme `ca-refresh`), rend
 *   - les lignes de FACTURES et AVOIRS clients comptabilisés
 *     (`account.move.line`, date de facture dans l'année) ;
 *   - les lignes de COMMANDES confirmées (`sale.order.line`, date de commande
 *     dans l'année, heure de Paris) ;
 *   - les partenaires COMMERCIAUX (la société, jamais la personne rattachée)
 *     avec de quoi créer la fiche client dans MonCRM.
 * Tous commerciaux : chaque ligne porte le commercial Odoo du document.
 *
 * ⚠️ **AUCUNE ÉCRITURE DANS ODOO** (règle du 15/10/2026). Et côté MonCRM,
 * ces lignes vont dans `ventes_odoo`, JAMAIS dans `factures_client` : une
 * facture insérée là redevient un brouillon à « émettre », donc une seconde
 * facture légale (voir la migration 20261111150000).
 *
 * ⚠️ Seules les lignes d'ARTICLES des catégories du périmètre sont lues : le
 * port, les autres gammes d'un même document n'y sont pas — c'est le CA
 * Flooring, comme le favori Odoo. Un avoir est rendu en NÉGATIF (montant et
 * quantité) : Odoo y porte des montants positifs.
 *
 * Secrets : ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY (les mêmes).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const CTX = { lang: "fr_FR" };
// deno-lint-ignore no-explicit-any
type Ligne = any;
type M2o = [number, string] | false;
const id2 = (v: M2o) => (Array.isArray(v) ? v[0] : null);
const nom2 = (v: M2o) => (Array.isArray(v) ? v[1] : "");

/** Lecture paginée d'un `search_read` (lots de 2 000). */
async function toutLire(od: Odoo, modele: string, domaine: unknown[], champs: string[]): Promise<Ligne[]> {
  const out: Ligne[] = [];
  const LOT = 2000;
  for (let offset = 0; ; offset += LOT) {
    const lot = await od.kw(modele, "search_read", [domaine], { fields: champs, limit: LOT, offset, order: "id asc", context: CTX }) as Ligne[];
    out.push(...lot);
    if (lot.length < LOT) return out;
  }
}

/** `read` par lots d'identifiants. */
async function lireIds(od: Odoo, modele: string, ids: number[], champs: string[]): Promise<Map<number, Ligne>> {
  const m = new Map<number, Ligne>();
  const uniques = [...new Set(ids.filter((x) => typeof x === "number"))];
  for (let i = 0; i < uniques.length; i += 500) {
    const lot = await od.kw(modele, "read", [uniques.slice(i, i + 500), champs], { context: CTX }) as Ligne[];
    for (const r of lot) m.set(r.id, r);
  }
  return m;
}

/** Date d'un datetime Odoo (UTC) en heure de Paris. */
const jourParis = (dt: string | false) =>
  dt ? new Date(String(dt).replace(" ", "T") + "Z").toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : null;

const STATUT_PAIEMENT: Record<string, string> = {
  not_paid: "Non payée", in_payment: "En paiement", paid: "Payée", partial: "Partiellement payée",
  reversed: "Extournée", invoicing_legacy: "Historique",
};
const STATUT_FACTURATION: Record<string, string> = {
  invoiced: "Facturée", "to invoice": "À facturer", no: "Rien à facturer", upselling: "Opportunité",
};

const PERIMETRES: Record<string, string> = { flooring: "ISOMARK / FLOORING" };

async function lire(od: Odoo, annee: number, perimetre: string) {
  const prefixe = PERIMETRES[perimetre];
  if (!prefixe) throw new Error(`périmètre inconnu : « ${perimetre} »`);
  const journal: string[] = [];

  // 1. Les catégories du périmètre (et leurs sous-catégories).
  const cats = await od.kw("product.category", "search_read",
    [[["complete_name", "ilike", prefixe.split(" / ").pop()!]], ["id", "complete_name"]], { context: CTX }) as Ligne[];
  const categories = cats.filter((c) => String(c.complete_name || "").toUpperCase().startsWith(prefixe));
  if (!categories.length) throw new Error(`aucune catégorie Odoo « ${prefixe}… »`);
  const catIds = categories.map((c) => c.id);
  journal.push(`Catégories : ${categories.map((c) => c.complete_name).join(", ")}`);

  // 2. Lignes de factures. Le marqueur des lignes d'articles dépend de la version d'Odoo.
  const champsAml = await od.kw("account.move.line", "fields_get", [], { attributes: ["type", "selection"] }) as Record<string, Ligne>;
  const filtreArticle = champsAml.display_type?.selection?.some((s: [string, string]) => s[0] === "product")
    ? [["display_type", "=", "product"]]
    : [["exclude_from_invoice_tab", "=", false], ["display_type", "=", false]];
  const lignesFac = await toutLire(od, "account.move.line", [
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["move_id.state", "=", "posted"],
    ["move_id.invoice_date", ">=", `${annee}-01-01`],
    ["move_id.invoice_date", "<=", `${annee}-12-31`],
    ["product_id.categ_id", "in", catIds],
    ...filtreArticle,
  ], ["move_id", "product_id", "name", "quantity", "price_subtotal"]);
  const factures = await lireIds(od, "account.move", lignesFac.map((l) => id2(l.move_id)!),
    ["name", "move_type", "invoice_date", "invoice_user_id", "commercial_partner_id", "ref", "payment_state"]);
  journal.push(`Factures : ${lignesFac.length} lignes, ${factures.size} documents`);

  // 3. Lignes de commandes confirmées.
  const lignesCmd = await toutLire(od, "sale.order.line", [
    ["order_id.state", "in", ["sale", "done"]],
    ["order_id.date_order", ">=", `${annee - 1}-12-31 00:00:00`],
    ["order_id.date_order", "<", `${annee + 1}-01-01 00:00:00`],
    ["product_id.categ_id", "in", catIds],
    ["display_type", "=", false],
  ], ["order_id", "product_id", "name", "product_uom_qty", "price_subtotal"]);
  const commandes = await lireIds(od, "sale.order", lignesCmd.map((l) => id2(l.order_id)!),
    ["name", "date_order", "user_id", "partner_id", "client_order_ref", "invoice_status"]);
  journal.push(`Commandes : ${lignesCmd.length} lignes, ${commandes.size} documents`);

  // 4. Articles : référence, désignation, catégorie.
  const produits = await lireIds(od, "product.product",
    [...lignesFac, ...lignesCmd].map((l) => id2(l.product_id)!), ["default_code", "display_name", "categ_id"]);

  // 5. Partenaires : celui d'une commande peut être une personne → sa société.
  const persCmd = await lireIds(od, "res.partner",
    [...commandes.values()].map((c) => id2(c.partner_id)!), ["commercial_partner_id"]);
  const societeDe = (pid: number | null) => (pid === null ? null : id2(persCmd.get(pid)?.commercial_partner_id) ?? pid);
  const partenairesIds = [
    ...[...factures.values()].map((f) => id2(f.commercial_partner_id)!),
    ...[...commandes.values()].map((c) => societeDe(id2(c.partner_id))!),
  ];
  const partenaires = await lireIds(od, "res.partner", partenairesIds,
    ["name", "is_company", "email", "phone", "mobile", "street", "street2", "zip", "city", "vat"]);

  const article = (l: Ligne) => {
    const p = produits.get(id2(l.product_id)!);
    const designation = String(p?.display_name || nom2(l.product_id) || l.name || "").replace(/^\[[^\]]*\]\s*/, "");
    return { reference: p?.default_code || "", designation, categorie: nom2(p?.categ_id ?? false) };
  };

  const lignes: Ligne[] = [];
  for (const l of lignesFac) {
    const f = factures.get(id2(l.move_id)!);
    if (!f) continue;
    const avoir = f.move_type === "out_refund";
    const s = avoir ? -1 : 1;
    lignes.push({
      source: "facture", odooLigneId: l.id, odooDocumentId: f.id, numero: f.name || "",
      typeDocument: avoir ? "avoir" : "facture", date: f.invoice_date || null,
      statut: STATUT_PAIEMENT[f.payment_state] || f.payment_state || "",
      partenaireId: id2(f.commercial_partner_id), commercial: nom2(f.invoice_user_id),
      ...article(l),
      quantite: s * Math.abs(Number(l.quantity) || 0), totalHT: s * Math.abs(Number(l.price_subtotal) || 0),
      referenceAffaire: f.ref || "",
    });
  }
  for (const l of lignesCmd) {
    const c = commandes.get(id2(l.order_id)!);
    if (!c) continue;
    const date = jourParis(c.date_order);
    if (!date || !date.startsWith(String(annee))) continue;
    lignes.push({
      source: "commande", odooLigneId: l.id, odooDocumentId: c.id, numero: c.name || "",
      typeDocument: "commande", date,
      statut: STATUT_FACTURATION[c.invoice_status] || c.invoice_status || "",
      partenaireId: societeDe(id2(c.partner_id)), commercial: nom2(c.user_id),
      ...article(l),
      quantite: Number(l.product_uom_qty) || 0, totalHT: Number(l.price_subtotal) || 0,
      referenceAffaire: c.client_order_ref || "",
    });
  }

  return {
    annee, perimetre, journal, lignes,
    partenaires: [...partenaires.values()].map((p) => ({
      id: p.id, nom: p.name || "", estSociete: !!p.is_company,
      email: p.email || "", telephone: p.phone || "", mobile: p.mobile || "",
      adresse: [p.street, p.street2].filter(Boolean).join(", "), codePostal: p.zip || "", ville: p.city || "",
      tva: p.vat || "",
    })),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const entree = await req.json();
    if (entree?.mode !== "lire") return json({ erreur: "mode attendu : « lire »" }, 400);
    const annee = Number(entree.annee) || new Date().getFullYear();
    return json(await lire(new Odoo(), annee, String(entree.perimetre || "flooring")));
  } catch (e) {
    console.error("[odoo-ventes]", e);
    return json({ erreur: (e as Error).message || String(e) }, 500);
  }
});
