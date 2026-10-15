/**
 * Un devis FOURNISSEUR rapproché d'Odoo : retrouver l'article, ou le créer.
 *
 * L'analyse de document savait reprendre un devis fournisseur dans MonCRM —
 * fiche fournisseur, prix d'achat, article créé au besoin — mais l'article
 * créé n'existait pas chez Odoo, qui passe les commandes : il fallait le
 * ressaisir, et le devis client suivant partait en négoce.
 *
 * Deux modes, appelés par `src/lib/odooAchat.ts` :
 *
 *   - « chercher » (LECTURE SEULE) : le fournisseur dans le fichier
 *     partenaires, et pour chaque ligne l'article Odoo qui lui correspond.
 *     N'est RETENU d'office que ce qui se lit par un code — la référence
 *     MonCRM / Odoo de l'article, ou le code fournisseur déjà enregistré chez
 *     ce fournisseur. La recherche par mots ne fait que PROPOSER : un article
 *     voisin retenu à tort désignerait un autre produit (règle de la maison :
 *     on ne devine pas à la place de l'utilisateur).
 *
 *   - « creer » (ÉCRITURE, sur clic seulement) : crée les articles demandés,
 *     référence, désignation et catégorie (si elle existe chez Odoo — jamais
 *     créée) — ⚠️ JAMAIS DE PRIX, voir `creerArticles`.
 *     MonCRM inscrit ensuite la référence Odoo sur son propre article.
 *
 * ⚠️ Le champ partenaire de `product.supplierinfo` s'appelle `partner_id`
 * depuis Odoo 16 et `name` avant : il est lu par `fields_get`, une fois par
 * appel — jamais par ligne (voir `odoo-designations`).
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

/** Libellés lus en français : les noms de catégories et d'unités sont traduits. */
const CTX = { lang: "fr_FR" };

const MOTS_VIDES = new Set([
  "les", "des", "une", "pour", "avec", "sans", "dans", "sur", "par", "aux",
  "the", "and", "de", "du", "la", "le", "en", "et", "ou", "a", "au",
]);

/** Les mots qui distinguent un article, les plus longs d'abord. */
function motsSignificatifs(texte: string): string[] {
  const mots = String(texte || "")
    .replace(/[()[\]{},;:/\\"'«»]+/g, " ")
    .split(/\s+/)
    .map((m) => m.trim())
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m.toLowerCase()));
  return [...new Set(mots)].sort((a, b) => b.length - a.length);
}

const cle = (s: unknown) => String(s ?? "").trim().toUpperCase();

interface ArticleOdoo {
  id: number;
  tmplId: number;
  reference: string;
  designation: string;
  cout: number;
  /** Prix déjà enregistré chez CE fournisseur, s'il y en a un. */
  prixFournisseur?: number;
  codeFournisseur?: string;
}

const CHAMPS_PRODUIT = ["default_code", "display_name", "standard_price", "product_tmpl_id"];

function versArticle(p: any): ArticleOdoo {
  return {
    id: p.id,
    tmplId: Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id,
    reference: p.default_code || "",
    designation: String(p.display_name || "").replace(/^\[[^\]]*\]\s*/, ""),
    cout: Number(p.standard_price) || 0,
  };
}

/** `partner_id` (Odoo ≥ 16) ou `name` (avant) sur `product.supplierinfo`. */
async function champPartenaireTarif(od: Odoo): Promise<string> {
  const champs = await od.kw("product.supplierinfo", "fields_get", [], { attributes: ["relation"] }) as
    Record<string, { relation?: string }>;
  if (champs.partner_id?.relation === "res.partner") return "partner_id";
  return "name";
}

interface FournisseurEntree {
  odooId?: number;
  nom?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
}

/**
 * Le fournisseur dans Odoo. Un identifiant fourni fait foi ; sinon le nom,
 * exact d'abord (sans casse), puis contenu — et à plusieurs réponses on ne
 * choisit pas : la liste remonte à l'écran.
 */
