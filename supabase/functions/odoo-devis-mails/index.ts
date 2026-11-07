/**
 * Les devis Odoo des sociétés qui ont écrit — EN LECTURE SEULE.
 *
 * L'Agent mail classe en « déjà réalisé » une demande de devis à laquelle un
 * devis Odoo répond. Cette fonction ne juge de rien : elle retrouve les
 * sociétés par l'adresse de l'expéditeur (exacte, ou domaine de la société) et
 * rend leurs devis créés depuis une date, avec chantier, référence et lignes.
 * Le rapprochement — quel devis répond à quel mail, et avec quelle certitude —
 * est dans `src/lib/devisOdooMails.ts`, où il se teste.
 *
 * ⚠️ **AUCUNE ÉCRITURE DANS ODOO** (règle du 15/10/2026, voir `odoo-achat`).
 *
 * ⚠️ Le chantier n'a pas toujours le même nom technique : relu par
 * `fields_get`, une fois par appel, comme dans `odoo-devis`.
 *
 * Secrets : ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY (les mêmes).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Libellés lus en français : les noms de champs sont traduits. */
const CTX = { lang: "fr_FR", active_test: false };
const PAR_RECHERCHE = 40;
const PAR_LOT_DEVIS = 200;
const MAX_ADRESSES = 300;
const MAX_DEVIS = 3000;

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

  async kw(modele: string, methode: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    if (!this.uid) {
      const uid = await this.appel("common", "login", [this.db, this.login, this.cle]);
      if (!uid) throw new Error("Odoo a refusé l'identification.");
      this.uid = uid as number;
    }
    return await this.appel("object", "execute_kw", [
      this.db, this.uid, this.cle, modele, methode, args, { context: CTX, ...kwargs },
    ]);
  }
}

// deno-lint-ignore no-explicit-any
type Ligne = Record<string, any>;

const idDe = (v: unknown): number | undefined => Array.isArray(v) ? Number(v[0]) : undefined;
const nomDe = (v: unknown): string => Array.isArray(v) ? String(v[1] ?? "") : "";
const min = (v: unknown) => String(v ?? "").trim().toLowerCase();

function paquets<T>(liste: T[], taille: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) res.push(liste.slice(i, i + taille));
  return res;
}

/** `a OU b OU c`, en notation préfixée d'Odoo. */
function ou(termes: unknown[]): unknown[] {
  return [...Array(Math.max(0, termes.length - 1)).fill("|"), ...termes];
}

/** Les sociétés (partenaire commercial) qui portent ces adresses ou ces domaines. */
async function societes(od: Odoo, emails: string[], domaines: string[]) {
  const parEmail: Record<string, number[]> = {};
  const parDomaine: Record<string, number[]> = {};
  const noter = (table: Record<string, number[]>, cle: string, id: number) => {
    if (!(table[cle] ||= []).includes(id)) table[cle].push(id);
  };
  const termes = [
    ...emails.map((e) => ["email", "=ilike", e]),
    ...domaines.map((d) => ["email", "=ilike", `%@${d}`]),
  ];
  for (const lot of paquets(termes, PAR_RECHERCHE)) {
    const lus = await od.kw("res.partner", "search_read", [ou(lot)], {
      fields: ["email", "commercial_partner_id"],
      limit: 2000,
    }) as Ligne[];
    for (const p of lus) {
      const societe = idDe(p.commercial_partner_id);
      const email = min(p.email);
      if (!societe || !email) continue;
      if (emails.includes(email)) noter(parEmail, email, societe);
      const domaine = email.split("@")[1] || "";
      if (domaines.includes(domaine)) noter(parDomaine, domaine, societe);
    }
  }
  return { parEmail, parDomaine };
}

async function champsDevis(od: Odoo) {
  let chantier: string | null = null;
  let contact: string | null = null;
  try {
    const tous = await od.kw("sale.order", "fields_get", [], {
      attributes: ["string", "type", "relation"],
    }) as Ligne;
    const libelle = (k: string) => min(tous[k]?.string);
    const texte = (k: string) => ["char", "text", "html"].includes(tous[k]?.type);
    const cles = Object.keys(tous);
    chantier = tous.x_studio_chantier && texte("x_studio_chantier") ? "x_studio_chantier"
      : cles.find((k) => texte(k) && libelle(k) === "chantier")
      ?? cles.find((k) => texte(k) && libelle(k).includes("chantier"))
      ?? null;
    contact = tous.x_studio_contact_de_laffaire ? "x_studio_contact_de_laffaire" : null;
  } catch (e) {
    /* Sans chantier, le rapprochement se fait sur la référence et les lignes. */
    console.error("[odoo-devis-mails] fields_get", e);
  }
  return { chantier, contact };
}

