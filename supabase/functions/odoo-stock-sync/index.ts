/**
 * Rafraîchit stock et prix du catalogue MonCRM depuis Odoo.
 *
 * Jusqu'ici, stock et dates de prix ne se remplissaient QUE lorsqu'un article
 * était retenu dans une analyse. Un catalogue de 22 637 articles ne se met pas
 * à jour au rythme des devis : les colonnes restaient vides, et une donnée
 * vide ne s'affiche pas — d'où l'impression que la fonctionnalité manquait.
 *
 * Cette fonction fait le tour du catalogue, par tranches, et repart de là où
 * elle s'est arrêtée : les articles jamais lus passent d'abord, puis les plus
 * anciennement lus. Elle se rappelle donc toute seule, sans état à tenir.
 *
 * Pourquoi par tranches : `qty_available` et `virtual_available` sont des
 * champs CALCULÉS chez Odoo — il les reconstruit à chaque lecture en
 * parcourant les mouvements de stock. Les demander pour 22 637 articles d'un
 * coup dépasserait largement le temps alloué à une fonction. Quatre cents par
 * appel passent confortablement.
 *
 * Le prix suit la même règle qu'ailleurs : on ne remplace que par PLUS
 * RÉCENT, en comparant la date de la fiche Odoo à celle du dernier changement
 * de prix ici. Un prix corrigé à la main hier n'est pas effacé par une fiche
 * inchangée depuis un an.
 *
 * Entrée  : { limite?: number }        tranche, défaut 400, plafond 1000
 *           { references?: string[] }  mode ciblé (fiche ouverte, devis saisi)
 *           { chainer?: boolean }      false pour empêcher la relance auto
 * Sortie  : { traites, majPrix, restants, introuvables, tour }
 *
 * Secrets : ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY.
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par la plateforme.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      throw new Error("Accès Odoo non configuré (ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY).");
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
    return await this.appel("object", "execute_kw", [
      this.db, this.uid, this.cle, modele, methode, args, kwargs,
    ]);
  }
}

/** En dessous, la fiche Odoo ne porte pas un prix mais un reliquat d'import. */
const SEUIL_PRIX_FACTICE = 2;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const debut = Date.now();
  try {
    const entree = await req.json().catch(() => ({}));
    const limite = Math.min(Math.max(Number(entree?.limite) || 400, 1), 1000);
    /* Mode CIBLÉ : on ne relit que les références demandées.
     *
     * C'est le mode courant — celui de l'ouverture d'une fiche article ou
     * d'un devis. Relire tout le catalogue pour afficher le stock d'un seul
     * article serait absurde ; à l'inverse, afficher un stock vieux d'un mois
     * ne vaut pas mieux que ne rien afficher. On relit donc les quelques
     * articles qu'on a sous les yeux, et rien d'autre. */
    const demandees: string[] = Array.isArray(entree?.references)
      ? entree.references.map((r: unknown) => String(r || "").trim()).filter(Boolean).slice(0, 60)
      : [];

    /* Le tour du catalogue se poursuit TOUT SEUL.
     *
     * Une tranche de 400 articles ne fait pas le tour d'un catalogue de
     * 22 637 références : il en faut cinquante-sept. Tant que la suite
     * dépendait d'un clic, les colonnes restaient vides — c'est exactement
     * ce qui s'est passé. La fonction se rappelle donc elle-même à la fin
     * de chaque tranche, tant qu'il reste des articles à lire.
     *
     * Le compteur `tour` est la ceinture de sécurité : il plafonne la
     * chaîne, de sorte qu'une anomalie ne puisse pas la faire tourner sans
     * fin. Et on ne se rappelle que si la tranche a effectivement avancé. */
    const chainer = entree?.chainer !== false && !Array.isArray(entree?.references);
    const tour = Math.max(0, Number(entree?.tour) || 0);
    const TOURS_MAX = 70;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    /* Les jamais lus d'abord, puis les plus anciennement lus. Cet ordre suffit
       à faire le tour du catalogue en appels successifs, sans tenir de curseur
       ni risquer d'oublier une tranche. */
    const champs = "id, reference, reference_odoo, prix_ht, prix_achat, prix_vente_maj, prix_achat_maj";
    const { data: lot, error: err } = demandees.length
      ? await sb.from("produits").select(champs)
          .or(demandees.map(r => `reference.eq.${r},reference_odoo.eq.${r}`).join(","))
          .limit(demandees.length * 2)
      : await sb.from("produits").select(champs)
          .order("stock_odoo_maj", { ascending: true, nullsFirst: true })
          .limit(limite);
    if (err) throw new Error(`Lecture du catalogue : ${err.message}`);
    if (!lot?.length) return json({ traites: 0, majPrix: 0, restants: 0, introuvables: 0 });

    /* La référence Odoo si on la connaît, la nôtre sinon : c'est exactement la
       règle utilisée partout ailleurs pour retrouver un article chez Odoo. */
    const codes = [...new Set(lot.map((p: any) =>
      String(p.reference_odoo || p.reference || "").trim()).filter(Boolean))];

    const odoo = new Odoo();
    const parCode = new Map<string, any>();
    /* Odoo est interrogé par paquets : un domaine `in` de mille codes tient
       mal en mémoire côté serveur, et la lecture des champs calculés serait
       d'autant plus longue. */
    for (let i = 0; i < codes.length; i += 100) {
      const tranche = codes.slice(i, i + 100);
      const lus = await odoo.kw("product.product", "search_read", [
        [["default_code", "in", tranche]],
        ["default_code", "qty_available", "virtual_available",
         "lst_price", "standard_price", "write_date"],
      ], { limit: tranche.length + 20 }) as any[];
      for (const a of lus) if (a.default_code) parCode.set(String(a.default_code).toUpperCase(), a);
    }

    const maintenant = new Date().toISOString();
    let traites = 0, majPrix = 0, introuvables = 0;

    /* Les écritures partent par paquets plutôt qu'une par une.
       Quatre cents allers-retours en file indienne prenaient l'essentiel du
       temps de la fonction — bien plus que la lecture d'Odoo elle-même. */
    const aEcrire: { id: string; maj: Record<string, unknown> }[] = [];

    for (const p of lot as any[]) {
      const code = String(p.reference_odoo || p.reference || "").trim().toUpperCase();
      const a = code ? parCode.get(code) : null;
      if (!a) {
        introuvables++;
        /* On date quand même la tentative : sans cela, un article absent
           d'Odoo remonterait en tête à chaque appel et bloquerait le tour du
           catalogue sur les mêmes lignes. */
        aEcrire.push({ id: p.id, maj: { stock_odoo_maj: maintenant } });
        continue;
      }

      const maj: Record<string, unknown> = {
        stock_odoo: Number(a.qty_available) || 0,
        stock_odoo_prevu: Number(a.virtual_available) || 0,
        stock_odoo_maj: maintenant,
      };

      /* Le plus récent l'emporte — jamais Odoo par principe. */
      const brut = String(a.write_date || "").replace(" ", "T") + "Z";
      const dateOdoo = a.write_date ? new Date(brut) : null;
      const valide = dateOdoo && !isNaN(dateOdoo.getTime());
      const plusRecent = (locale?: string | null) =>
        !valide || !locale || dateOdoo!.getTime() >= new Date(locale).getTime();
      const horodate = valide ? dateOdoo!.toISOString() : maintenant;

      const vente = Number(a.lst_price) || 0;
      if (vente > SEUIL_PRIX_FACTICE
          && Math.abs(Number(p.prix_ht || 0) - vente) >= 0.01
          && plusRecent(p.prix_vente_maj)) {
        maj.prix_ht = vente;
        maj.prix_vente_maj = horodate;
        majPrix++;
      }
      const achat = Number(a.standard_price) || 0;
      if (achat > 0
          && Math.abs(Number(p.prix_achat || 0) - achat) >= 0.01
          && plusRecent(p.prix_achat_maj)) {
        maj.prix_achat = achat;
        maj.prix_achat_maj = horodate;
      }

      /* UN PRIX INCHANGÉ A QUAND MÊME UN ÂGE.
       *
       * On ne datait que les prix qu'on REMPLAÇAIT. Résultat : un article
       * dont le prix est déjà le bon restait sans date — c'est-à-dire la
       * quasi-totalité du catalogue — et une date absente ne s'affiche pas.
       * On initialise donc la date manquante à ce qu'on sait de mieux : la
       * dernière écriture de la fiche Odoo quand elle porte un vrai prix,
       * la date de cette vérification sinon. Les dates déjà présentes ne
       * sont jamais touchées : elles disent un vrai changement. */
      if (!p.prix_vente_maj) {
        maj.prix_vente_maj = vente > SEUIL_PRIX_FACTICE ? horodate : maintenant;
      }
      if (!p.prix_achat_maj) {
        maj.prix_achat_maj = achat > 0 ? horodate : maintenant;
      }

      aEcrire.push({ id: p.id, maj });
    }

    for (let i = 0; i < aEcrire.length; i += 25) {
      const paquet = aEcrire.slice(i, i + 25);
      const rendus = await Promise.all(paquet.map(e =>
        sb.from("produits").update(e.maj).eq("id", e.id)));
      for (let k = 0; k < rendus.length; k++) {
        if (!rendus[k].error && "stock_odoo" in paquet[k].maj) traites++;
      }
    }

    /* En mode ciblé il n'y a rien « à finir » : on rend les valeurs lues,
       que l'écran affiche immédiatement sans attendre un rechargement. */
    if (demandees.length) {
      const stocks: Record<string, { dispo: number; prevu: number }> = {};
      for (const [code, a] of parCode) {
        stocks[code] = {
          dispo: Number(a.qty_available) || 0,
          prevu: Number(a.virtual_available) || 0,
        };
      }
      return json({
        traites, majPrix, introuvables, restants: 0, stocks,
        secondes: Math.round((Date.now() - debut) / 100) / 10,
      });
    }

    /* Ce qu'il reste à voir : les articles jamais lus, plus ceux dont la
       lecture date d'avant ce tour. Le chiffre dit à l'écran s'il faut
       relancer. */
    const { count } = await sb
      .from("produits")
      .select("id", { count: "exact", head: true })
      .or(`stock_odoo_maj.is.null,stock_odoo_maj.lt.${maintenant}`);

    const restants = Math.max(0, (count || 0));

    /* On passe le relais à la tranche suivante sans l'attendre : la réponse
       part tout de suite, et le tour se poursuit de lui-même. */
    if (chainer && restants > 0 && (traites + introuvables) > 0 && tour < TOURS_MAX) {
      const suite = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/odoo-stock-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
        },
        body: JSON.stringify({ limite, chainer: true, tour: tour + 1 }),
      }).catch(() => {});
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(suite);
    }

    return json({
      traites, majPrix, introuvables, tour,
      restants,
      secondes: Math.round((Date.now() - debut) / 100) / 10,
    });
  } catch (e) {
    return json({ erreur: (e as Error).message || "Échec inattendu." }, 500);
  }
});
