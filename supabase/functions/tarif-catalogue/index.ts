/**
 * Tarif en ligne ISOFLOOR — la page publique `/tarif` de MonCRM.
 *
 * Un client dont la fiche porte « Accès à son tarif » (`clients.acces_tarif`)
 * se connecte avec son e-mail et un mot de passe propre au tarif
 * (`tarif_acces`), voit les articles cochés « Catalogue »
 * (`produits.catalogue_tarif`) À SES PRIX, et les télécharge en PDF.
 *
 * ⚠️ **CE NE SONT PAS DES COMPTES SUPABASE, ET C'EST VOULU.** `produits` et
 * `fournisseurs` sont lisibles et modifiables par tout compte authentifié :
 * un revendeur connecté verrait les prix d'achat. Seule cette fonction lit la
 * base (service role) et elle ne renvoie que des prix de VENTE.
 *
 * ⚠️ **LE PRIX EST CELUI DU DEVIS** : `prixGamme` (remiseGammes.ts, COPIE de
 * src/lib/remiseGammes.ts — le test `tarifCatalogueCopies.test.ts` les garde
 * identiques). Remise saisie sur la fiche client pour la famille de
 * l'article, sinon remise de gamme si le client est revendeur, sinon public.
 *
 * Le droit est relu à CHAQUE appel : décocher la case dans la fiche client
 * coupe l'accès tout de suite, jeton en cours compris.
 *
 * Actions (POST JSON `{ action, … }`) :
 *   demande      formulaire public de demande d'accès → `tarif_demandes`
 *   login        { identifiant, mdp } → { jeton, client }
 *   tarif        { jeton } ou session MonCRM (+ client_id facultatif) : admin =
 *                tout client ; commercial = client ouvert de SON portefeuille
 *   clients_acces session MonCRM → clients ouverts (tous / son portefeuille)
 *   identifiants admin : { client_id } → crée / renouvelle le mot de passe,
 *                rendu UNE fois en clair, coche `acces_tarif`
 *
 * `verify_jwt = false` (config.toml) : le client du tarif n'a pas de session.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { prixGamme } from "./remiseGammes.ts";
import { designationProduit } from "./designation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("TARIF_SECRET") || SERVICE_KEY;
const DUREE_JETON_MS = 12 * 3600 * 1000;
const ITERATIONS = 100_000;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function rep(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/* ── encodage ─────────────────────────────────────────────────────────── */
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

