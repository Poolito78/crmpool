/**
 * Prix réellement pratiqués avec un client, lus dans Odoo.
 *
 * Chez ISOSIGN, le prix de vente porté par la fiche article ne vaut rien : il
 * est à 1 € sur la quasi-totalité du catalogue. Les tarifs vivent dans les
 * listes de prix — une par contrat cadre — et le prix d'une balise J11C2 pour
 * AGILIS (20,93 €) est le tarif public variantes (32,20 €) moins 35 %, soit
 * deux listes chaînées.
 *
 * Cette fonction reprend le calcul écrit dans odoo_devis.py du Chiffrage
 * ISOSIGN : Odoo n'expose aucune méthode utilisable en RPC pour cela — le champ
 * « price » exige un contexte que le serveur refuse, et price_get n'existe plus
 * en version 16.
 *
 * Elle ne fait que LIRE. Aucune écriture dans Odoo.
 *
 * Secrets attendus (Supabase > Edge Functions > Secrets) :
 *   ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY
 *
 * Entrée :
 *   { client: { email?, societe?, nom?, ville? },
 *     lignes: [{ reference, quantite }] }
 * Sortie :
 *   { partenaire, contrat, prix: { REF: { contrat, fiche, cout, quantite } },
 *     introuvables: [REF] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ----------------------------------------------------------------- Odoo

type Domaine = unknown[];

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
    const uid = await this.appel("common", "login", [
      this.db,
      this.login,
      this.cle,
    ]);
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
      this.db,
      this.uid,
      this.cle,
      modele,
      methode,
      args,
      kwargs,
    ]);
  }
}

// --------------------------------------------------------- tarification

interface Article {
  id: number;
  tmpl_id: number | null;
  categ_id: number | null;
  name: string;
  lst_price: number;
  standard_price: number;
}

interface Regle {
  applied_on: string;
  product_id?: [number, string] | false;
  product_tmpl_id?: [number, string] | false;
  categ_id?: [number, string] | false;
  compute_price?: string;
  fixed_price?: number;
  percent_price?: number;
  base?: string;
  base_pricelist_id?: [number, string] | false;
  price_discount?: number;
  price_surcharge?: number;
  price_round?: number;
  price_min_margin?: number;
  price_max_margin?: number;
  min_quantity?: number;
}

const CHAMPS_REGLE = [
  "applied_on", "product_id", "product_tmpl_id", "categ_id",
  "compute_price", "fixed_price", "percent_price", "base",
  "base_pricelist_id", "price_discount", "price_surcharge",
  "price_round", "price_min_margin", "price_max_margin",
  "min_quantity", "date_start", "date_end",
];

class Tarificateur {
  private od: Odoo;
  private regles = new Map<number, Regle[]>();
  private ascendance = new Map<number, number[]>();
  private ids: number[];
  private tmpls: number[];
  private categs: number[] = [];

  constructor(od: Odoo, articles: Article[]) {
    this.od = od;
    this.ids = [...new Set(articles.map((a) => a.id).filter(Boolean))].sort();
    this.tmpls = [...new Set(articles.map((a) => a.tmpl_id).filter(Boolean))]
      .sort() as number[];
  }

  /** À appeler une fois, avant tout calcul : la remontée des catégories est asynchrone. */
  async preparer(articles: Article[]) {
    const vues = new Set<number>();
    for (const a of articles) {
      if (!a.categ_id) continue;
      for (const c of await this.categories(a.categ_id)) vues.add(c);
    }
    this.categs = [...vues].sort();
  }

  /**
   * Une catégorie et toutes ses ascendantes : une règle posée sur une
   * catégorie mère s'applique aux articles de ses sous-catégories.
   */
  private async categories(categ_id: number): Promise<number[]> {
    const connu = this.ascendance.get(categ_id);
    if (connu) return connu;
    const chaine: number[] = [];
    let cur: number | null = categ_id;
    while (cur && chaine.length < 10) {
      chaine.push(cur);
      const res = await this.od.kw("product.category", "read", [[cur], ["parent_id"]]);
      const par = res?.[0]?.parent_id;
      cur = par ? par[0] : null;
    }
    this.ascendance.set(categ_id, chaine);
    return chaine;
  }

  /**
   * Règles d'une liste de prix, filtrées CÔTÉ SERVEUR sur nos seuls articles.
   *
   * « TARIF PUBLIC ISOSIGN VARIANTES » compte plus de 15 000 règles, une par
   * déclinaison. Les charger toutes puis tronquer faisait manquer la bonne
   * règle et le calcul retombait sur le prix de fiche — d'où des balises à
   * 0,65 € au lieu de 20,93 €.
   */
  private async reglesDe(pricelist_id: number): Promise<Regle[]> {
    const connu = this.regles.get(pricelist_id);
    if (connu) return connu;

    const branches: Domaine[] = [["applied_on", "=", "3_global"]];
    if (this.ids.length) branches.push(["product_id", "in", this.ids]);
    if (this.tmpls.length) branches.push(["product_tmpl_id", "in", this.tmpls]);
    if (this.categs.length) branches.push(["categ_id", "in", this.categs]);

    const domaine: Domaine = [["pricelist_id", "=", pricelist_id]];
    for (let i = 0; i < branches.length - 1; i++) domaine.push("|");
    domaine.push(...branches);

    const items = (await this.od.kw(
      "product.pricelist.item",
      "search_read",
      [domaine, CHAMPS_REGLE],
      { limit: 2000 },
    )) as Regle[];
    this.regles.set(pricelist_id, items);
    return items;
  }

  private async applicable(r: Regle, a: Article, qte: number) {
    if ((r.min_quantity || 0) > qte) return false;
    switch (r.applied_on) {
      case "0_product_variant":
        return !!r.product_id && r.product_id[0] === a.id;
      case "1_product":
        return !!r.product_tmpl_id && r.product_tmpl_id[0] === a.tmpl_id;
      case "2_product_category":
        return !!r.categ_id && a.categ_id !== null &&
          (await this.categories(a.categ_id)).includes(r.categ_id[0]);
      default:
        return r.applied_on === "3_global";
    }
  }

  /**
   * Prix unitaire de l'article dans cette liste.
   *
   * La règle la plus SPÉCIFIQUE l'emporte — variante, puis article, puis
   * catégorie, puis règle globale ; à spécificité égale, la quantité minimale
   * la plus élevée gagne.
   */
  async prix(
    pricelist_id: number | null,
    a: Article,
    qte: number,
    profondeur = 0,
  ): Promise<number | null> {
    if (!pricelist_id || profondeur > 5) return null;

    const items = await this.reglesDe(pricelist_id);
    const candidats: Regle[] = [];
    for (const r of items) if (await this.applicable(r, a, qte)) candidats.push(r);
    if (!candidats.length) return a.lst_price || 0;

    candidats.sort((x, y) =>
      x.applied_on === y.applied_on
        ? (y.min_quantity || 0) - (x.min_quantity || 0)
        : x.applied_on < y.applied_on ? -1 : 1
    );
    const r = candidats[0];

    if (r.compute_price === "fixed") return r.fixed_price || 0;

    let base: number;
    if (r.base === "standard_price") {
      base = a.standard_price || 0;
    } else if (r.base === "pricelist" && r.base_pricelist_id) {
      const v = await this.prix(r.base_pricelist_id[0], a, qte, profondeur + 1);
      base = v === null ? (a.lst_price || 0) : v;
    } else {
      base = a.lst_price || 0;
    }

    if (r.compute_price === "percentage") {
      return base * (1 - (r.percent_price || 0) / 100);
    }

    // formule : remise, arrondi, majoration, puis bornes de marge
    let prix = base * (1 - (r.price_discount || 0) / 100);
    const arrondi = r.price_round || 0;
    if (arrondi) prix = Math.round(prix / arrondi) * arrondi;
    prix += r.price_surcharge || 0;

    const mini = r.price_min_margin || 0;
    const maxi = r.price_max_margin || 0;
    if (mini && prix < base + mini) prix = base + mini;
    if (maxi && prix > base + maxi) prix = base + maxi;
    return Math.max(prix, 0);
  }
}

