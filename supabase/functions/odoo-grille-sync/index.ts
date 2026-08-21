/**
 * Synchronisation des grilles de contrat-cadre Odoo vers Supabase.
 *
 * MonCRM tarifait en interrogeant Odoo à chaque ligne de devis. C'est lent :
 * la seule grille CCI10019 compte 9 165 lignes, un devis en interroge des
 * dizaines, et chaque appel est un aller-retour XML-RPC.
 *
 * Cette fonction recopie les grilles dans la table `grille_contrat`, que
 * MonCRM lit ensuite en une requête indexée. Odoo reste la SOURCE : la copie
 * est jetable et se reconstruit à la demande. Rien n'est écrit dans Odoo.
 *
 * Appel :
 *   POST { niveaux?: ["R1","R2","R3","R4"] }   défaut : les quatre
 *   POST { contratId: 123 }                    un contrat précis
 *
 * Réponse :
 *   { contrats: [{ id, nom, niveau, lignes }], duree }
 *
 * Secrets attendus : ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_APIKEY.
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par la plateforme.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

// ------------------------------------------------------- synchronisation

/** Niveau lisible dans l'intitulé : « CCI10019 TARIF R4 - 35 % … » → « R4 ». */
function niveauDeLIntitule(nom: string): string | null {
  const m = String(nom || "").toUpperCase().match(/\bTARIF\s*(R[1-4])\b/);
  return m ? m[1] : null;
}

/** Modèle des lignes de grille, retrouvé par sa relation one2many. */
async function modeleDesLignes(od: Odoo): Promise<string> {
  const defs = (await od.kw(
    "x_contrat_cadre", "fields_get", [[]], { attributes: ["type", "relation"] },
  )) as Record<string, any>;
  const rel = Object.entries(defs)
    .find(([k, v]) => v?.type === "one2many" && /line/i.test(k));
  return (rel?.[1]?.relation as string) || "";
}

/**
 * Recopie une grille, par tranches.
 *
 * Odoo comme Supabase supportent mal les très gros lots : on lit et on écrit
 * par paquets de mille, et l'ancienne copie n'est effacée qu'une fois la
 * nouvelle lue — sinon un incident réseau laisserait le contrat SANS grille,
 * donc tarifé par la liste de prix sans que personne s'en aperçoive.
 */
async function synchroniserContrat(
  od: Odoo,
  sb: any,
  modele: string,
  contrat: { id: number; nom: string },
): Promise<number> {
  const niveau = niveauDeLIntitule(contrat.nom);
  const { data: journal } = await sb.from("grille_synchro").insert({
    contrat_id: contrat.id, contrat_nom: contrat.nom, niveau,
  }).select("id").single();

  try {
    const PAS = 1000;
    const toutes: any[] = [];
    for (let debut = 0; ; debut += PAS) {
      const lot = (await od.kw(
        modele, "search_read",
        [[["x_contrat_cadre_id", "=", contrat.id]],
         ["x_studio_codification", "x_studio_prix_unit", "x_studio_priorite"]],
        { limit: PAS, offset: debut, order: "id" },
      )) as any[];
      if (!lot.length) break;
      toutes.push(...lot);
      if (lot.length < PAS) break;
    }

    const rangs = toutes
      .map((l) => ({
        contrat_id: contrat.id,
        contrat_nom: contrat.nom,
        niveau,
        codification: String(l.x_studio_codification || "").trim(),
        prix: Number(l.x_studio_prix_unit) || 0,
        priorite: Number(l.x_studio_priorite) || 0,
      }))
      .filter((l) => l.codification && l.prix > 0);

    /* On remplace, on n'ajoute pas : une codification retirée chez Odoo doit
       disparaître ici aussi. */
    await sb.from("grille_contrat").delete().eq("contrat_id", contrat.id);
    for (let i = 0; i < rangs.length; i += PAS) {
      const { error } = await sb.from("grille_contrat").insert(rangs.slice(i, i + PAS));
      if (error) throw new Error(error.message);
    }

    if (journal?.id) {
      await sb.from("grille_synchro").update({
        lignes: rangs.length, fin: new Date().toISOString(), etat: "terminé",
      }).eq("id", journal.id);
    }
    console.log(`[grille] #${contrat.id} « ${contrat.nom} » : ${rangs.length} ligne(s)`);
    return rangs.length;
  } catch (e) {
    const message = (e as Error).message;
    if (journal?.id) {
      await sb.from("grille_synchro").update({
        fin: new Date().toISOString(), etat: "échec", message,
      }).eq("id", journal.id);
    }
    throw e;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const repondre = (corps: unknown, code = 200) =>
    new Response(JSON.stringify(corps), {
      status: code,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const depart = Date.now();
  try {
    const corps = await req.json().catch(() => ({}));
    const niveaux: string[] = Array.isArray(corps?.niveaux) && corps.niveaux.length
      ? corps.niveaux.map((n: unknown) => String(n).toUpperCase())
      : ["R1", "R2", "R3", "R4"];
    const contratId = Number(corps?.contratId) || 0;

    const od = new Odoo();
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const modele = await modeleDesLignes(od);
    if (!modele) {
      return repondre({ erreur: "Aucun modèle de lignes sur x_contrat_cadre." }, 500);
    }

    let contrats: { id: number; nom: string }[] = [];
    if (contratId) {
      const lus = (await od.kw(
        "x_contrat_cadre", "read", [[contratId], ["x_name", "display_name"]],
      )) as any[];
      contrats = lus.map((c) => ({
        id: c.id, nom: String(c.x_name || c.display_name || "").trim(),
      }));
    } else {
      for (const n of niveaux) {
        const lus = (await od.kw(
          "x_contrat_cadre", "search_read",
          [[["x_name", "ilike", `TARIF ${n}`]], ["x_name", "display_name"]],
          { limit: 5 },
        )) as any[];
        for (const c of lus) {
          const nom = String(c.x_name || c.display_name || "").trim();
          if (!contrats.some((x) => x.id === c.id)) contrats.push({ id: c.id, nom });
        }
      }
    }

    if (!contrats.length) {
      return repondre({
        contrats: [],
        message: `Aucun contrat trouvé pour ${niveaux.join(", ")}.`,
      });
    }

    const faits: unknown[] = [];
    for (const c of contrats) {
      const lignes = await synchroniserContrat(od, sb, modele, c);
      faits.push({ id: c.id, nom: c.nom, niveau: niveauDeLIntitule(c.nom), lignes });
    }

    return repondre({ contrats: faits, duree: Math.round((Date.now() - depart) / 1000) });
  } catch (e) {
    console.error("[grille]", (e as Error).message);
    return repondre({ erreur: (e as Error).message }, 500);
  }
});