function egal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/* ── mot de passe : PBKDF2-SHA256 ─────────────────────────────────────── */
async function pbkdf2(mdp: string, sel: Uint8Array, iter: number) {
  const cle = await crypto.subtle.importKey("raw", enc.encode(mdp), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations: iter }, cle, 256));
}
async function hacher(mdp: string) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(sel)}$${b64(await pbkdf2(mdp, sel, ITERATIONS))}`;
}
async function verifier(mdp: string, stocke: string) {
  const [algo, iter, sel, hash] = stocke.split("$");
  if (algo !== "pbkdf2") return false;
  return egal(await pbkdf2(mdp, unb64(sel), Number(iter)), unb64(hash));
}
function genererMdp() {
  /* Sans 0/O, 1/l/I : le mot de passe se recopie depuis un mail. */
  const alpha = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(r, x => alpha[x % alpha.length]).join("");
}

/* ── jeton de session du tarif : payload.signature HMAC ───────────────── */
async function hmac(data: string) {
  const cle = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cle, enc.encode(data)));
}
async function signer(clientId: string) {
  const payload = b64url(JSON.stringify({ c: clientId, exp: Date.now() + DUREE_JETON_MS }));
  return `${payload}.${b64url(String.fromCharCode(...await hmac(payload)))}`;
}
async function lireJeton(jeton: string): Promise<string | null> {
  const [payload, sig] = String(jeton || "").split(".");
  if (!payload || !sig) return null;
  const attendu = await hmac(payload);
  let recu: Uint8Array;
  try { recu = Uint8Array.from(unb64url(sig), c => c.charCodeAt(0)); } catch { return null; }
  if (!egal(attendu, recu)) return null;
  try {
    const { c, exp } = JSON.parse(unb64url(payload));
    return typeof c === "string" && Date.now() < exp ? c : null;
  } catch { return null; }
}

/* ── session MonCRM : admin ou commercial ─────────────────────────────────
   L'admin ouvre et coupe les accès et voit tous les tarifs. Un commercial
   (compte MonCRM actif) CONSULTE le tarif ouvert de SES clients — ceux dont
   il est le commercial (`clients.user_id`, même règle que la RLS des
   clients) —, jamais celui des clients d'un collègue, et n'ouvre rien. */
type Equipe = { role: "admin" | "commercial"; uid: string } | null;
async function equipe(req: Request): Promise<Equipe> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  if (!data?.user) return null;
  const { data: r } = await db.from("veille_roles")
    .select("role, crm_active, crm_access").eq("user_id", data.user.id).maybeSingle();
  if (!r) return null;
  if (r.role === "admin") return { role: "admin", uid: data.user.id };
  return (r.crm_active ?? r.crm_access) ? { role: "commercial", uid: data.user.id } : null;
}
async function estAdmin(req: Request): Promise<boolean> {
  return (await equipe(req))?.role === "admin";
}

const court = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/* ── actions ──────────────────────────────────────────────────────────── */
async function demande(b: Record<string, unknown>) {
  if (court(b.site_web, 10)) return rep({ ok: true }); // pot de miel : un robot remplit tout
  const d = {
    entreprise: court(b.entreprise, 150),
    nom: court(b.nom, 120),
    email: court(b.email, 160).toLowerCase(),
    telephone: court(b.telephone, 40) || null,
    siret: court(b.siret, 20) || null,
    ville: court(b.ville, 80) || null,
    message: court(b.message, 2000) || null,
  };
  if (!d.entreprise || !d.nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    return rep({ erreur: "Entreprise, nom et e-mail valides sont obligatoires." }, 400);
  }
  /* Une même adresse ne dépose pas cinquante demandes en attente. */
  const { count } = await db.from("tarif_demandes").select("id", { count: "exact", head: true })
    .eq("email", d.email).eq("statut", "nouvelle");
  if ((count ?? 0) > 0) return rep({ ok: true, deja: true });
  const { error } = await db.from("tarif_demandes").insert(d);
  if (error) return rep({ erreur: "Enregistrement impossible, réessayez plus tard." }, 500);
  return rep({ ok: true });
}

async function login(b: Record<string, unknown>) {
  const identifiant = court(b.identifiant, 160).toLowerCase();
  const mdp = String(b.mdp ?? "");
  const refus = async () => {
    await new Promise(r => setTimeout(r, 700)); // ralentit l'essai de mots de passe
    return rep({ erreur: "Identifiant ou mot de passe incorrect." }, 401);
  };
  if (!identifiant || !mdp) return refus();
  const { data: acces } = await db.from("tarif_acces")
    .select("client_id, mdp_hash").eq("identifiant", identifiant).maybeSingle();
  if (!acces || !(await verifier(mdp, acces.mdp_hash))) return refus();
  const { data: client } = await db.from("clients")
    .select("id, societe, nom, acces_tarif").eq("id", acces.client_id).maybeSingle();
  if (!client?.acces_tarif) {
    return rep({ erreur: "Votre accès au tarif n'est pas (ou plus) actif. Contactez votre commercial ISOFLOOR." }, 403);
  }
  await db.from("tarif_acces").update({ derniere_connexion: new Date().toISOString() }).eq("client_id", client.id);
  return rep({ jeton: await signer(client.id), client: { societe: client.societe || client.nom } });
}

async function tarif(req: Request, b: Record<string, unknown>) {
  let clientId: string | null = null;
  let staff: Equipe = null;
  if (b.jeton) {
    clientId = await lireJeton(String(b.jeton));
    if (!clientId) return rep({ erreur: "Session expirée, reconnectez-vous." }, 401);
  } else if ((staff = await equipe(req))) {
    clientId = b.client_id ? court(b.client_id, 40) : null;
  } else {
    return rep({ erreur: "Non autorisé." }, 401);
  }
  const admin = staff?.role === "admin";

  let client: { societe?: string; nom?: string; est_revendeur?: boolean; remises_par_categorie?: Record<string, number>; acces_tarif?: boolean; user_id?: string } | null = null;
  if (clientId) {
    const { data } = await db.from("clients")
      .select("societe, nom, est_revendeur, remises_par_categorie, acces_tarif, user_id").eq("id", clientId).maybeSingle();
    client = data;
    if (!client) return rep({ erreur: "Client introuvable." }, 404);
    if (staff?.role === "commercial" && client.user_id !== staff.uid) {
      return rep({ erreur: "Ce client n'est pas dans votre portefeuille." }, 403);
    }
    if (!admin && !client.acces_tarif) {
      return rep({ erreur: staff
        ? "Le tarif de ce client n'est pas ouvert : seul l'administrateur ouvre les accès."
        : "Votre accès au tarif n'est plus actif." }, 403);
    }
  }

  const { data: produits, error } = await db.from("produits")
    .select("id, reference, description, description_variante, categorie, catalogue, prix_ht, paliers_prix, unite, poids, fiche_url, fiches_supplementaires")
    .eq("catalogue_tarif", true)
    .order("categorie").order("reference");
  if (error) return rep({ erreur: "Lecture du catalogue impossible." }, 500);

  /* Fiches récap des systèmes actifs dont l'article est un composant. */
  const recaps = new Map<string, { label: string; url: string }[]>();
  const ids = (produits || []).map(p => p.id);
  if (ids.length) {
    const { data: comp } = await db.from("systeme_composants")
      .select("produit_id, systemes(nom, actif, recap_url, recap_label)")
      .in("produit_id", ids);
    for (const c of (comp || []) as { produit_id: string; systemes: { nom: string; actif: boolean; recap_url: string | null; recap_label: string | null } | null }[]) {
      const s = c.systemes;
      const url = s?.recap_url?.trim();
      if (!s || !s.actif || !url) continue;
      const liste = recaps.get(c.produit_id) || [];
      if (!liste.some(l => l.url === url)) liste.push({ label: s.recap_label?.trim() || `Fiche récap - ${s.nom}`, url });
      recaps.set(c.produit_id, liste);
    }
  }
  const fichesDe = (p: { id: string; fiche_url: string | null; fiches_supplementaires: { url?: string }[] | null }) => {
    const urls = [p.fiche_url, ...((p.fiches_supplementaires || []).map(f => f?.url))]
      .map(u => (u || "").trim()).filter(u => /^https?:\/\//i.test(u));
    const uniques = [...new Set(urls)];
    return [
      ...uniques.map((url, i) => ({ type: "fiche", label: uniques.length > 1 ? `Fiche technique ${i + 1}` : "Fiche technique", url })),
      ...(recaps.get(p.id) || []).map(r => ({ type: "recap", ...r })),
    ];
  };

  const lignes = (produits || []).map(p => {
    const pub = Number(p.prix_ht) || 0;
    const g = client
      ? prixGamme(
          { prixHT: pub, paliersPrix: p.paliers_prix || [], categorie: p.categorie || undefined, catalogue: p.catalogue || undefined },
          client.remises_par_categorie || undefined,
          client.est_revendeur || false,
        )
      : null;
    return {
      reference: p.reference,
      designation: designationProduit({ description: p.description || "", descriptionVariante: p.description_variante || "" }),
      categorie: p.categorie || "",
      unite: p.unite || "",
      poids: p.poids != null ? Number(p.poids) : null,
      prixPublic: pub || null,
      prix: g ? g.prix : (pub || null),
      remise: g ? Math.round(g.remise * 1000) / 10 : 0,
      ficheUrl: p.fiche_url || null,
      fiches: fichesDe(p),
    };
  });

  return rep({
    client: client ? { societe: client.societe || client.nom || "" } : null,
    admin,
    equipe: staff?.role ?? null,
    date: new Date().toISOString(),
    lignes,
  });
}

/* Clients dont le tarif est ouvert, pour le sélecteur d'aperçu : tous pour
   l'admin, ceux de son portefeuille pour un commercial. */
async function clientsAcces(req: Request) {
  const staff = await equipe(req);
  if (!staff) return rep({ erreur: "Non autorisé." }, 401);
  let requete = db.from("clients").select("id, societe, nom").eq("acces_tarif", true);
  if (staff.role === "commercial") requete = requete.eq("user_id", staff.uid);
  const { data, error } = await requete.order("societe");
  if (error) return rep({ erreur: error.message }, 500);
  return rep({ clients: (data || []).map(c => ({ id: c.id, nom: c.societe || c.nom })) });
}

async function identifiants(req: Request, b: Record<string, unknown>) {
  if (!(await estAdmin(req))) return rep({ erreur: "Réservé à l'administrateur." }, 403);
  const clientId = court(b.client_id, 40);
  const { data: client } = await db.from("clients").select("id, email").eq("id", clientId).maybeSingle();
  if (!client) return rep({ erreur: "Client introuvable." }, 404);
  const identifiant = court(b.email || client.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifiant)) {
    return rep({ erreur: "La fiche client n'a pas d'e-mail valide : il sert d'identifiant." }, 400);
  }
  const { data: autre } = await db.from("tarif_acces").select("client_id").eq("identifiant", identifiant).maybeSingle();
  if (autre && autre.client_id !== client.id) {
    return rep({ erreur: `L'e-mail ${identifiant} sert déjà d'identifiant à un autre client.` }, 409);
  }
  const mdp = genererMdp();
  const { error } = await db.from("tarif_acces").upsert({
    client_id: client.id, identifiant, mdp_hash: await hacher(mdp), cree_le: new Date().toISOString(),
  });
  if (error) return rep({ erreur: error.message }, 500);
  await db.from("clients").update({ acces_tarif: true }).eq("id", client.id);
  return rep({ identifiant, mdp });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return rep({ erreur: "POST attendu." }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return rep({ erreur: "JSON invalide." }, 400); }
  try {
    switch (b.action) {
      case "demande": return await demande(b);
      case "login": return await login(b);
      case "tarif": return await tarif(req, b);
      case "identifiants": return await identifiants(req, b);
      case "clients_acces": return await clientsAcces(req);
      default: return rep({ erreur: "Action inconnue." }, 400);
    }
  } catch (e) {
    console.error("[tarif-catalogue]", e);
    return rep({ erreur: "Erreur serveur." }, 500);
  }
});