async function trouverFournisseur(od: Odoo, f: FournisseurEntree) {
  const champs = ["name", "email", "city", "zip", "is_company", "supplier_rank"];
  if (f.odooId) {
    const [p] = await od.kw("res.partner", "read", [[Number(f.odooId)], champs]) as any[];
    return { partenaire: p ? { id: p.id, nom: p.name } : null, ambigus: [] as { id: number; nom: string; ville: string }[] };
  }
  const nom = String(f.nom || "").trim();
  if (nom.length < 3) return { partenaire: null, ambigus: [] };
  const exacts = await od.kw("res.partner", "search_read",
    [[["name", "=ilike", nom], ["parent_id", "=", false]], champs],
    { limit: 5, order: "supplier_rank desc, id" }) as any[];
  if (exacts.length === 1) return { partenaire: { id: exacts[0].id, nom: exacts[0].name }, ambigus: [] };
  const proches = exacts.length > 1 ? exacts : await od.kw("res.partner", "search_read",
    [[["name", "ilike", nom], ["parent_id", "=", false]], champs],
    { limit: 8, order: "supplier_rank desc, name" }) as any[];
  if (proches.length === 1) return { partenaire: { id: proches[0].id, nom: proches[0].name }, ambigus: [] };
  return {
    partenaire: null,
    ambigus: proches.map((p) => ({ id: p.id, nom: p.name, ville: p.city || "" })),
  };
}

// ----------------------------------------------------------------- chercher

interface LigneCherchee {
  indice: number;
  codeFournisseur?: string;
  designation?: string;
  /** Codes sous lesquels l'article MonCRM est connu (référence Odoo, référence). */
  codes?: string[];
}

