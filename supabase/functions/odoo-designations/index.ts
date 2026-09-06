/**
 * Remplit `produits.description_variante` avec la désignation qu'Odoo vend.
 *
 * `produits.description` porte la désignation du MODÈLE : « IS KC1 » pour les
 * douze déclinaisons de KC1. Odoo nomme chacune — « KC1 800 600 C1 BRUT
 * (MARCO POLO) » — dans `product.product.name`, la colonne que l'export
 * appelle « Variant Sale Description ». C'est cette ligne-là qu'on lit pour
 * choisir un article, et elle n'existait nulle part chez nous.
 *
 * La fonction travaille PAR PAGES, curseur sur la référence : le catalogue
 * compte 22 700 articles et aucune requête ne les tient. Chaque appel rend
 * `dernier`, à repasser en `depuis` pour la page suivante, et `fini` quand il
 * n'y a plus rien à lire.
 *
 * Secrets : ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY (les mêmes que les
 * autres fonctions Odoo), plus SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
 * fournis par la plateforme.
 *
 * Corps attendu :
 *   { "jeton": "…", "depuis": "", "limite": 1000, "simulation": false }
 */

const JETON = "BFs9kvvvAh8jOvzTPEinUswnDZqooE0p";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      throw new Error("Acces Odoo non configure (ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY).");
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
    if (!uid) throw new Error("Odoo a refuse l'identification.");
    this.uid = uid as number;
    return this.uid;
  }

  async kw(modele: string, methode: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    await this.connexion();
    return await this.appel("object", "execute_kw", [
      this.db, this.uid, this.cle, modele, methode, args, kwargs,
    ]);
  }
}

/* Odoo lit par paquets : « default_code in [...] » avec 1 000 valeurs finit en
   requete SQL geante et en delai depasse. 200 tient largement. */
const PAQUET_ODOO = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const corps = await req.json().catch(() => ({}));
    if (corps.jeton !== JETON) {
      return new Response(JSON.stringify({ erreur: "jeton invalide" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const depuis = String(corps.depuis ?? "");
    const limite = Math.min(Math.max(Number(corps.limite) || 1000, 1), 2000);
    const simulation = corps.simulation === true;

    const base = Deno.env.get("SUPABASE_URL")!;
    const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const enTetes = { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };

    /* La page de references a traiter. Curseur sur la reference : elle est
       unique et ordonnable, la ou un offset deraperait des qu'une ecriture
       change l'ordre entre deux appels. */
    const filtre = depuis ? `&reference=gt.${encodeURIComponent(depuis)}` : "";
    const rLire = await fetch(
      `${base}/rest/v1/produits?select=reference&order=reference.asc&limit=${limite}${filtre}`,
      { headers: enTetes },
    );
    if (!rLire.ok) throw new Error(`lecture produits : ${rLire.status} ${await rLire.text()}`);
    const lignes = await rLire.json() as { reference: string }[];
    const refs = lignes.map((l) => l.reference).filter(Boolean);

    if (!refs.length) {
      return new Response(JSON.stringify({ lus: 0, trouves: 0, ecrits: 0, dernier: depuis, fini: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const odoo = new Odoo();
    const designations: { reference: string; designation: string }[] = [];

    for (let i = 0; i < refs.length; i += PAQUET_ODOO) {
      const paquet = refs.slice(i, i + PAQUET_ODOO);
      const articles = await odoo.kw(
        "product.product",
        "search_read",
        [[["default_code", "in", paquet]], ["default_code", "name"]],
        // `active_test: false` : une declinaison archivee chez Odoo garde sa
        // designation, et nos fiches, elles, restent vendables.
        { limit: paquet.length * 2, context: { active_test: false } },
      ) as { default_code: string; name: string }[];

      for (const a of articles) {
        const ref = String(a.default_code || "").trim();
        const nom = String(a.name || "").trim();
        if (ref && nom) designations.push({ reference: ref, designation: nom });
      }
    }

    let ecrits = 0;
    if (designations.length && !simulation) {
      const rMaj = await fetch(`${base}/rest/v1/rpc/maj_description_variante`, {
        method: "POST", headers: enTetes, body: JSON.stringify({ lignes: designations }),
      });
      if (!rMaj.ok) throw new Error(`ecriture : ${rMaj.status} ${await rMaj.text()}`);
      ecrits = Number(await rMaj.json()) || 0;
    }

    return new Response(
      JSON.stringify({
        lus: refs.length,
        trouves: designations.length,
        ecrits,
        dernier: refs[refs.length - 1],
        fini: refs.length < limite,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ erreur: String((e as Error).message || e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
