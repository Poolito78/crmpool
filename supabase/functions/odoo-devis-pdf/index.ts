/**
 * LE DEVIS ODOO TEL QUE LE CLIENT LE REÇOIT : son PDF et son montant.
 *
 * Le mail d'envoi du CRM cite les deux numéros (« DEV-2026-186 / AF042095 »)
 * et joint le PDF d'Odoo à côté du sien ; l'écran compare le montant HT d'Odoo
 * à celui du CRM (`src/lib/devisOdooEnvoi.ts`).
 *
 * La commande se retrouve par son id, son nom (AF…) ou, à défaut, par
 * `origin` = numéro du CRM (écrit par `odoo-devis` à la création, depuis le
 * 16/11/2026).
 *
 * ⚠️ **Odoo 16 ne sert pas le PDF en RPC** : `_render_qweb_pdf` est privée, et
 * la clé API n'ouvre pas de session web. On passe par le LIEN PORTAIL
 * (`get_portal_url`, jeton d'accès) — celui qu'Odoo envoie lui-même au
 * client. Seule écriture possible : le jeton d'accès de la commande, qu'Odoo
 * crée s'il manquait. Rien d'autre n'est touché.
 *
 * `sansPdf: true` : la fiche seule (numéro, montants), sans rendre le PDF.
 *
 * Secrets : ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY (les mêmes).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

  async kw(modele: string, methode: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    if (!this.uid) {
      const uid = await this.appel("common", "login", [this.db, this.login, this.cle]);
      if (!uid) throw new Error("Odoo a refusé l'identification.");
      this.uid = uid as number;
    }
    return await this.appel("object", "execute_kw", [this.db, this.uid, this.cle, modele, methode, args, kwargs]);
  }
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
    const id = Number(entree?.id) || 0;
    const nom = String(entree?.numero || "").trim().toUpperCase();
    const origine = String(entree?.origine || "").trim();
    let domaine: unknown[];
    if (id) domaine = [["id", "=", id]];
    else if (/^[A-Z]{1,4}\d{4,}$/.test(nom)) domaine = [["name", "=", nom]];
    else if (origine) domaine = [["origin", "=", origine]];
    else return json({ erreur: "Numéro Odoo attendu (AF…)." }, 400);

    const o = new Odoo();
    const lus = await o.kw("sale.order", "search_read", [domaine], {
      fields: ["id", "name", "amount_untaxed", "amount_total", "state"],
      limit: 1, order: "id desc",
    }) as { id: number; name: string; amount_untaxed: number; amount_total: number; state: string }[];
    const so = lus[0];
    if (!so) return json({ etat: "introuvable" });
    const fiche = {
      id: so.id, numero: so.name, montantHT: so.amount_untaxed,
      montantTTC: so.amount_total, etatOdoo: so.state,
      url: `${o.url}/web#id=${so.id}&model=sale.order&view_type=form`,
    };
    if (entree?.sansPdf) return json({ etat: "ok", ...fiche });

    try {
      const chemin = await o.kw("sale.order", "get_portal_url", [[so.id]], {
        report_type: "pdf", download: true,
      }) as string;
      const r = await fetch(o.url + chemin, { redirect: "follow" });
      const octets = new Uint8Array(await r.arrayBuffer());
      const estPdf = octets.length > 4 && octets[0] === 0x25 && octets[1] === 0x50
        && octets[2] === 0x44 && octets[3] === 0x46;
      if (!r.ok || !estPdf) {
        return json({ etat: "ok", ...fiche, erreurPdf: `PDF non rendu par Odoo (HTTP ${r.status}).` });
      }
      return json({ etat: "ok", ...fiche, pdfBase64: base64(octets.buffer) });
    } catch (e) {
      return json({ etat: "ok", ...fiche, erreurPdf: (e as Error).message });
    }
  } catch (e) {
    console.error("[odoo-devis-pdf]", e);
    return json({ erreur: (e as Error).message || String(e) }, 500);
  }
});