// ------------------------------------------------------- identification

/**
 * Retrouve le client dans Odoo. Trois passes, de la plus sûre à la plus floue :
 * l'adresse électronique désigne une agence précise, la raison sociale peut
 * en désigner plusieurs — auquel cas la ville départage.
 */
async function trouverPartenaire(
  od: Odoo,
  c: { email?: string; societe?: string; nom?: string; ville?: string },
) {
  const champs = ["name", "email", "city", "property_product_pricelist", "parent_id"];
  const lire = async (domaine: Domaine, limite = 8) =>
    (await od.kw("res.partner", "search_read", [domaine, champs], {
      limit: limite,
    })) as any[];

  /** Départage plusieurs fiches par la ville, sinon rend la première. */
  const departager = (r: any[]) => {
    if (r.length <= 1) return r[0];
    if (c.ville) {
      const v = c.ville.toLowerCase().replace(/-/g, " ");
      const trouve = r.find((p) =>
        (p.city || "").toLowerCase().replace(/-/g, " ").includes(v)
      );
      if (trouve) return trouve;
    }
    return r[0];
  };

  if (c.email) {
    // Une même adresse peut figurer sur plusieurs agences d'un groupe :
    // gbrugel@agilis.net existe sur trois fiches AGILIS. Prendre la première
    // venue rattachait le devis à la mauvaise agence.
    const r = await lire([["email", "=ilike", c.email]]);
    if (r.length) return departager(r);
    const domaine = c.email.split("@")[1];
    if (domaine) {
      const parDomaine = await lire([
        ["email", "=ilike", `%@${domaine}`],
        ["is_company", "=", true],
      ]);
      if (parDomaine.length === 1) return parDomaine[0];
      // plusieurs sociétés sur le même domaine : seule la ville tranche
      if (parDomaine.length > 1 && c.ville) {
        const v = departager(parDomaine);
        if (v) return v;
      }
    }
  }

  for (const nom of [c.societe, c.nom]) {
    if (!nom) continue;
    const r = await lire([["name", "ilike", nom]]);
    if (r.length === 1) return r[0];
    if (r.length > 1) {
      if (c.ville) {
        const v = r.find((p) =>
          (p.city || "").toLowerCase().includes(c.ville!.toLowerCase())
        );
        if (v) return v;
      }
      // plusieurs agences et rien pour départager : on n'invente pas de tarif
      return null;
    }
  }
  return null;
}