async function devisDesSocietes(od: Odoo, ids: number[], depuis: string) {
  if (!ids.length) return { devis: [], tronque: false };
  const champs = await champsDevis(od);
  const lus = await od.kw("sale.order", "search_read", [[
    ["partner_id", "child_of", ids],
    ["create_date", ">=", `${depuis} 00:00:00`],
    ["state", "!=", "cancel"],
  ]], {
    fields: [
      "name", "create_date", "state", "partner_id", "client_order_ref", "amount_untaxed", "user_id",
      ...(champs.chantier ? [champs.chantier] : []),
      ...(champs.contact ? [champs.contact] : []),
    ],
    order: "create_date desc",
    limit: MAX_DEVIS,
  }) as Ligne[];

  /* La société de chaque devis : le partenaire peut être un contact ou une agence. */
  const partenaires = [...new Set(lus.map((d) => idDe(d.partner_id)).filter((v): v is number => !!v))];
  const societeDe = new Map<number, { id: number; nom: string }>();
  for (const lot of paquets(partenaires, PAR_LOT_DEVIS)) {
    const fiches = await od.kw("res.partner", "read", [lot], { fields: ["commercial_partner_id"] }) as Ligne[];
    for (const f of fiches) {
      const id = idDe(f.commercial_partner_id);
      if (id) societeDe.set(f.id, { id, nom: nomDe(f.commercial_partner_id) });
    }
  }

  const lignesDe = new Map<number, string[]>();
  for (const lot of paquets(lus.map((d) => d.id as number), PAR_LOT_DEVIS)) {
    const lignes = await od.kw("sale.order.line", "search_read", [[
      ["order_id", "in", lot],
      ["display_type", "=", false],
    ]], { fields: ["order_id", "name", "product_id"], limit: 20000 }) as Ligne[];
    for (const l of lignes) {
      const id = idDe(l.order_id);
      if (!id) continue;
      /* `display_name` du produit = « [A13A.500.C1…] IS A13A » : il porte le code. */
      const texte = `${nomDe(l.product_id)} ${String(l.name ?? "")}`.replace(/\s+/g, " ").trim().slice(0, 200);
      if (!lignesDe.has(id)) lignesDe.set(id, []);
      lignesDe.get(id)!.push(texte);
    }
  }

  const devis = lus.map((d) => {
    const partenaire = idDe(d.partner_id);
    const societe = partenaire ? societeDe.get(partenaire) : undefined;
    return {
      numero: String(d.name),
      societeId: societe?.id ?? partenaire ?? 0,
      societe: societe?.nom || nomDe(d.partner_id),
      /* Odoo écrit ses dates en UTC, sans le dire. */
      creeLe: `${String(d.create_date).replace(" ", "T")}Z`,
      etat: String(d.state),
      refClient: d.client_order_ref || undefined,
      chantier: (champs.chantier && d[champs.chantier]) || undefined,
      contact: (champs.contact && nomDe(d[champs.contact])) || undefined,
      montantHT: Number(d.amount_untaxed) || 0,
      vendeur: nomDe(d.user_id) || undefined,
      lien: `${od.url}/web#id=${d.id}&model=sale.order&view_type=form`,
      lignes: lignesDe.get(d.id) || [],
    };
  });
  return { devis, tronque: lus.length >= MAX_DEVIS };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const entree = await req.json();

    /* MODE « ouvrir » : le lien de la fiche Odoo d'un numéro cité dans un mail
       (AF… devis client, P… commande d'achat — `src/lib/numerosOdoo.ts`).
       Lecture seule, par nom exact, dans les seuls modèles connus. */
    if (entree?.mode === "ouvrir") {
      const MODELES = new Set(["sale.order", "purchase.order"]);
      const demandes = (Array.isArray(entree?.numeros) ? entree.numeros : [])
        .filter((n: { numero?: unknown; modele?: unknown }) =>
          typeof n?.numero === "string" && /^[A-Z0-9]{4,12}$/.test(n.numero) && MODELES.has(String(n?.modele)))
        .slice(0, 20) as { numero: string; modele: string }[];
      const od = new Odoo();
      const liens: Record<string, string | null> = {};
      for (const n of demandes) {
        const lus = await od.kw(n.modele, "search_read", [[["name", "=", n.numero]]], { fields: ["id"], limit: 1 }) as { id: number }[];
        liens[n.numero] = lus[0] ? `${od.url}/web#id=${lus[0].id}&model=${n.modele}&view_type=form` : null;
      }
      return json({ liens });
    }

    const depuis = String(entree?.depuis || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(depuis)) return json({ erreur: "date « depuis » attendue (AAAA-MM-JJ)" }, 400);
    const propres = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(min).filter(Boolean))].slice(0, MAX_ADRESSES);
    const emails = propres(entree?.emails).filter((e) => e.includes("@"));
    const domaines = propres(entree?.domaines).filter((d) => d.includes(".") && !d.includes("@"));

    const od = new Odoo();
    const { parEmail, parDomaine } = await societes(od, emails, domaines);
    const ids = [...new Set([...Object.values(parEmail), ...Object.values(parDomaine)].flat())];
    const { devis, tronque } = await devisDesSocietes(od, ids, depuis);
    return json({ parEmail, parDomaine, devis, tronque });
  } catch (e) {
    console.error("[odoo-devis-mails]", e);
    return json({ erreur: (e as Error).message || String(e) }, 500);
  }
});
