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
 *     trouvailles: { texte: [{ reference, designation, contrat, fiche, cout,
 *                              certitude }] },
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
    etiquette = "",
  ): Promise<number | null> {
    if (!pricelist_id || profondeur > 5) return null;

    const items = await this.reglesDe(pricelist_id);
    const candidats: Regle[] = [];
    for (const r of items) if (await this.applicable(r, a, qte)) candidats.push(r);
    /* Aucune règle ne couvre cet article dans CETTE liste : son prix de
       fiche ne veut rien dire (cf. l'en-tête du fichier — 1 € sur la
       quasi-totalité du catalogue, parfois 0,30 € ailleurs), et le
       renvoyer comme s'il s'agissait du tarif contractuel affichait un
       prix trompeur (le B14#130km/h à 0,30 € au lieu de « hors barème »).
       On ne l'invente pas : null, comme partout ailleurs dans ce fichier —
       le front sait déjà afficher « hors barème » dans ce cas. */
    if (!candidats.length) {
      if (profondeur === 0) {
        console.log(`[tarif] ${etiquette || a.name} (#${a.id}) → aucune règle dans la `
          + `liste #${pricelist_id} : hors barème`);
      }
      return null;
    }

    candidats.sort((x, y) =>
      x.applied_on === y.applied_on
        ? (y.min_quantity || 0) - (x.min_quantity || 0)
        : x.applied_on < y.applied_on ? -1 : 1
    );
    const r = candidats[0] as Regle & { id?: number };

    /* Trace de la règle retenue : à niveau 0 seulement (pas dans la
       récursion « base=pricelist »), pour savoir SI le prix vient d'une
       règle propre à cet article/sa catégorie, ou d'une règle générique
       (« 3_global ») qui peut donner un montant très éloigné du tarif
       réellement négocié pour cette référence précise — un article
       nouvellement trouvé chez Odoo (jamais vu dans MonCRM) n'a pas
       forcément de règle dédiée dans la liste du client. */
    if (profondeur === 0) {
      console.log(`[tarif] ${etiquette || a.name} (#${a.id}) categ=${a.categ_id} → `
        + `règle #${r.id ?? "?"} applied_on=${r.applied_on} compute_price=${r.compute_price} `
        + `base=${r.base ?? "fiche"} discount=${r.price_discount ?? 0} `
        + `fixed=${r.fixed_price ?? ""} categ_regle=${JSON.stringify(r.categ_id ?? null)}`);
    }

    if (r.compute_price === "fixed") return r.fixed_price || 0;

    let base: number;
    if (r.base === "standard_price") {
      base = a.standard_price || 0;
    } else if (r.base === "pricelist" && r.base_pricelist_id) {
      const v = await this.prix(r.base_pricelist_id[0], a, qte, profondeur + 1, etiquette);
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

/**
 * Tarification par CONTRAT-CADRE.
 *
 * Chez ce client, le prix négocié ne vient pas de la liste de prix Odoo
 * (`property_product_pricelist`, exploitée par le Tarificateur ci-dessus)
 * mais d'un objet Studio distinct, le « contrat-cadre » : une grille de
 * plusieurs milliers de lignes accrochée à la fiche société. C'est elle qui
 * fait foi — la liste de prix, appliquant une règle de catégorie à ~70 %,
 * donnait des montants sans rapport avec les devis réellement émis.
 *
 * La grille ne cote pas les références une par une, elle raisonne par
 * GABARIT :
 *
 *     article   A3A.700.C2.BTR.IS.BRUT
 *     gabarit   A*  .700.C2        .BRUT    →  36,010 €
 *
 * Deux écarts avec le code article, tous deux vérifiés sur le devis Odoo
 * AF035681 (le seul dont on sait les prix justes) :
 *
 *  1. L'ÉTOILE remplace le suffixe de famille. Ce n'est pas un joker SQL,
 *     c'est un caractère stocké tel quel dans le champ : « A* » couvre A3A,
 *     A14, A2B… Le devis le prouve — A3A.700, A14.700 et A2B.700 y sont
 *     tous à 36,010 €, et B14#30km/h.650, B15.650, B21A2.650 tous à
 *     46,618 €, au millième près. On ignore en revanche combien de
 *     caractères l'étoile absorbe selon les familles (« M9Z* » ? « M* » ?),
 *     d'où l'essai de toutes les longueurs de préfixe, du plus précis au
 *     plus général : une famille qui aurait sa propre ligne l'emporte sur
 *     le gabarit générique.
 *  2. Les segments techniques BTR et IS ne figurent pas dans la grille.
 *
 * `x_studio_prix_unit` est le prix NET, remise déjà déduite : il n'y a rien
 * à recalculer (`x_studio_remise_1` vaut 0 sur ces lignes, et 36,010 est
 * bien le montant facturé, pas un tarif de base).
 */
class ContratCadre {
  private od: Odoo;
  private ids: number[] = [];
  private modeleLignes = "";
  /** Code article → prix net contractuel, ou null si l'article n'est pas couvert. */
  private cache = new Map<string, number | null>();
  /* Quelle ligne de la grille a tarifé chaque code. Sans cette trace, un
     prix venu du contrat et un prix reconstruit depuis la liste de prix sont
     indiscernables à l'écran — c'est exactement ce qui a rendu l'écart
     impossible à diagnostiquer sur le devis AF035816. */
  private gabaritsRetenus = new Map<string, string>();

  constructor(od: Odoo) {
    this.od = od;
  }

  /** Un contrat-cadre exploitable a-t-il été trouvé ? */
  get actif(): boolean {
    return this.ids.length > 0 && this.modeleLignes !== "";
  }

  /**
   * Repère les contrats-cadres portés par la fiche client.
   *
   * Les noms techniques des champs Studio (`x_studio_many2many_field_G7Vp4`…)
   * sont illisibles et peuvent changer si quelqu'un refait le champ dans
   * Odoo Studio : on les retrouve par leur RELATION vers `x_contrat_cadre`
   * plutôt qu'en les codant en dur.
   *
   * Ne lève jamais : sans contrat-cadre, la tarification retombe sur la
   * liste de prix comme avant.
   */
  async charger(...partenaires: (number | null)[]): Promise<void> {
    try {
      const defsPartenaire = (await this.od.kw(
        "res.partner", "fields_get", [[]], { attributes: ["type", "relation"] },
      )) as Record<string, any>;
      /* Plusieurs champs peuvent pointer vers x_contrat_cadre (Odoo Studio en
         laisse volontiers traîner d'anciens) : n'en retenir qu'UN au hasard
         de l'ordre alphabétique revient à lire le mauvais, vide, et à
         conclure que le client n'a pas de contrat. On les lit donc tous et
         on réunit ce qu'ils contiennent. */
      const champs = Object.entries(defsPartenaire)
        .filter(([, v]) => v?.relation === "x_contrat_cadre")
        .map(([k]) => k);
      if (!champs.length) {
        console.warn("[contrat-cadre] aucun champ de res.partner ne pointe vers "
          + "x_contrat_cadre : tarification par liste de prix conservée");
        return;
      }

      const cibles = [...new Set(partenaires.filter((p): p is number => !!p))];
      if (!cibles.length) return;
      const lus = (await this.od.kw(
        "res.partner", "read", [cibles, champs],
      )) as any[];
      const ids = new Set<number>();
      for (const l of lus) {
        for (const c of champs) {
          const v = l[c];
          if (Array.isArray(v)) {
            for (const i of v) if (typeof i === "number") ids.add(i);
          } else if (typeof v === "number") ids.add(v);
        }
      }
      if (!ids.size) {
        console.warn(`[contrat-cadre] champs [${champs.join(", ")}] vides sur les `
          + `fiches #${cibles.join(",")} : aucun contrat-cadre rattaché`);
        return;
      }
      this.ids = [...ids];

      const defsCadre = (await this.od.kw(
        "x_contrat_cadre", "fields_get", [[]], { attributes: ["type", "relation"] },
      )) as Record<string, any>;
      const rel = Object.entries(defsCadre)
        .find(([k, v]) => v?.type === "one2many" && /line/i.test(k));
      this.modeleLignes = (rel?.[1]?.relation as string) || "";
      if (!this.modeleLignes) {
        console.warn("[contrat-cadre] contrat(s) #" + this.ids.join(",")
          + " trouvé(s) mais aucun modèle de lignes : "
          + `one2many disponibles = ${JSON.stringify(Object.entries(defsCadre)
            .filter(([, v]) => v?.type === "one2many").map(([k]) => k))}`);
        return;
      }

      console.log(`[contrat-cadre] contrat(s) #${this.ids.join(",")} `
        + `via [${champs.join(", ")}], lignes dans ${this.modeleLignes}`);
    } catch (e) {
      console.warn("[contrat-cadre] chargement impossible :", (e as Error).message);
    }
  }

  /**
   * Codifications de grille susceptibles de tarifer cet article, de la plus
   * précise à la plus générale. L'ordre EST la règle de priorité.
   */
  static gabarits(code: string): string[] {
    const seg = code.split(".");
    const famille = seg[0] || "";
    const reste = seg.slice(1);
    /* BTR et IS sont retenus ou omis INDÉPENDAMMENT l'un de l'autre selon la
       famille : les panneaux s'écrivent « A*.700.C2.BRUT » sans aucun des
       deux, les supports gardent les deux (« SG60.3500.IS.BRUT »), et les
       panonceaux gardent IS mais pas BTR (« M*.1200.400.C2.IS.BRUT »).
       On essaie donc les quatre combinaisons, de la plus complète à la plus
       dépouillée : à correspondance multiple, la plus détaillée gagne. */
    const suffixe = (retirer: RegExp | null) => {
      const gardes = retirer ? reste.filter((s) => !retirer.test(s)) : reste;
      return gardes.length ? "." + gardes.join(".") : "";
    };
    /* Les segments d'OPTION — R le kit rail, P les pieds, ST la face simple —
       s'ajoutent à BTR et IS dans la liste de ce qui peut manquer côté
       grille. Le devis AF035816 les fait apparaître partout dans les codes
       Odoo — « KD22A.1000.300.C2.BTR.R.IS.BRUT » — alors que le bordereau
       cote souvent la famille sans eux. Sans ce dépouillement, ces articles
       ressortaient hors barème tout en étant bel et bien tarifés. */
    const sansOptions = (r: RegExp | null) => {
      const gardes = reste.filter((x) => !/^(R|P|ST)$/i.test(x));
      const filtres = r ? gardes.filter((x) => !r.test(x)) : gardes;
      return filtres.length ? "." + filtres.join(".") : "";
    };
    const suffixes = [...new Set([
      suffixe(null),
      suffixe(/^BTR$/i),
      suffixe(/^IS$/i),
      suffixe(/^(BTR|IS)$/i),
      sansOptions(null),
      sansOptions(/^BTR$/i),
      sansOptions(/^IS$/i),
      sansOptions(/^(BTR|IS)$/i),
    ])];

    const out: string[] = [];
    for (const s of suffixes) out.push(famille + s);
    /* Préfixes étoilés, du plus long au plus court : la forme la plus
       précise l'emporte.
       
       Ils ont d'abord été bornés à quatre caractères, parce que les formes
       relevées dans la grille des panneaux allaient de « A* » à « B30* ».
       C'était une généralisation abusive tirée d'une seule famille de
       produits : les accessoires ne se codifient pas ainsi. Un
       PLASTOBLOC24GM tarifé dans la grille sous « PLASTOBLOC* » ou
       « PLASTOBLOC24* » n'était jamais rapproché de sa ligne — on ne
       demandait que PLAS*, PLA*, PL* et P*. L'article ressortait « hors
       barème » alors que son prix était là.
       
       On balaie donc toute la longueur. La comparaison reste une égalité
       (« =ilike » n'enveloppe pas le motif de %), donc un préfixe long ne
       peut pas ramener plus large qu'un court : il n'y a aucun risque de
       faux rapprochement, seulement quelques motifs de plus dans le
       domaine. */
    for (let i = famille.length; i >= 1; i--) {
      for (const s of suffixes) out.push(famille.slice(0, i) + "*" + s);
    }
    return [...new Set(out)];
  }

  /**
   * Va chercher, en UNE requête, le tarif de tous les articles demandés.
   *
   * On envoie tous les gabarits possibles en OR et on trie côté serveur
   * plutôt que de rapatrier la grille entière : elle dépasse les 5 000
   * lignes, un dump complet est impraticable.
   */
  async precharger(codes: string[]): Promise<void> {
    if (!this.actif) return;
    const aChercher = [...new Set(codes.filter((c) => c && !this.cache.has(c)))];
    if (!aChercher.length) return;

    /* Les gabarits sont produits du plus précis au plus général, et c'est cet
       ordre qui fait la règle de priorité. On entrelace donc les codes rang
       par rang plutôt que de les concaténer : si le domaine doit être borné,
       ce qui tombe est le plus général de tous, jamais le gabarit précis d'un
       article qui se trouvait en fin de liste. */
    const parCodeGabarits = aChercher.map((c) => ContratCadre.gabarits(c));
    const gabarits = new Set<string>();
    const profondeur = Math.max(...parCodeGabarits.map((g) => g.length), 0);
    for (let rang = 0; rang < profondeur; rang++) {
      for (const g of parCodeGabarits) if (g[rang]) gabarits.add(g[rang]);
    }

    /* Depuis que les préfixes étoilés balaient toute la longueur de la
       famille, un lot d'articles aux codes longs peut produire beaucoup de
       motifs. Odoo les accepte, mais un domaine sans fin finit par coûter
       cher. On borne — et on le DIT dans le journal : un plafond silencieux
       se lirait plus tard comme « l'article n'est pas au contrat ». */
    const PLAFOND_MOTIFS = 600;
    let liste = [...gabarits];
    if (liste.length > PLAFOND_MOTIFS) {
      console.warn(`[contrat-cadre] ${liste.length} motifs pour ${aChercher.length} `
        + `article(s) : borné à ${PLAFOND_MOTIFS}, les plus généraux sont écartés`);
      liste = liste.slice(0, PLAFOND_MOTIFS);
    }
    if (!liste.length) return;

    try {
      /* « =ilike » compare le motif TEL QUEL (contrairement à « ilike », qui
         l'enveloppe de %) : l'étoile de « A*.700.C2.BRUT » reste donc un
         caractère ordinaire, et la comparaison est une simple égalité
         insensible à la casse. */
      const lignes = (await this.od.kw(
        this.modeleLignes,
        "search_read",
        [
          [
            ["x_contrat_cadre_id", "in", this.ids],
            ...Array(Math.max(liste.length - 1, 0)).fill("|"),
            ...liste.map((g) => ["x_studio_codification", "=ilike", g]),
          ],
          ["x_studio_codification", "x_studio_prix_unit", "x_studio_priorite"],
        ],
        { limit: 2000 },
      )) as any[];

      /* Une même codification peut revenir plusieurs fois dans la grille :
         la priorité la plus haute tranche, puis, à égalité, le prix le plus
         favorable au client. */
      const parCode = new Map<string, { prix: number; prio: number }>();
      for (const l of lignes) {
        const k = String(l.x_studio_codification || "").toUpperCase();
        const prix = Number(l.x_studio_prix_unit) || 0;
        if (!k || prix <= 0) continue;
        const prio = Number(l.x_studio_priorite) || 0;
        const dejaVu = parCode.get(k);
        if (!dejaVu || prio > dejaVu.prio
          || (prio === dejaVu.prio && prix < dejaVu.prix)) {
          parCode.set(k, { prix, prio });
        }
      }

      const orphelins: string[] = [];
      for (const c of aChercher) {
        const g = ContratCadre.gabarits(c).find((x) => parCode.has(x.toUpperCase()));
        const p = g ? parCode.get(g.toUpperCase())!.prix : null;
        this.cache.set(c, p);
        if (g) this.gabaritsRetenus.set(c, g);
        if (!g) orphelins.push(c);
        console.log(`[contrat-cadre] ${c} → ${g ? `${g} = ${p} €` : "aucun gabarit"}`);
      }
      await this.tracerOrphelins(orphelins);
    } catch (e) {
      console.warn("[contrat-cadre] tarif indisponible :", (e as Error).message);
    }
  }

  /**
   * Pour les articles qu'aucun gabarit n'atteint, montre ce que la grille
   * contient autour de leur dimension.
   *
   * Sans cela, un « aucun gabarit » est ambigu : l'article est-il hors
   * contrat, ou sa famille suit-elle une convention d'écriture que l'on n'a
   * pas prévue ? C'est le cas des supports SG60, dont le tarif figure au
   * devis mais qu'aucun de nos gabarits ne retrouve. Strictement borné —
   * deux articles, une requête, quarante lignes — pour rester négligeable
   * en production.
   */
  private async tracerOrphelins(codes: string[]): Promise<void> {
    if (!codes.length || !this.actif) return;
    /* Cibler la PREMIÈRE LETTRE de la famille en plus de la dimension : une
       recherche sur la seule dimension ramenait tout l'alphabet et se faisait
       couper par la limite avant d'atteindre la famille cherchée. */
    const motifs = [...new Set(
      codes.slice(0, 2)
        .map((c) => {
          const s = c.split(".");
          if (s[1] && /^\d+$/.test(s[1])) {
            return `${(s[0] || "").charAt(0)}%.${s[1]}.%`;
          }
          /* Un code SANS point — PLASTOBLOC24GM, FGBA8040 — ne rentrait dans
             aucun motif : le diagnostic ne se déclenchait pas et l'article
             restait « hors barème » sans la moindre trace de pourquoi. On
             montre ce que la grille contient autour de son début. */
          const debut = (s[0] || "").slice(0, 4);
          return debut.length >= 2 ? `${debut}%` : "";
        })
        .filter(Boolean),
    )];
    if (!motifs.length) return;
    try {
      const lignes = (await this.od.kw(
        this.modeleLignes,
        "search_read",
        [
          [
            ["x_contrat_cadre_id", "in", this.ids],
            ...Array(Math.max(motifs.length - 1, 0)).fill("|"),
            ...motifs.map((m) => ["x_studio_codification", "=ilike", m]),
          ],
          ["x_studio_codification", "x_studio_prix_unit"],
        ],
        { limit: 40, order: "x_studio_codification asc" },
      )) as any[];
      console.log(`[contrat-cadre] sans gabarit : ${codes.join(", ")} — la grille `
        + `contient, pour ${motifs.join(" / ")} : `
        + `${JSON.stringify(lignes.map((l) =>
          `${l.x_studio_codification}=${l.x_studio_prix_unit}`))}`);
    } catch { /* purement informatif : ne doit rien casser */ }
  }

  /** Prix net contractuel de l'article, ou null s'il n'est pas au contrat. */
  /** Codification de grille qui a tarifé ce code, si le contrat l'a couvert. */
  gabarit(code: string): string | null {
    return this.gabaritsRetenus.get(code) ?? null;
  }

  prix(code: string): number | null {
    return this.cache.get(code) ?? null;
  }
}

// ------------------------------------------------------- identification

/** Deux raisons sociales se ressemblent-elles, une fois accents et casse
 *  effacés ? Sert à repérer une fiche Odoo mal rattachée (parent qui n'a
 *  rien à voir avec la société attendue) sans être trop strict sur la forme
 *  exacte (« REFLEX SIGNALISATION » doit matcher « Reflex Signalisation »). */
function nomsProches(a: string, b: string): boolean {
  const normalise = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

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
                  "is_company",
                  "type"];
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
    if (r.length) {
      const trouve = departager(r);
      /* Une boîte générique (contact@…, accueil@…) peut n'exister que sur la
         fiche d'un simple contact mal rattaché — sans société ni parent, ou
         pire, rattaché au MAUVAIS parent. Chez REFLEX SIGNALISATION, la
         fiche « REFLEX SIGNALISATION Thierry » a pour parent « THIERRY
         BARAILLER » — une personne, pas la société — au lieu que ce soit
         l'inverse. Le contrat cadre remontait donc chez Thierry, qui n'a
         pas de liste de prix : prix à 0 partout. */
      const incertaine = trouve && !trouve.is_company && !trouve.parent_id;
      const societeTrouvee = trouve
        ? ((trouve.parent_id ? trouve.parent_id[1] : trouve.name) || "")
        : "";
      const incoherente = !!(trouve && !incertaine && c.societe
        && !nomsProches(societeTrouvee, c.societe));
      console.log(`[partenaire] email=${c.email} → #${trouve?.id} "${trouve?.name}"`
        + ` is_company=${trouve?.is_company} parent=${JSON.stringify(trouve?.parent_id)}`
        + ` incertaine=${incertaine} incoherente=${incoherente}`
        + (incoherente ? ` (société attendue "${c.societe}", trouvée "${societeTrouvee}")` : ""));
      if (!incertaine && !incoherente) return trouve;
      /* Une fiche incertaine ou incohérente ne suffit pas à retenir le
         contrat. On cherche la société elle-même par son nom — SANS exiger
         is_company=true (la fiche société elle-même peut avoir cette case
         mal cochée) — en excluant la fiche déjà trouvée ET son parent
         éventuel, puisque c'est justement ce couple qui est suspect. */
      const exclus = new Set(
        [trouve.id, trouve.parent_id ? trouve.parent_id[0] : null].filter(Boolean),
      );
      for (const nom of [c.societe, c.nom]) {
        if (!nom) continue;
        const parNom = (await lire([["name", "ilike", nom]]))
          .filter((p) => !exclus.has(p.id));
        console.log(`[partenaire] recherche société "${nom}" (hors #${[...exclus].join(",")}) → `
          + `${parNom.length} résultat(s)`
          + (parNom.length ? ` : ${parNom.map((p) => `#${p.id} "${p.name}"`).join(", ")}` : ""));
        if (parNom.length === 1) return parNom[0];
      }
      return trouve;
    }
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
  // « 24 kg » : le nombre est discriminant, l'unité non — comme mm ou ml.
  // Sans cela « kg » consommait une des cinq places et évinçait un critère utile.
  "kg", "kgs", "poids",
]);

/**
 * Familles d'articles que les clients n'écrivent jamais comme Odoo les nomme.
 *
 * Une demande dit « plato bloc 24 kg », Odoo porte « PLASTOBLOC24GM » : ni la
 * même orthographe, ni le même découpage. Aucun assouplissement de la
 * recherche ne rattrape ça — « plato » n'est pas une sous-chaîne de
 * « plastobloc » — il faut le dire.
 *
 * Chaque entrée réécrit le texte de la demande AVANT tout découpage en mots.
 */
const ALIAS_FAMILLES: [RegExp, string][] = [
  // plato bloc, plasto-bloc, plastot bloc… → plastobloc
  [/\bplas?t?o?s?\s*-?\s*blocs?\b/gi, "plastobloc"],
];

/**
 * Noms de CATÉGORIE, qui ne désignent aucun article en particulier.
 *
 * « panneaux AK5 en 1000 mm » : c'est AK5 et 1000 qui désignent l'article,
 * « panneaux » ne fait que dire de quelle sorte de chose on parle. Odoo ne
 * porte d'ailleurs ce mot ni dans le nom de l'article — « IS AK5 (1000, C1,
 * ST, Sans, Sans) » — ni dans sa référence.
 *
 * Ces mots restent utiles à la première passe, qui exige tout : quand ils
 * figurent vraiment au catalogue, ils affinent. Mais dès qu'il faut relâcher,
 * ce sont EUX qu'il faut lâcher en premier — sinon on garde le mot qui ne
 * distingue rien et on sacrifie ceux qui distinguent tout. C'est ce qui
 * faisait répondre « Arceau pour panneaux Diam 450 » à une demande d'AK5 :
 * seul « panneaux » avait survécu au relâchement, et l'arceau le portait.
 */
const MOTS_GENERIQUES = new Set([
  "panneau", "panneaux", "fourniture", "fournitures", "article", "articles",
  "lot", "lots", "ensemble", "ensembles", "materiel", "produit", "produits",
  "accessoire", "accessoires",
]);
/* « support », « mat » et « poteau » ont figuré ici par erreur : ce sont de
   vrais noms de famille dans CE catalogue — « IS FARDEAU 61 SUPPORT ACIER
   D60 LONGUEUR 3,50m » en porte un. Les traiter en mots vides revenait à
   effacer ce qui désigne l'article et à ne garder que les dimensions, si
   bien qu'un fourreau GBA en 80×40 satisfaisait une demande de mât 80×40.
   Un mot n'est générique que s'il ne nomme RIEN au catalogue ; « panneaux »
   en est un, Odoo nommant ses panneaux « IS AK5 » et non « PANNEAU AK5 ». */

/** Ce mot ne sert-il qu'à nommer la catégorie ? */
export function motGenerique(m: string): boolean {
  return MOTS_GENERIQUES.has(m);
}

/** Réécrit les noms de famille mal orthographiés dans une demande. */
export function normaliserFamilles(texte: string): string {
  let t = String(texte || "");
  for (const [motif, vers] of ALIAS_FAMILLES) t = t.replace(motif, vers);
  return t;
}

export function motsDeRecherche(texte: string): string[] {
  const t = normaliserFamilles(String(texte || ""))
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ø/g, " ");

  const mots: string[] = [];
  /* Longueurs en mètres → millimètres, AVANT tout découpage, et le motif est
     retiré du texte dans la foulée. Sans cela, « 3.50 m » laissait derrière lui
     un « 50 » orphelin qui devenait un critère : on aurait exigé que le libellé
     contienne « 50 », et écarté le bon article.
     
     Le mètre ENTIER compte autant que le décimal : « 2 m », « 2m », « 2 ml »
     se perdaient entièrement — « ml » est un mot vide et « 2 », à un seul
     chiffre, était rejeté. La demande « mât de 80 × 40 de 2 ml » arrivait donc
     à Odoo sans sa longueur, et n'importe quelle pièce en 80×40 la satisfaisait,
     fourreau GBA compris. */
  const reste = t
    .replace(/(\d{1,2})[.,](\d{1,2})\s*ml?\b/g, (_, a, b) => {
      mots.push(String(Math.round(parseFloat(`${a}.${b}`) * 1000)));
      return " ";
    })
    .replace(/(\d{1,2})\s*ml?\b/g, (_, a) => {
      mots.push(String(Math.round(parseFloat(a) * 1000)));
      return " ";
    })
    /* Une paire de cotes collée — « 80x40 », « 80X40 », « 80*40 » — ne
       correspond à rien telle quelle : ni le code « MAT.80.40.2000 » ni le
       libellé « 80 x 40 » ne portent cette suite de caractères. On la sépare
       en deux nombres, qui eux se retrouvent partout. */
    .replace(/(\d{2,4})\s*[x*]\s*(\d{2,4})/g, " $1 $2 ");

  for (const brut of reste.split(/[^a-z0-9]+/)) {
    if (!brut || MOTS_IGNORES.has(brut)) continue;
    if (/^\d+$/.test(brut)) {
      // Un nombre seul suivi de « m » a déjà été converti ; on garde les autres
      // (diamètres, longueurs déjà en mm) tels quels.
      if (brut.length >= 2 && !mots.includes(brut)) mots.push(brut);
      continue;
    }
    /* Les codes courts mêlant lettre et chiffre sont discriminants, pas du
       bruit : « C2 » est la classe de rétroréflexion, et sans elle une demande
       de B14 ramène indifféremment les C1, C2 et C3. Le seuil de trois
       caractères les écartait tous. */
    const codeCourt = /^[a-z]\d{1,2}$/.test(brut);
    if ((brut.length >= 3 || codeCourt) && !mots.includes(brut)) mots.push(brut);
  }

  /* La CLASSE échappe au plafond.
     
     « KC1 route barrée avec disque de distance C2 » produit six mots, et le
     plafond de cinq faisait tomber le dernier — précisément la classe, qu'on
     ajoute en queue de demande. La ligne repartait donc chercher sans elle et
     ramenait du C1. Elle est mise de côté avant la coupe, puis remise. */
  const classe = mots.find((m) => /^(c\d(?:fj)?|3430)$/.test(m));
  const sansClasse = mots.filter((m) => m !== classe);
  /* Le plafond était à cinq, du temps où la recherche exigeait tout sans
     jamais relâcher : un critère de trop et l'on ne trouvait rien. Depuis
     qu'elle relâche, sur-contraindre ne coûte plus qu'une passe, tandis que
     couper coûte un critère — et la coupe frappait justement les cotes, que
     l'on sépare désormais en deux nombres. « support ou mât 80×40 en 2 m »
     perdait ainsi son 40. */
  const gardes = sansClasse.slice(0, 7);
  return classe ? [...gardes, classe] : gardes;
}

/**
 * Combine des sous-domaines Odoo par un ET, en notation préfixée. Chaque
 * élément de `sousDomaines` est déjà la SUITE DE JETONS à insérer telle
 * quelle (un seul jeu — le tuple lui-même — pour une feuille simple comme
 * `[["name", "=", x]]`, ou trois jetons pour un bloc « | » déjà déplié comme
 * `["|", tupleA, tupleB]`). n sous-domaines demandent n-1 « & ».
 */
function combinerEt(sousDomaines: unknown[][]): unknown[] {
  if (!sousDomaines.length) return [];
  return [...Array(sousDomaines.length - 1).fill("&"), ...sousDomaines.flat()];
}

/**
 * Coût de revient local (`produits.prix_achat`), pour les articles dont Odoo
 * ne connaît pas le coût (`standard_price` = 0 — non renseigné, pas gratuit).
 *
 * Le B14#130km/h.650.C2.BTR.IS.BRUT en est l'exemple : `standard_price` vaut
 * 0 chez Odoo, donc le filtre « prix de fiche sous le coût » ne voyait rien à
 * comparer et laissait passer un article à 0,30 €. Sa fiche MonCRM
 * (`produits`, colonne `reference_odoo`) porte elle un `prix_achat` de
 * 13,365 € — c'est ce deuxième coût qu'il faut regarder quand le premier
 * manque.
 *
 * Reste un complément, pas la tarification : une erreur ici (table absente,
 * clé de service non configurée, réseau) rend juste ce filtre inopérant,
 * elle ne doit jamais faire tomber la recherche.
 */
async function coutsLocaux(codes: string[]): Promise<Map<string, number>> {
  const carte = new Map<string, number>();
  const codesUtiles = [...new Set(codes.filter(Boolean))];
  if (!codesUtiles.length) return carte;
  const url = Deno.env.get("SUPABASE_URL");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !cle) return carte;
  try {
    const filtre = `in.(${codesUtiles.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(",")})`;
    const params = new URLSearchParams({
      select: "reference_odoo,prix_achat",
      reference_odoo: filtre,
    });
    const r = await fetch(`${url}/rest/v1/produits?${params.toString()}`, {
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    });
    if (!r.ok) return carte;
    const lignes = (await r.json()) as { reference_odoo: string; prix_achat: number }[];
    for (const l of lignes) {
      const v = Number(l.prix_achat) || 0;
      if (l.reference_odoo && v > 0) carte.set(l.reference_odoo, v);
    }
  } catch (e) {
    console.warn("[coûts locaux]", (e as Error).message);
  }
  return carte;
}

