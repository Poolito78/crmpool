/**
 * Remplit `produits.description_variante` avec la designation qu'Odoo vend.
 *
 * Le champ voulu est « Variant Sale Description », PAS `name` : celui-ci porte
 * la designation du modele (« IS A11 »), identique pour toutes les
 * declinaisons. Son nom technique varie d'une base a l'autre, on le retrouve
 * donc par son libelle via fields_get.
 *
 * Corps : { jeton, depuis?, limite?, simulation?, champs? }
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

const PAQUET_ODOO = 200;
type MetaChamp = { string?: string; type?: string };

async function champsDeVariante(odoo: Odoo): Promise<Record<string, MetaChamp>> {
  return await odoo.kw("product.product", "fields_get", [[], ["string", "type"]], {}) as Record<string, MetaChamp>;
}

/** Le champ « Variant Sale Description », par son libelle. */
function trouverChamp(champs: Record<string, MetaChamp>): string {
  const texte = (m: MetaChamp) => m.type === "char" || m.type === "text" || m.type === "html";
  const entrees = Object.entries(champs);

  for (const [nom, m] of entrees) {
    if ((m.string || "").trim().toLowerCase() === "variant sale description") return nom;
  }
  for (const [nom, m] of entrees) {
    if (nom === "variant_sale_description" || nom === "description_sale_variant") return nom;
  }
  for (const [nom, m] of entrees) {
    const s = (m.string || "").toLowerCase();
    if (texte(m) && s.includes("sale description") && s.includes("variant")) return nom;
  }
  throw new Error("Champ « Variant Sale Description » introuvable sur product.product.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const corps = await req.json().catch(() => ({}));
    if (corps.jeton !== JETON) {
      return new Response(JSON.stringify({ erreur: "jeton invalide" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const odoo = new Odoo();

    /* Mode diagnostic : rendre les champs texte de product.product, pour
       reconnaitre celui que l'ecran appelle « Variant Sale Description ». */
    if (corps.champs === true) {
      const champs = await champsDeVariante(odoo);
      const liste = Object.entries(champs)
        .filter(([, m]) => m.type === "char" || m.type === "text" || m.type === "html")
        .map(([nom, m]) => ({ nom, libelle: m.string || "", type: m.type }));
      return new Response(JSON.stringify({ champs: liste }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const depuis = String(corps.depuis ?? "");
    const limite = Math.min(Math.max(Number(corps.limite) || 1000, 1), 2000);
    const simulation = corps.simulation === true;
    const champ = String(corps.champ || "") || trouverChamp(await champsDeVariante(odoo));

    const base = Deno.env.get("SUPABASE_URL")!;
    const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const enTetes = { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };

    const filtre = depuis ? `&reference=gt.${encodeURIComponent(depuis)}` : "";
    const rLire = await fetch(
      `${base}/rest/v1/produits?select=reference&order=reference.asc&limit=${limite}${filtre}`,
      { headers: enTetes },
    );
    if (!rLire.ok) throw new Error(`lecture produits : ${rLire.status} ${await rLire.text()}`);
    const lignes = await rLire.json() as { reference: string }[];
    const refs = lignes.map((l) => l.reference).filter(Boolean);

    if (!refs.length) {
      return new Response(JSON.stringify({ champ, lus: 0, trouves: 0, ecrits: 0, dernier: depuis, fini: true, echantillon: [] }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const designations: { reference: string; designation: string }[] = [];

    for (let i = 0; i < refs.length; i += PAQUET_ODOO) {
      const paquet = refs.slice(i, i + PAQUET_ODOO);
      const articles = await odoo.kw(
        "product.product",
        "search_read",
        [[["default_code", "in", paquet]], ["default_code", champ]],
        { limit: paquet.length * 2, context: { active_test: false } },
      ) as Record<string, unknown>[];

      for (const a of articles) {
        const ref = String(a.default_code || "").trim();
        const brut = a[champ];
        const nom = (brut === false || brut == null ? "" : String(brut))
          .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
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
        champ,
        lus: refs.length,
        trouves: designations.length,
        ecrits,
        dernier: refs[refs.length - 1],
        fini: refs.length < limite,
        echantillon: designations.slice(0, 6),
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ erreur: String((e as Error).message || e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