// ------------------------------------------------------------- fonction

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const repondre = (corps: unknown, code = 200) =>
    new Response(JSON.stringify(corps), {
      status: code,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { client, lignes } = await req.json();
    const demandees = (lignes || []).filter((l: any) => l?.reference);
    if (!client || !demandees.length) {
      return repondre({ prix: {}, contrat: null, partenaire: null });
    }

    const od = new Odoo();
    const partenaire = await trouverPartenaire(od, client);
    if (!partenaire) {
      return repondre({
        prix: {},
        contrat: null,
        partenaire: null,
        message: "Client introuvable dans Odoo : aucun contrat cadre applicable.",
      });
    }

    /* Le tarif se négocie avec la SOCIÉTÉ, pas avec la personne. Trouver
       « Guillaume Brugel » ne dit rien de l'accord commercial : c'est
       « AGILIS » qui porte le contrat cadre. On remonte donc au parent, et
       c'est son nom qu'on affiche à côté du contrat. */
    let porteur = partenaire;
    if (partenaire.parent_id) {
      const [mere] = (await od.kw(
        "res.partner", "read",
        [[partenaire.parent_id[0]], ["name", "property_product_pricelist", "parent_id"]],
      )) as any[];
      // La liste de prix du contact prime si elle lui est propre ; sinon
      // celle de la société s'applique.
      if (mere && (!partenaire.property_product_pricelist || mere.property_product_pricelist)) {
        porteur = { ...mere, id: partenaire.parent_id[0] };
      }
    }

    const pl = partenaire.property_product_pricelist
      || porteur.property_product_pricelist;
    const contratId: number | null = pl ? pl[0] : null;
    const contrat: string | null = pl ? pl[1] : null;
    const societe: string = (partenaire.parent_id ? partenaire.parent_id[1] : partenaire.name) || '';

    // La quantité compte : les listes comportent des paliers dégressifs.
    const quantites = new Map<string, number>();
    for (const l of demandees) {
      const q = Number(l.quantite) || 1;
      quantites.set(l.reference, Math.max(quantites.get(l.reference) || 0, q));
    }
    const references = [...quantites.keys()];

    const bruts = (await od.kw(
      "product.product",
      "search_read",
      [
        [["default_code", "in", references]],
        ["id", "default_code", "name", "lst_price", "standard_price",
          "categ_id", "product_tmpl_id"],
      ],
      { limit: references.length + 50 },
    )) as any[];

    const parReference = new Map<string, Article>();
    for (const r of bruts) {
      parReference.set(r.default_code, {
        id: r.id,
        tmpl_id: r.product_tmpl_id ? r.product_tmpl_id[0] : null,
        categ_id: r.categ_id ? r.categ_id[0] : null,
        name: r.name,
        lst_price: r.lst_price || 0,
        standard_price: r.standard_price || 0,
      });
    }

    const articles = [...parReference.values()];
    const tarif = new Tarificateur(od, articles);
    await tarif.preparer(articles);

    const prix: Record<string, unknown> = {};
    for (const [ref, a] of parReference) {
      const qte = quantites.get(ref) || 1;
      let contratPrix: number | null = null;
      try {
        const v = await tarif.prix(contratId, a, qte);
        if (v !== null) contratPrix = Math.round(v * 100) / 100;
      } catch {
        // article hors barème : on n'invente pas de prix
      }
      prix[ref] = {
        designation: a.name,
        contrat: contratPrix,
        fiche: a.lst_price,
        cout: a.standard_price,
        quantite: qte,
      };
    }

    return repondre({
      partenaire: partenaire.name,
      partenaireId: partenaire.id,
      /** Société qui porte le contrat cadre — souvent le parent du contact. */
      societe,
      contrat,
      contratId,
      prix,
      introuvables: references.filter((r) => !parReference.has(r)),
    });
  } catch (e) {
    return repondre({ error: (e as Error).message }, 200);
  }
});