async function chercher(od: Odoo, fournisseur: FournisseurEntree, lignes: LigneCherchee[]) {
  const { partenaire, ambigus } = await trouverFournisseur(od, fournisseur);
  const champPart = await champPartenaireTarif(od);

  /* 1. Les codes MonCRM, lus en une requête. `in` est sensible à la casse :
        on envoie le code tel qu'écrit ET en majuscules. */
  const codes = [...new Set(lignes.flatMap((l) => (l.codes || []).map((c) => String(c).trim()).filter(Boolean)))];
  const parCode = new Map<string, ArticleOdoo>();
  if (codes.length) {
    const lus = await od.kw("product.product", "search_read",
      [[["default_code", "in", [...new Set([...codes, ...codes.map(cle)])]]], CHAMPS_PRODUIT],
      { context: CTX }) as any[];
    for (const p of lus) parCode.set(cle(p.default_code), versArticle(p));
  }

  /* 2. Le code fournisseur DÉJÀ enregistré chez ce fournisseur — le seul
        cas où le code du document désigne un article Odoo sans ambiguïté. */
  const parCodeFournisseur = new Map<string, ArticleOdoo>();
  const codesF = [...new Set(lignes.map((l) => String(l.codeFournisseur || "").trim()).filter(Boolean))];
  if (partenaire && codesF.length) {
    const tarifs = await od.kw("product.supplierinfo", "search_read",
      [[[champPart, "=", partenaire.id], ["product_code", "in", [...new Set([...codesF, ...codesF.map(cle)])]]],
       ["product_code", "product_tmpl_id", "product_id", "price"]]) as any[];
    const tmplIds = [...new Set(tarifs.map((t) => t.product_tmpl_id?.[0]).filter(Boolean))];
    if (tmplIds.length) {
      const prods = await od.kw("product.product", "search_read",
        [[["product_tmpl_id", "in", tmplIds]], CHAMPS_PRODUIT], { context: CTX }) as any[];
      for (const t of tarifs) {
        const p = t.product_id
          ? prods.find((x) => x.id === t.product_id[0])
          : prods.find((x) => x.product_tmpl_id?.[0] === t.product_tmpl_id?.[0]);
        if (p) parCodeFournisseur.set(cle(t.product_code), versArticle(p));
      }
    }
  }

  /* 3. Ce qui n'est pas lu par un code se cherche par les mots — en
        PROPOSITION seulement. Les mots les plus longs d'abord, puis on en
        lâche jusqu'à trouver. */
  const parMots = async (texte: string): Promise<ArticleOdoo[]> => {
    const mots = motsSignificatifs(texte).slice(0, 4);
    for (let n = Math.min(3, mots.length); n >= 1; n--) {
      const domaine = mots.slice(0, n).map((m) => ["name", "ilike", m]);
      const lus = await od.kw("product.product", "search_read",
        [[["purchase_ok", "=", true], ...domaine], CHAMPS_PRODUIT],
        { limit: 6, context: CTX }) as any[];
      if (lus.length) return lus.map(versArticle);
    }
    return [];
  };

  const resultat: Record<number, { exact?: ArticleOdoo & { par: string }; propositions: ArticleOdoo[] }> = {};
  await Promise.all(lignes.slice(0, 40).map(async (l) => {
    const parRef = (l.codes || []).map((c) => parCode.get(cle(c))).find(Boolean);
    const parF = l.codeFournisseur ? parCodeFournisseur.get(cle(l.codeFournisseur)) : undefined;
    const exact = parRef ? { ...parRef, par: "référence" }
      : parF ? { ...parF, par: "code fournisseur" }
      : undefined;
    let propositions: ArticleOdoo[] = [];
    if (!exact) {
      try {
        propositions = await parMots(`${l.codeFournisseur || ""} ${l.designation || ""}`);
        if (!propositions.length && l.designation) propositions = await parMots(l.designation);
      } catch (e) {
        console.warn(`[chercher] ligne ${l.indice} :`, (e as Error).message);
      }
    }
    resultat[l.indice] = { exact, propositions };
  }));

  /* Le prix déjà enregistré chez ce fournisseur : c'est lui qu'on remplace. */
  if (partenaire) {
    const tous = Object.values(resultat).flatMap((r) => [r.exact, ...r.propositions]).filter(Boolean) as ArticleOdoo[];
    const tmplIds = [...new Set(tous.map((a) => a.tmplId))];
    if (tmplIds.length) {
      const tarifs = await od.kw("product.supplierinfo", "search_read",
        [[[champPart, "=", partenaire.id], ["product_tmpl_id", "in", tmplIds]],
         ["product_tmpl_id", "price", "product_code", "min_qty"]],
        { order: "min_qty asc" }) as any[];
      for (const a of tous) {
        const t = tarifs.find((x) => x.product_tmpl_id?.[0] === a.tmplId);
        if (t) { a.prixFournisseur = Number(t.price) || 0; a.codeFournisseur = t.product_code || undefined; }
      }
    }
  }

  return { partenaire, ambigus, lignes: resultat };
}

// ----------------------------------------------------------------- creer

interface ArticleACreer {
  indice: number;
  reference: string;
  designation: string;
  /** Catégorie MonCRM, chemin Odoo (« ISOMARK / H2 ») ou dernier segment. */
  categorie?: string;
}

/**
 * La catégorie Odoo d'une catégorie MonCRM — si elle existe, jamais créée.
 * Le chemin complet d'abord, puis le dernier segment s'il est seul de son nom.
 */
async function categorieOdoo(od: Odoo, cache: Map<string, number | null>, categorie?: string) {
  const c = String(categorie || "").trim();
  if (!c) return null;
  if (cache.has(c.toUpperCase())) return cache.get(c.toUpperCase())!;
  let id: number | null = null;
  const [exacte] = await od.kw("product.category", "search_read",
    [[["complete_name", "=ilike", c]], ["id"]], { limit: 1 }) as any[];
  if (exacte) id = exacte.id;
  else {
    const dernier = c.split("/").map((x) => x.trim()).filter(Boolean).pop() || "";
    const parNom = dernier ? await od.kw("product.category", "search_read",
      [[["name", "=ilike", dernier]], ["id"]], { limit: 2 }) as any[] : [];
    if (parNom.length === 1) id = parNom[0].id;
  }
  cache.set(c.toUpperCase(), id);
  return id;
}

