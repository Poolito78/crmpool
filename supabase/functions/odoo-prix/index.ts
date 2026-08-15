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
 * Elle sait aussi CHERCHER dans le catalogue d'Odoo. MonCRM n'interrogeait que
 * sa copie locale, incomplète — le support acier galva Ø60 en 3500, facturé
 * 39,852 €, n'y figure pas — et à moitié non tarifée : 7 670 articles
 * vendables sur 22 635 y portent un prix inférieur à 2 €, recopié d'une fiche
 * Odoo qui n'est pas le prix de vente. Chercher chez Odoo lève les deux
 * obstacles d'un coup : l'article existe, et son prix est celui du bordereau
 * du client.
 *
 * Entrée :
 *   { client: { email?, societe?, nom?, ville? },
 *     lignes:     [{ reference, quantite }],
 *     recherches: [{ texte, quantite }] }
 * Sortie :
 *   { partenaire, contrat, prix: { REF: { contrat, fiche, cout, quantite } },
 *     trouvailles: { texte: [{ reference, designation, contrat, fiche, cout }] },
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

  /**
   * À appeler avant tout calcul : la remontée des catégories est asynchrone.
   *
   * Peut être rappelée pour un nouveau lot d'articles — c'est le cas de la
   * recherche libre, qui ramène des articles inconnus au premier appel. Les
   * identifiants et le cache de règles sont alors élargis puis vidés : les
   * règles déjà chargées avaient été filtrées côté serveur sur les SEULS
   * articles du premier lot, et ne contenaient rien pour les nouveaux. Les
   * réutiliser telles quelles faisait retomber le calcul sur le prix de fiche,
   * à 1 €, au lieu du prix contrat.
   */
  async preparer(articles: Article[]) {
    const vues = new Set<number>(this.categs);
    for (const a of articles) {
      if (!a.categ_id) continue;
      for (const c of await this.categories(a.categ_id)) vues.add(c);
    }
    const avant = `${this.ids.length}/${this.tmpls.length}/${this.categs.length}`;

    this.ids = [...new Set([...this.ids, ...articles.map((a) => a.id)])]
      .filter(Boolean).sort();
    this.tmpls = [...new Set([...this.tmpls, ...articles.map((a) => a.tmpl_id)])]
      .filter(Boolean).sort() as number[];
    this.categs = [...vues].sort();

    if (avant !== `${this.ids.length}/${this.tmpls.length}/${this.categs.length}`) {
      this.regles.clear();
    }
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
  /* Les coordonnées viennent avec : quand le client n'existe pas encore dans
     MonCRM, Odoo fait foi et on peut le créer sans ressaisie. */
  const champs = ["name", "email", "city", "property_product_pricelist", "parent_id",
                  "phone", "mobile", "street", "street2", "zip", "vat",
                  // Distingue une société d'une personne : sans lui, on ne sait
                  // pas où chercher les contacts rattachés.
                  "is_company"];
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

/**
 * Mots retenus d'une demande en clair, pour interroger Odoo.
 *
 * Une demande arrive en phrase — « Support Ø 60 mm long 3.50 m » — quand le
 * catalogue nomme l'article « SUPPORT ACIER GALVA Ø60 LG 3500 + BOUCHON
 * BRUT ». Chercher la phrase entière ne ramène rien : aucun libellé Odoo ne la
 * contient. Il faut la réduire à ce qui distingue l'article, et croiser.
 *
 * Les longueurs sont ramenées au millimètre, parce que le catalogue les écrit
 * ainsi : « 3.50 m » devient « 3500 ». Les mots vides et les unités sont
 * écartés — les garder n'aurait fait qu'exclure des articles corrects.
 */
const MOTS_IGNORES = new Set([
  "de", "du", "la", "le", "les", "des", "au", "aux", "en", "pour", "avec", "et",
  "sur", "par", "un", "une", "mm", "cm", "ml", "long", "longueur", "lg", "dia",
  "diam", "diametre", "ref", "reference", "unite", "piece", "pieces", "type",
]);

export function motsDeRecherche(texte: string): string[] {
  const t = String(texte || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, " ");

  const mots: string[] = [];
  /* Longueurs en mètres → millimètres, AVANT tout découpage, et le motif est
     retiré du texte dans la foulée. Sans cela, « 3.50 m » laissait derrière lui
     un « 50 » orphelin qui devenait un critère : on aurait exigé que le libellé
     contienne « 50 », et écarté le bon article. */
  const reste = t.replace(/(\d{1,2})[.,](\d{1,2})\s*m\b/g, (_, a, b) => {
    mots.push(String(Math.round(parseFloat(`${a}.${b}`) * 1000)));
    return " ";
  });

  for (const brut of reste.split(/[^a-z0-9]+/)) {
    if (!brut || MOTS_IGNORES.has(brut)) continue;
    if (/^\d+$/.test(brut)) {
      // Un nombre seul suivi de « m » a déjà été converti ; on garde les autres
      // (diamètres, longueurs déjà en mm) tels quels.
      if (brut.length >= 2 && !mots.includes(brut)) mots.push(brut);
      continue;
    }
    if (brut.length >= 3 && !mots.includes(brut)) mots.push(brut);
  }
  // Au-delà de cinq critères, on n'exclut plus que des articles corrects.
  return mots.slice(0, 5);
}

/** Domaine Odoo : vendable ET chacun des mots, dans le code ou la désignation. */
export function domaineRecherche(texte: string): unknown[] {
  const mots = motsDeRecherche(texte);
  if (!mots.length) return [["sale_ok", "=", true]];

  // Notation préfixée d'Odoo : n conditions liées par ET demandent n-1 « & ».
  const sous = mots.map((m) => [
    "|", ["name", "ilike", m], ["default_code", "ilike", m],
  ]);
  const conditions: unknown[] = [];
  for (const s of sous) conditions.push(...s);

  return [
    ...Array(mots.length).fill("&"),
    ["sale_ok", "=", true],
    ...conditions,
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const repondre = (corps: unknown, code = 200) =>
    new Response(JSON.stringify(corps), {
      status: code,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { client, lignes, recherches } = await req.json();
    const demandees = (lignes || []).filter((l: any) => l?.reference);
    const aChercher = (recherches || []).filter((r: any) => (r?.texte || '').trim().length >= 2);
    if (!client || (!demandees.length && !aChercher.length)) {
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

    /* Les contacts de la société.
     *
     * Une demande n'est pas toujours écrite par l'interlocuteur de l'affaire :
     * une assistante transmet, et c'est le responsable d'exploitation qui
     * suit le dossier. Retrouver « Manue » dans le corps du message ne dit
     * rien de qui il faut mettre sur le devis. On rapatrie donc les contacts
     * rattachés à la société, à charge pour l'utilisateur de désigner le bon.
     */
    const societeId: number | null = partenaire.parent_id
      ? partenaire.parent_id[0]
      : (partenaire.is_company ? partenaire.id : null);
    let contacts: unknown[] = [];
    /* Enveloppé : cette lecture est un complément, elle ne doit pas pouvoir
       emporter la tarification. Un champ absent d'une version d'Odoo, un droit
       manquant, et toute la fonction tombait — le contrat cadre disparaissait
       de MonCRM et l'affichage retombait sur le nom deviné dans le message. */
    try {
    if (societeId) {
      contacts = ((await od.kw(
        "res.partner", "search_read",
        [[["parent_id", "=", societeId], ["active", "=", true]],
         ["id", "name", "function", "email", "phone", "mobile", "type"]],
        { limit: 40, order: "name" },
      )) as any[]).map((c) => ({
        id: c.id,
        nom: c.name || '',
        fonction: c.function || '',
        email: c.email || '',
        telephone: c.phone || '',
        mobile: c.mobile || '',
        // « contact » désigne une personne ; « delivery » ou « invoice » sont
        // des adresses, qu'on ne propose pas comme interlocuteur.
        estPersonne: !c.type || c.type === 'contact',
      })).filter((c: any) => c.estPersonne && c.nom);
    }
    } catch (e) {
      console.warn("[contacts]", (e as Error).message);
      contacts = [];
    }

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

    /* ── Recherche libre dans le catalogue d'Odoo ──────────────────────────
     *
     * MonCRM ne cherchait que dans sa copie locale du catalogue. Or cette
     * copie est incomplète — le support acier galva Ø60 en 3500, qu'Odoo
     * facture 39,852 €, n'y figure pas — et mal tarifée : sur 22 635 articles
     * vendables, 7 670 portent un prix inférieur à 2 €, parce que le prix de
     * vente ISOSIGN ne vit pas sur la fiche mais dans les listes de prix.
     *
     * Le Chiffrage local avait résolu cela en cherchant directement chez Odoo.
     * On fait pareil : l'article existe toujours, et son prix est celui de la
     * liste du client. Le classement est celui du Chiffrage — code exact,
     * puis désignation exacte, puis débuts, puis contenus — parce que le tri
     * alphabétique d'Odoo reléguait les déclinaisons cherchées derrière des
     * articles sans rapport.
     */
    const trouvailles: Record<string, unknown> = {};
    /* Même précaution : la recherche libre est un plus, la tarification est
       l'essentiel. Une requête mal formée ici ne doit pas priver MonCRM du
       contrat cadre qu'il vient d'obtenir. */
    try {
    console.log(`[recherche] ${aChercher.length} ligne(s) à chercher`);
    for (const r of aChercher) {
      const q = String(r.texte).trim();
      const qte = Number(r.quantite) || 1;
      const dom = domaineRecherche(q);
      const res = (await od.kw(
        "product.product", "search_read",
        [dom, ["id", "default_code", "name", "lst_price", "standard_price",
               "categ_id", "product_tmpl_id", "uom_id"]],
        { limit: 40, order: "default_code, name" },
      )) as any[];

      /* Trace volontairement bavarde : sans elle, une recherche qui ne ramène
         rien est indiscernable d'une recherche qui n'a pas eu lieu. Les mots
         retenus et le nombre de réponses suffisent à trancher. */
      console.log(`[recherche] « ${q} » → mots ${JSON.stringify(motsDeRecherche(q))}`
        + ` → ${res.length} article(s)`
        + (res.length ? ` : ${res.slice(0, 3).map((x) => x.default_code || x.name).join(", ")}` : ""));

      const ql = q.toLowerCase();
      const rang = (x: any) => {
        const code = (x.default_code || "").toLowerCase();
        const nom = (x.name || "").toLowerCase();
        if (code === ql) return 0;
        if (nom === ql) return 1;
        if (code.startsWith(ql)) return 2;
        if (nom.startsWith(ql)) return 3;
        if (code.includes(ql)) return 4;
        return 5;
      };
      res.sort((a, b) => rang(a) - rang(b)
        || (a.default_code || "").localeCompare(b.default_code || ""));
      const retenus = res.slice(0, 8);

      const arts: Article[] = retenus.map((x) => ({
        id: x.id,
        tmpl_id: x.product_tmpl_id ? x.product_tmpl_id[0] : null,
        categ_id: x.categ_id ? x.categ_id[0] : null,
        name: x.name,
        lst_price: x.lst_price || 0,
        standard_price: x.standard_price || 0,
      }));
      if (arts.length) await tarif.preparer(arts);

      trouvailles[q] = await Promise.all(retenus.map(async (x, i) => {
        let p: number | null = null;
        try {
          const v = await tarif.prix(contratId, arts[i], qte);
          if (v !== null) p = Math.round(v * 100) / 100;
        } catch { /* article hors barème : on n'invente pas de prix */ }
        return {
          reference: x.default_code || "",
          designation: x.name,
          categorie: x.categ_id ? x.categ_id[1] : "",
          unite: x.uom_id ? x.uom_id[1] : "",
          contrat: p,
          fiche: x.lst_price || 0,
          cout: x.standard_price || 0,
        };
      }));
    }
    } catch (e) {
      console.warn("[recherche catalogue]", (e as Error).message);
    }

    return repondre({
      partenaire: partenaire.name,
      partenaireId: partenaire.id,
      /** Résultats de la recherche libre, par texte demandé. */
      trouvailles,
      /** Coordonnées, pour créer la fiche dans MonCRM sans ressaisie. */
      coordonnees: {
        nom: partenaire.name || '',
        email: partenaire.email || '',
        telephone: partenaire.phone || partenaire.mobile || '',
        adresse: [partenaire.street, partenaire.street2].filter(Boolean).join(' '),
        codePostal: partenaire.zip || '',
        ville: partenaire.city || '',
        tvaIntra: partenaire.vat || '',
      },
      /** Société qui porte le contrat cadre — souvent le parent du contact. */
      societe,
      societeId,
      /** Interlocuteurs rattachés à la société, pour désigner le bon. */
      contacts,
      contrat,
      contratId,
      prix,
      introuvables: references.filter((r) => !parReference.has(r)),
    });
  } catch (e) {
    return repondre({ error: (e as Error).message }, 200);
  }
});