/** Domaine Odoo : vendable ET chacun des mots, dans le code ou la désignation. */
export function domaineRecherche(texte: string): unknown[] {
  return domaineDepuisMots(motsDeRecherche(texte), texte);
}

/**
 * Même domaine, mais à partir d'une liste de mots déjà arrêtée — ce qui
 * permet d'en retirer au fur et à mesure quand rien ne sort.
 */
export function domaineDepuisMots(mots: string[], texte: string): unknown[] {
  // Chaque terme est déjà la suite de jetons à insérer (cf. combinerEt).
  const termes: unknown[][] = [[["sale_ok", "=", true]]];
  /* Un « fardeau » est un lot groupé — par exemple 61 supports liés
     ensemble et vendus comme UNE ligne — pas l'unité demandée. Une
     recherche « Support Ø 60 mm long 3.50 m » ramenait « IS FARDEAU 61
     SUPPORT ACIER D60 LONGUEUR 3,50m » en tête de liste, à cause des mêmes
     mots-clés dans son libellé, alors qu'un support (l'unité) était
     demandé : proposer un lot de 61 pour une quantité de 12 n'a pas de
     sens. On l'exclut, sauf si la demande mentionne elle-même « fardeau ». */
  if (!/\bfardeau\b/i.test(texte)) {
    termes.push([["name", "not ilike", "fardeau"]]);
  }
  /* Un FOURREAU GBA est la pièce qu'on scelle dans un muret béton, pas le
     mât qu'on y glisse. Il porte pourtant les mêmes dimensions — 80×40 — et
     remontait donc sur « support ou mât 80×40 en 2 m », d'autant plus
     facilement que la longueur du mât se perdait au découpage. On l'écarte
     sauf si la demande le nomme, exactement comme le fardeau. */
  if (!/\b(fourreau|gba)\b/i.test(texte)) {
    termes.push([["name", "not ilike", "fourreau"]]);
  }

  for (const m of mots) {
    termes.push(["|", ["name", "ilike", m], ["default_code", "ilike", m]]);
  }

  return combinerEt(termes);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const repondre = (corps: unknown, code = 200) =>
    new Response(JSON.stringify(corps), {
      status: code,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const corps = await req.json();
    const { client, lignes, recherches } = corps;

    /* ── Recherche libre dans le fichier client d'Odoo ──────────────────────
     *
     * MonCRM ne connaît que les clients qu'on y a saisis, alors qu'Odoo porte
     * le fichier complet. Sans cette recherche, un client qui n'a jamais été
     * ressaisi bloque la création d'un devis : il n'apparaît dans aucune
     * liste déroulante. On rend donc la main sur le fichier Odoo, à charge
     * pour MonCRM d'y recopier la fiche retenue.
     *
     * Ce mode répond seul et n'exécute aucune tarification : il n'a ni ligne
     * ni article à chiffrer. */
    const terme = String(corps?.rechercheClient ?? "").trim();
    if (terme) {
      /* Deux caractères ne discriminent rien et rapporteraient la moitié du
         fichier : on refuse plutôt que de faire travailler Odoo pour rien. */
      if (terme.length < 3) return repondre({ partenaires: [] });

      const od = new Odoo();
      const motif = `%${terme}%`;
      const champs = ["name", "email", "city", "zip", "street", "phone", "mobile",
                      "vat", "is_company", "parent_id",
                      "property_product_pricelist"];
      const trouves = (await od.kw(
        "res.partner", "search_read",
        [[["active", "=", true],
          "|", "|", "|",
          ["name", "ilike", motif],
          ["email", "ilike", motif],
          ["vat", "ilike", motif],
          ["city", "ilike", motif]],
         champs],
        { limit: 25, order: "is_company desc, name" },
      )) as any[];

      return repondre({
        partenaires: trouves.map((p) => ({
          id: p.id,
          nom: p.name || "",
          email: p.email || "",
          ville: p.city || "",
          codePostal: p.zip || "",
          adresse: p.street || "",
          telephone: p.phone || "",
          mobile: p.mobile || "",
          tva: p.vat || "",
          estSociete: !!p.is_company,
          /* Une personne rattachée : on affiche sa société pour que deux
             homonymes de groupes différents restent distinguables. */
          societeMere: p.parent_id ? p.parent_id[1] : "",
          contrat: p.property_product_pricelist ? p.property_product_pricelist[1] : "",
        })),
      });
    }

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

    /* Trace du contrat cadre retenu : la liste de prix Odoo (property_product_pricelist,
       « Positionnement prix » / « Contrat cadre » sur la fiche client) est un champ
       « company-dependent » — si Odoo la renseigne sur la fiche société mais que la
       lecture RPC ne la voit pas (mauvais contexte société, fiche mal rattachée…),
       la recherche retombe silencieusement sur le prix de fiche. Ce log permet de
       vérifier, après une demande, quelle liste a réellement été trouvée pour quel
       partenaire — sans lui, une absence de contrat est indiscernable d'un contrat
       correctement absent. */
    console.log(`[contrat] partenaire=#${partenaire.id} "${partenaire.name}"`
      + ` pricelist_propre=${JSON.stringify(partenaire.property_product_pricelist)}`
      + ` porteur=#${porteur.id} "${porteur.name}"`
      + ` pricelist_porteur=${JSON.stringify(porteur.property_product_pricelist)}`
      + ` → contratId=${contratId} contrat=${JSON.stringify(contrat)}`);

    /* Le tarif qui fait foi chez ce client n'est PAS la liste de prix lue
       ci-dessus mais le « contrat-cadre », un objet Studio séparé porté par
       la fiche société (ex. « CCI10019 TARIF R4 »). La liste de prix, elle,
       applique une règle de catégorie à ~70 % qui donnait des montants sans
       rapport avec les devis réellement émis — 60,32 € au lieu de 46,62 €
       sur le B14. On charge donc la grille du contrat : quand elle couvre un
       article, son prix l'emporte sur tout calcul de liste de prix. */
    const cadre = new ContratCadre(od);
    await cadre.charger(porteur.id, partenaire.id);

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

    /* Coût de secours pour les références demandées, même raison que pour
       la recherche libre plus bas : standard_price d'Odoo est souvent à 0
       sur ce catalogue (non renseigné, pas gratuit). */
    const coutsDirects = await coutsLocaux(references);

    /* Le contrat-cadre prime : on va chercher d'un coup le tarif de toutes
       les références demandées avant d'entrer dans la boucle. */
    await cadre.precharger([...parReference.keys()]);

    const prix: Record<string, unknown> = {};
    for (const [ref, a] of parReference) {
      const qte = quantites.get(ref) || 1;
      let contratPrix: number | null = null;
      /* Prix négocié au contrat-cadre : c'est le montant réellement
         facturé, il n'y a rien à recalculer ni à comparer au coût. */
      const auCadre = cadre.prix(ref);
      /* Au MILLIÈME : la grille cote 36,5105 et le devis Odoo affiche 36,511.
         Arrondir au centime ferait dériver le total sur les grosses
         quantités et ne collerait plus à la pièce de référence. */
      if (auCadre !== null) contratPrix = Math.round(auCadre * 1000) / 1000;
      else {
        try {
          const v = await tarif.prix(contratId, a, qte, 0, ref);
          if (v !== null) contratPrix = Math.round(v * 100) / 100;
        } catch {
          // article hors barème : on n'invente pas de prix
        }
      }
      const coutOdoo = a.standard_price || 0;
      const coutLocal = coutsDirects.get(ref) || 0;
      const cout = coutOdoo > 0 ? coutOdoo : coutLocal;
      /* Un prix — qu'il vienne d'une règle appliquée ou, à défaut, de la
         fiche — sous le coût de revient, ou nul, n'est jamais un vrai prix
         de vente sur ce catalogue (cf. l'en-tête : listes de prix qui
         recalculent depuis une fiche à 1 € ou 0,30 €, parfois à 0). Une
         RÈGLE peut très bien avoir matché et donner quand même ce résultat
         absurde — ce n'est pas réservé au cas « hors barème ». On le
         traite alors comme hors barème plutôt que de l'afficher tel quel. */
      const prixEffectif = contratPrix !== null ? contratPrix : a.lst_price;
      /* Le garde-fou « sous le coût » vise les prix reconstruits depuis une
         fiche à 1 € ; un tarif négocié au contrat-cadre est un vrai prix de
         vente, on ne le remet pas en cause même s'il passe sous un coût de
         revient qui, lui, est souvent absent ou faux dans Odoo. */
      if (auCadre === null && (prixEffectif <= 0 || (cout > 0 && prixEffectif < cout))) {
        contratPrix = null;
      }
      prix[ref] = {
        designation: a.name,
        source: auCadre !== null ? "contrat" : (contratPrix !== null ? "liste" : "aucun"),
        gabarit: cadre.gabarit(ref),
        contrat: contratPrix,
        fiche: a.lst_price,
        cout: cout || a.standard_price,
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
      const CHAMPS_ART = ["id", "default_code", "name", "lst_price", "standard_price",
                          "categ_id", "product_tmpl_id", "uom_id"];
      const chercher = (domaine: unknown[]) => od.kw(
        "product.product", "search_read", [domaine, CHAMPS_ART],
        { limit: 40, order: "default_code, name" },
      ) as Promise<any[]>;

      let res = await chercher(domaineRecherche(q));

      /* RELÂCHEMENT PROGRESSIF.
       *
       * Le domaine exige TOUS les mots à la fois. Une demande un peu bavarde
       * devient alors impossible à satisfaire : « plato bloc 24 kg pour mat
       * 80 × 40 » réclamait « mat », « 80 » et « 40 » dans le libellé ou le
       * code de l'article, or le PLASTOBLOC24GM ne porte aucun des trois —
       * ce sont les dimensions du MÂT qu'il leste, pas les siennes. Résultat :
       * zéro article, et l'utilisateur devant une liste vide sans savoir si
       * l'article n'existe pas ou si la question était mal posée.
       *
       * On retire donc les critères en commençant par les moins
       * discriminants — les nombres nus d'abord, puis les mots les plus
       * courts — et on s'arrête dès qu'une passe ramène quelque chose. Le
       * premier mot n'est jamais retiré : c'est celui que le client a écrit
       * en premier, et c'est presque toujours le nom de l'article. */
      if (!res.length) {
        const mots = motsDeRecherche(q);
        /* On sacrifie EN PARTANT DE LA FIN. Une demande française nomme
           l'article d'abord, le qualifie ensuite, et finit par le contexte :
           « plato bloc 24 kg pour mat 80 × 40 » — le bloc, son poids, puis ce
           qu'il leste. Retirer les derniers mots d'abord retient donc
           « plastobloc 24 », c'est-à-dire précisément la référence cherchée,
           là qu'un tri par longueur ou par nature aurait sacrifié le 24 avant
           le 80 et rendu les quatre PLASTOBLOC au lieu du bon. */
        const gardes = new Set(mots);
        const essayer = async (raison: string) => {
          if (!gardes.size) return false;
          res = await chercher(domaineDepuisMots([...gardes], q));
          if (!res.length) return false;
          console.log(`[recherche] « ${q} » : rien avec ${JSON.stringify(mots)},`
            + ` ${res.length} article(s) en relâchant à ${JSON.stringify([...gardes])}`
            + ` (${raison})`);
          return true;
        };

        /* D'ABORD les noms de catégorie. Ils ne désignent pas l'article, et
           les garder revenait à sacrifier ceux qui le désignent : « panneaux
           AK5 en 1000 mm » finissait sur le seul mot « panneaux », d'où un
           arceau proposé pour un panneau AK5. On ne les retire qu'ici, au
           relâchement : tant que la première passe trouve, ils affinent. */
        const generiques = mots.filter(motGenerique);
        let relache = false;
        if (generiques.length && generiques.length < mots.length) {
          for (const g of generiques) gardes.delete(g);
          relache = await essayer("noms de catégorie écartés");
        }

        /* Ensuite seulement, on sacrifie EN PARTANT DE LA FIN. Une demande
           française nomme l'article, le qualifie, puis finit par le contexte :
           « plato bloc 24 kg pour mat 80 × 40 » — le bloc, son poids, puis ce
           qu'il leste. Retirer les derniers d'abord retient « plastobloc 24 »,
           là qu'un tri par longueur aurait sacrifié le 24 avant le 80. */
        if (!relache) {
          for (let i = mots.length - 1; i >= 0; i--) {
            if (!gardes.has(mots[i]) || gardes.size <= 1) continue;
            gardes.delete(mots[i]);
            if (await essayer("mots de fin écartés")) break;
          }
        }
      }

      const segments = (code: string) => String(code || "").split(".");

      /* La classe de rétroréflexion (C1, C2, C3 — jamais liée à la forme du
         panneau : un A14, un B14 ou un C27 la portent tous sous ce même
         préfixe « C ») se cherchait par une simple sous-chaîne dans le code
         complet. Or le CODE DE FAMILLE peut lui-même contenir cette
         sous-chaîne : « C27 » commence par « C2 », « C18 » par « C1 ». Une
         demande « C27 500 C2 » se satisfaisait donc du préfixe de famille et
         ramenait indifféremment les classes C1, C2 et C3 de ce panneau — deux
         tarifs différents pour ce qui semblait être une seule demande, sans
         nuance visible entre les deux fiches. On exige que la classe
         corresponde à un SEGMENT complet du code (entre points), pas à une
         sous-chaîne — sauf si ça ne laisse plus aucun résultat. */
      for (const m of motsDeRecherche(q)) {
        if (!/^c[123]v?$/i.test(m)) continue;
        const correspond = (x: any) =>
          segments(x.default_code || "").some((s) => s.toLowerCase() === m.toLowerCase());
        const filtres = res.filter(correspond);
        if (filtres.length) res = filtres;
      }

      /* Le dernier segment du code désigne la finition : BRUT (acier nu),
         ou tout ce qui commence par « L » (laqué) — un RAL numérique
         (L1000, L2900S), un RAL avec variante (L9005MAT, « mat »), ou un
         nom de teinte (LCHAMP). Une première version ne repérait que le
         motif RAL numérique et laissait passer L9005MAT et LCHAMP. Une
         demande de « B14 » sans précision ne veut pas d'une déclinaison
         peinte au hasard parmi toutes celles-ci. On les écarte, sauf si la
         demande mentionne elle-même une teinte — et seulement si ça laisse
         au moins un résultat : un article qui n'existe QU'en peint doit
         quand même pouvoir être proposé. */
      const dernierSegment = (code: string) => {
        const parts = String(code || "").split(".");
        return parts[parts.length - 1] || "";
      };
      const estPeint = (code: string) => /^l./i.test(dernierSegment(code));
      /* Le code lui-même (« L1000 », « L9005MAT ») commence par L SUIVI D'UN
         CHIFFRE — contrairement à des mots ordinaires comme « long » ou
         « livraison » qui commencent aussi par L mais jamais par L+chiffre.
         Ce test évite de prendre un mot du texte pour une demande de teinte. */
      const demandeTeinte = /\bral\b|\bcouleur\b|\bpeint|\bchamp\b/i.test(q)
        || /\bl\d[a-z0-9]*\b/i.test(q);
      if (!demandeTeinte) {
        const nonPeints = res.filter((x) => !estPeint(x.default_code || ""));
        if (nonPeints.length) res = nonPeints;
      }

      /* Le même code se retrouve, tel quel, dans des familles de produits
         totalement différentes : « B21A2 » désigne le panneau rigide
         (B21A2.650.C2.BTR.IS.BRUT, catégorie SIGNALISATION POLICE) mais
         aussi des films souples collés dessus — BALIFLEX, G2FLEX, ISOFLEX,
         ROTO — rangés chez Odoo sous PLASTIQUE / Balisage permanent ou
         SEMI-FINIS. Une demande de « B21A2 » nue veut le panneau rigide,
         pas une déclinaison film souple choisie au hasard parmi celles-ci.
         La catégorie Odoo est un signal plus sûr que le code lui-même : un
         code de panneau peut apparaître n'importe où dans le code d'un
         produit film (ISOFB21A2450C2DF, ROTO450B21A2C2…). */
      const estSouple = (categorie: string) =>
        /^plastique\b|^semi-?finis?\b/i.test(categorie || "");
      /* Ce filtre écarte les FILMS SOUPLES, mais il le fait par la catégorie
         Odoo — or « PLASTIQUE » ne contient pas que des films : les
         PLASTOBLOC, blocs de lest en plastique rangés sous PLASTIQUE /
         Balisage temporaire, sont des accessoires de support bien physiques.
         Une demande qui les nomme explicitement se faisait donc vider de ses
         résultats juste après les avoir trouvés. On tient à jour la liste des
         familles de PLASTIQUE qui ne sont pas des films. */
      const demandeSouple = /\bisoflex\b|\bbaliflex\b|\bg2flex\b|\broto\b|\bflex\b|\bfilm\b|\bsouple\b|\bplastique\b|\bsemi-?finis?\b/i
        .test(q)
        || /\bplastobloc\b/i.test(normaliserFamilles(q));
      if (!demandeSouple) {
        const nonSouples = res.filter((x) =>
          !estSouple(x.categ_id ? x.categ_id[1] : ""));
        if (nonSouples.length) res = nonSouples;
      }

      /* Deux autres déclinaisons, ni peintes ni en film, mais tout aussi
         absentes d'une demande nue « A3A 700 C2 » : le segment « F »
         (une face ajoutée — double face) et la classe suffixée « V »
         (C1V, C2V… — panneau à volets). Comme BRUT/L, ce sont des segments
         ENTIERS séparés par des points, pas des sous-chaînes — sans quoi
         « ST » ou « IS » se feraient aussi prendre pour un « F » ou un
         « V » isolés. */
      const estFace = (code: string) => segments(code).some((s) => /^f$/i.test(s));
      const demandeFace = /\bface\b|\b2\s*faces?\b|\bdouble.?face\b|\brecto.?verso\b/i
        .test(q);
      if (!demandeFace) {
        const nonFace = res.filter((x) => !estFace(x.default_code || ""));
        if (nonFace.length) res = nonFace;
      }
      const estVolet = (code: string) => segments(code).some((s) => /^c\d+v$/i.test(s));
      const demandeVolet = /\bvolets?\b/i.test(q);
      if (!demandeVolet) {
        const nonVolet = res.filter((x) => !estVolet(x.default_code || ""));
        if (nonVolet.length) res = nonVolet;
      }

      /* Encore un segment isolé du même genre : « OV » (A14.700.C2.BTR.OV.IS.BRUT,
         entre BTR et IS) désigne une déclinaison qui n'est pas la version de
         base — une demande nue « A14 700 C2 » n'en veut pas, comme elle ne
         veut ni la face ni le volet. Même garde-fou : uniquement si la
         demande ne mentionne pas elle-même « OV », et seulement si ça laisse
         au moins un résultat. */
      const estOV = (code: string) => segments(code).some((s) => /^ov$/i.test(s));
      const demandeOV = /\bov\b/i.test(q);
      if (!demandeOV) {
        const nonOV = res.filter((x) => !estOV(x.default_code || ""));
        if (nonOV.length) res = nonOV;
      }

      /* OPTIONS JAMAIS FOURNIES D'OFFICE.
       *
       * Le volet et l'OV ci-dessus sont deux cas d'une même règle : une
       * option que la demande ne nomme pas ne doit pas être livrée. Les
       * codes en portent d'autres, que le dossier KC1 a mises au jour :
       *
       *   KC1DDM#ROUTE BARREE M.800.600.C2.BTR.IS.BRUT     49,68 €
       *   KC1DDM#ROUTE BARREE M.800.600.C2.BTR.P.IS.BRUT   69,69 €   pieds
       *   KC1DDM#ROUTE BARREE M.800.600.C2.BTR.R.IS.BRUT   59,70 €   kit rail
       *
       * « panneaux KC1 800 × 600 ROUTE BARREE » recevait la version à pieds,
       * vingt euros plus chère, sans que personne les ait demandés.
       *
       * Le DISQUE DE DISTANCE n'est pas un segment mais une autre famille —
       * KC1DD contre KC1, « IS KC1 DD » contre « IS KC1 ». Il se lit donc
       * dans le début du code, avant le # ou le premier point. Une demande le
       * réclame quand elle nomme le disque, ou quand elle porte une distance
       * en mètres : « ROUTE BARREE a 100m », c'est un KC1 DD.
       */
      const OPTIONS: { nom: string; porte: (c: string) => boolean; demandee: RegExp }[] = [
        {
          nom: "disque de distance",
          porte: (c) => /^[a-z]+\d*dd/i.test(c.split(/[.#]/)[0] || ""),
          demandee: /\bdd\b|\bdisques?\b|\b\d{2,4}\s*m\b/i,
        },
        {
          nom: "pieds",
          porte: (c) => segments(c).some((x) => /^p$/i.test(x)),
          demandee: /\bpieds?\b/i,
        },
        /* PAS DE RÈGLE SUR LE KIT RAIL, ni sur « M contre KM ».
         *
         * J'en avais écrit deux, le devis AF035816 les a démenties toutes
         * les deux et elles écartaient les BONS articles :
         *
         *   AK5.1000.C2.BTR.R.IS.BRUT
         *   KC1M#ROUTE BARREE.800.600.C2.BTR.R.IS.BRUT
         *   KC1DDM#ROUTE BARREE M.800.600.C2.BTR.R.IS.BRUT
         *   KD22A.1000.300.C2.BTR.R.IS.BRUT
         *
         * Les quatre articles de chantier portent « .R. ». Le kit rail n'est
         * donc pas une option surajoutée qu'on écarte faute d'être demandée :
         * c'est ce qui se vend. Et la gamme : la ligne 2 ne porte AUCUN
         * segment M ni KM, la ligne 3 porte M — alors que les deux sont du
         * chantier. Le « KM = temporaire » que j'avais déduit ne tient pas.
         *
         * Rien ne remplace ces deux règles : mieux vaut ne pas trancher que
         * trancher à l'envers. Le kit rail reçoit seulement une PRÉFÉRENCE au
         * classement, plus bas, qui ne peut écarter personne. */
      ];
      /* Le filtre joue DANS LES DEUX SENS. Écarter l'option non demandée ne
         suffisait pas : une demande qui la réclame doit aussi cesser de
         recevoir la version nue. « ROUTE BARREE a 100m » se voyait sinon
         proposer un KC1 sans disque, moins cher, en tête de liste — ce qui
         n'est pas ce qui a été demandé. */
      for (const o of OPTIONS) {
        const veut = o.demandee.test(q);
        const garde = res.filter((x) => o.porte(x.default_code || "") === veut);
        /* Seulement si ça laisse quelque chose : mieux vaut proposer une
           version approchante que rien du tout. */
        if (garde.length && garde.length < res.length) {
          console.log(`[recherche] « ${q} » : ${res.length - garde.length} article(s)`
            + ` écarté(s), ${o.nom} ${veut ? "demandé(e)" : "non demandé(e)"}`);
          res = garde;
        }
      }

      /* Trace volontairement bavarde : sans elle, une recherche qui ne ramène
         rien est indiscernable d'une recherche qui n'a pas eu lieu. Les mots
         retenus et le nombre de réponses suffisent à trancher. */
      console.log(`[recherche] « ${q} » → mots ${JSON.stringify(motsDeRecherche(q))}`
        + ` → ${res.length} article(s)`
        + (res.length ? ` : ${res.slice(0, 3).map((x) => x.default_code || x.name).join(", ")}` : ""));

      /* CLASSEMENT.
       *
       * Le rang se calculait en comparant l'article à la demande ENTIÈRE.
       * Or une demande est une phrase — « plato bloc 24 kg pour mat 80 × 40 »
       * — qu'aucun code ni libellé ne contient jamais : tous les articles
       * tombaient au même rang et le tri se faisait, en pratique, par ordre
       * alphabétique de référence. Le bon article pouvait donc arriver
       * huitième, et l'appli le présentait comme un candidat parmi d'autres.
       *
       * On compte désormais les MOTS de la demande retrouvés dans l'article.
       * Le premier mot pèse double : c'est le nom de la famille, celui que le
       * client écrit toujours en premier. Une correspondance dans la
       * référence vaut un peu plus que dans le libellé, la référence étant
       * moins bavarde. */
      const ql = q.toLowerCase();
      const motsQ = motsDeRecherche(q);
      /* Le bonus du « premier mot » vise le premier mot qui DÉSIGNE quelque
         chose : sur « panneaux AK5 … », l'appuyer sur « panneaux » aurait fait
         remonter tout ce dont le libellé contient ce mot. */
      /* Le pivot est le premier mot qui NOMME l'article : ni un nom de
         catégorie, ni un nombre. Les longueurs converties en millimètres
         sont ajoutées en tête de liste, si bien qu'un « 2000 » se retrouvait
         pivot et pesait double à la place du mot qui désigne la pièce. */
      /* GAMME CHANTIER.
       *
       * Deux formes de codes : ceux qui commencent par K — KC1, KD22a — et
       * ceux qui accolent le K à la lettre de la famille police, AK, BK, CK.
       * Un AK5 est le pendant chantier d'un A5, un BK celui d'un B.
       *
       * Sur cette gamme, le KIT RAIL se vend d'office : les quatre articles
       * de chantier du devis AF035816 le portent tous. On le préfère donc au
       * classement — sans jamais l'imposer, un filtre écarterait les bons
       * articles chez un client qui n'en prend pas. */
      const chantier = /\b([abc]k\d|k[a-z]{0,2}\d)/i.test(q);
      const iPivot = Math.max(0, motsQ.findIndex(
        (m) => !motGenerique(m) && !/^\d+$/.test(m)));

      /* CLASSE DE FILM.
       *
       * Quand la demande la nomme — C1, C2, C3, C3FJ, 3430 — ce n'est pas un
       * qualificatif parmi d'autres : elle change le produit et son prix. Or
       * le relâchement finit par la lâcher comme n'importe quel mot, et un
       * article d'une AUTRE classe remontait alors en tête sans que rien ne
       * le signale : sur une demande de C2, l'AK5 en C1 arrivait premier.
       *
       * On ne peut pas fabriquer une variante qui n'existe pas au catalogue.
       * Ce qu'on peut, c'est ne jamais la faire passer pour celle qui a été
       * demandée : un article dont le code porte une classe DIFFÉRENTE est
       * relégué derrière tous les autres, et la classe qu'il porte remonte
       * jusqu'à l'affichage. */
      const CLASSE = /^(c\d(?:fj)?|3430)$/i;
      const classeDemandee = motsQ.find((m) => CLASSE.test(m))?.toUpperCase() || "";
      const classeDe = (code: string) =>
        (code.split(".").find((seg) => CLASSE.test(seg)) || "").toUpperCase();
      const points = (x: any) => {
        const code = (x.default_code || "").toLowerCase();
        const nom = (x.name || "").toLowerCase();
        /* Référence citée telle quelle : rien ne peut faire mieux. */
        if (code === ql) return 1000;
        /* Classe explicitement demandée, classe explicitement différente :
           l'article existe, mais ce n'est pas celui-là. */
        const cl = classeDe(x.default_code || "");
        if (classeDemandee && cl && cl !== classeDemandee) return -100;
        let n = 0;
        /* Préférence, pas obligation : elle départage à égalité de mots
           retrouvés, et ne peut écarter personne. */
        if (chantier && segments(x.default_code || "").some((y) => /^r$/i.test(y))) n += 3;
        for (let k = 0; k < motsQ.length; k++) {
          const poids = k === iPivot ? 4 : (motGenerique(motsQ[k]) ? 1 : 2);
          if (code.includes(motsQ[k])) n += poids + 1;
          else if (nom.includes(motsQ[k])) n += poids;
        }
        return n;
      };
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
      res.sort((a, b) => points(b) - points(a)
        || rang(a) - rang(b)
        /* Le départage par la longueur du code a été retiré : entre
           « …M.800.600… » et « …KM.800.600… » il prenait le plus court en
           croyant choisir la version nue, alors qu'il choisissait une GAMME —
           M pour la police, KM pour le temporaire. Ce n'est pas un détail de
           finition, c'est un autre produit. La gamme se tranche plus haut,
           dans les options. */
        || (a.default_code || "").localeCompare(b.default_code || ""));

      /* Ce que vaut le meilleur, rapporté au maximum atteignable : l'appli
         s'en sert pour décider si elle peut le retenir d'office. */
      const maxPoints = motsQ.reduce(
        (t, m, k) => t + (k === iPivot ? 5 : (motGenerique(m) ? 2 : 3)), 0);
      const certitude = res.length && maxPoints
        ? Math.min(1, points(res[0]) / maxPoints)
        : 0;
      console.log(`[recherche] « ${q} » → meilleur ${res[0]?.default_code || "-"}`
        + ` certitude ${(certitude * 100).toFixed(0)} %`);
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

      /* Coût de secours : la moitié des fiches Odoo n'ont pas de
         standard_price renseigné (0, pas « gratuit ») — c'est justement le
         cas du B14 BRUT. On va chercher son coût dans la base article de
         MonCRM avant de conclure qu'aucun coût n'est connu. */
      const coutsBase = await coutsLocaux(retenus.map((x) => x.default_code || ""));

      /* Même règle que pour les références explicites : le contrat-cadre
         prime sur la liste de prix quand il couvre l'article. */
      await cadre.precharger(retenus.map((x) => x.default_code || ""));

      trouvailles[q] = (await Promise.all(retenus.map(async (x, i) => {
        let p: number | null = null;
        const auCadre = cadre.prix(x.default_code || "");
        // Au millième, comme Odoo (cf. commentaire plus haut).
        if (auCadre !== null) p = Math.round(auCadre * 1000) / 1000;
        else {
          try {
            const v = await tarif.prix(contratId, arts[i], qte, 0, x.default_code || "");
            if (v !== null) p = Math.round(v * 100) / 100;
          } catch { /* article hors barème : on n'invente pas de prix */ }
        }
        const coutOdoo = x.standard_price || 0;
        const coutLocal = coutsBase.get(x.default_code || "") || 0;
        const cout = coutOdoo > 0 ? coutOdoo : coutLocal;
        /* En dessous du coût de revient (Odoo, ou à défaut la base article
           MonCRM), ou nul : ce n'est pas un prix de vente. Ça arrive SANS
           règle (fiche à 0,30 €, cf. B14 BRUT) mais aussi AVEC une règle
           qui a bel et bien matché — une remise appliquée à une fiche déjà
           cassée reste cassée. Le proposer serait pire que ne rien
           proposer : on l'écarte de la liste plutôt que d'afficher
           « hors barème » ou un prix à 0 €. Sans coût connu nulle part ET
           un prix non nul, on ne peut rien comparer : l'article reste
           affiché. */
        const prixEffectif = p !== null ? p : x.lst_price;
        /* Un tarif venu du contrat-cadre est un prix négocié : il échappe au
           garde-fou « sous le coût », prévu pour les prix reconstruits. */
        if (auCadre === null && (prixEffectif <= 0 || (cout > 0 && prixEffectif < cout))) {
          return null;
        }
        return {
          reference: x.default_code || "",
          designation: x.name,
          categorie: x.categ_id ? x.categ_id[1] : "",
          unite: x.uom_id ? x.uom_id[1] : "",
          contrat: p,
          fiche: x.lst_price || 0,
          cout: cout || 0,
          /* Classe de film portée par la référence, et celle qui avait été
             demandée : l'écart doit se lire à l'écran, pas se deviner. */
          classe: classeDe(x.default_code || ""),
          classeDemandee,
          /* D'où vient le prix : la grille du client, ou un calcul de liste
             de prix. L'écran doit pouvoir le dire — un prix reconstruit n'a
             pas la même valeur qu'un prix négocié. */
          source: auCadre !== null ? "contrat" : (p !== null ? "liste" : "aucun"),
          gabarit: cadre.gabarit(x.default_code || ""),
          /* Part des mots de la demande que cet article porte réellement.
             C'est ce qui permet à l'appli de retenir le premier d'office
             sans le faire à l'aveugle : au-dessus du seuil elle l'annonce
             comme acquis, en dessous elle le retient quand même mais
             demande à ce qu'on le vérifie. */
          certitude: maxPoints ? Math.min(1, points(x) / maxPoints) : 0,
        };
      }))).filter((v) => v !== null);
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
      /* Incertaine soit faute de société/parent, soit parce que le parent
         trouvé ne correspond pas à la société attendue (fiche mal
         rattachée, cf. « REFLEX SIGNALISATION Thierry » rattachée à la
         personne « THIERRY BARAILLER » au lieu de la société). */
      societeIncertaine: (!partenaire.parent_id && !partenaire.is_company)
        || !!(client?.societe && !nomsProches(societe, client.societe)),
      partenaireType: partenaire.type || null,
    });
  } catch (e) {
    return repondre({ error: (e as Error).message }, 200);
  }
});