/**
 * Crée les articles demandés dans Odoo — RÉFÉRENCE ET DÉSIGNATION SEULEMENT.
 *
 * ⚠️ AUCUN PRIX N'EST ÉCRIT DANS ODOO (règle du 15/10/2026) : ni coût, ni prix
 * de vente, ni prix fournisseur. Les prix d'achat et de vente vivent dans
 * MonCRM, où le changement le plus récent l'emporte (`prix_achat_maj`,
 * `prix_vente_maj`). Un article créé ici porte donc le coût 0 et le prix de
 * vente par défaut d'Odoo, que `odoo-stock-sync` ignore tous deux (coût nul,
 * prix sous le seuil factice) : la synchro de nuit ne peut pas écraser le
 * prix du CRM avec eux.
 *
 * Une référence déjà portée par un article Odoo n'est jamais dédoublée :
 * l'article existant est repris et rendu tel quel.
 */
async function creerArticles(od: Odoo, articles: ArticleACreer[]) {
  /* Article stocké quand la base le permet : `detailed_type` (16), puis
     `is_storable` (17+). Sans l'un ni l'autre, le type par défaut d'Odoo. */
  const champsTmpl = await od.kw("product.template", "fields_get", [], { attributes: ["type", "selection"] }) as
    Record<string, { type?: string; selection?: [string, string][] }>;
  const typeStocke: Record<string, unknown> =
    champsTmpl.detailed_type?.selection?.some(([v]) => v === "product") ? { detailed_type: "product" }
    : champsTmpl.is_storable ? { is_storable: true }
    : {};

  const rapport: {
    indice: number;
    productId?: number;
    reference?: string;
    designation?: string;
    article?: "cree" | "repris";
    /** Faux quand la catégorie demandée n'existe pas chez Odoo. */
    categorieTrouvee?: boolean;
    erreur?: string;
  }[] = [];
  const categories = new Map<string, number | null>();

  for (const l of articles) {
    try {
      const ref = String(l.reference || "").trim();
      if (!ref) throw new Error("référence manquante");
      const [deja] = await od.kw("product.product", "search_read",
        [[["default_code", "=ilike", ref]], CHAMPS_PRODUIT], { limit: 1, context: CTX }) as any[];
      let produit = deja;
      let article: "cree" | "repris" = "repris";
      let categorieTrouvee: boolean | undefined;
      if (!produit) {
        const categId = await categorieOdoo(od, categories, l.categorie);
        if (l.categorie) categorieTrouvee = !!categId;
        const tmplId = await od.kw("product.template", "create", [{
          name: (l.designation || ref).trim(),
          default_code: ref,
          purchase_ok: true,
          sale_ok: true,
          ...typeStocke,
          ...(categId ? { categ_id: categId } : {}),
        }]) as number;
        [produit] = await od.kw("product.product", "search_read",
          [[["product_tmpl_id", "=", tmplId]], CHAMPS_PRODUIT], { limit: 1, context: CTX }) as any[];
        if (!produit) throw new Error("article créé mais sa variante est introuvable");
        article = "cree";
      }
      const a = versArticle(produit);
      rapport.push({ indice: l.indice, productId: a.id, reference: a.reference, designation: a.designation, article, categorieTrouvee });
    } catch (e) {
      rapport.push({ indice: l.indice, erreur: (e as Error).message });
    }
  }
  return { lignes: rapport };
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
    const od = new Odoo();

    if (entree?.mode === "chercher") {
      const fournisseur = (entree?.fournisseur || {}) as FournisseurEntree;
      return json(await chercher(od, fournisseur, (entree?.lignes || []) as LigneCherchee[]));
    }
    if (entree?.mode === "creer") {
      const articles = ((entree?.articles || []) as ArticleACreer[]).filter((a) => String(a?.reference || "").trim());
      if (!articles.length) return json({ erreur: "Aucun article à créer dans Odoo." }, 400);
      return json(await creerArticles(od, articles));
    }
    return json({ erreur: "mode attendu : « chercher » ou « creer »" }, 400);
  } catch (e) {
    console.error("[odoo-achat]", e);
    return json({ erreur: (e as Error).message || String(e) }, 500);
  }
});
