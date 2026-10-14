/**
 * Réception des mails « Transférer à MonCRM » — l'Agent mail sur mobile.
 *
 * Le commercial transfère une demande depuis Outlook mobile vers son adresse
 * MonCRM, `<boîte>+<clé>@<domaine de réception>`. Deux services peuvent la
 * recevoir et la poster ici :
 *  - **Cloudflare Email Routing** + Email Worker (`cloudflare/agent-mail-worker.js`) :
 *    le mail BRUT (MIME) est posté tel quel, `x-destinataire` porte l'adresse.
 *    Gratuit, sans quota mensuel, mais il faut un domaine sur Cloudflare.
 *  - **Postmark Inbound** : le mail arrive en JSON. Sans domaine, mais
 *    100 mails par mois sur l'offre gratuite.
 * On retrouve l'utilisateur par la clé, on range les pièces jointes dans le
 * seau privé `mails-agent` et l'on inscrit le mail dans `mails_agent`
 * (migration 20261014100000). L'Agent mail le lit ensuite, PC ou mobile.
 *
 * ⚠️ **`verify_jwt = false` (config.toml), c'est voulu** : ni Postmark ni
 * Cloudflare n'ont de session MonCRM. Ce qui protège, c'est la CLÉ (24
 * caractères aléatoires, propre à chaque utilisateur) — sans elle le mail est
 * ignoré —, et, si le secret `AGENT_MAIL_SECRET` est posé, le paramètre `?s=`
 * de l'URL appelée.
 *
 * ⚠️ **Toujours répondre 200 à un mail qu'on écarte** (clé inconnue, secret
 * faux) : Postmark REJOUE un webhook en échec pendant des heures. Seule une
 * panne de notre côté (base, stockage) rend 500, pour que le mail soit rejoué.
 *
 * Le mail transféré n'est PAS démêlé ici (« De : … Envoyé : … Objet : … ») :
 * c'est `mailTransfere` (src/lib/agentMail.ts), testé, qui le fait à la lecture.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import PostalMime from "npm:postal-mime@2";

/** Le mail reçu, quelle que soit sa source. */
interface MailRecu {
  destinataires: string[];
  cle?: string;
  deNom?: string;
  deEmail?: string;
  sujet?: string;
  date?: string;
  texte?: string;
  html?: string;
  pieces: { nom: string; type: string; inline: boolean; octets: Uint8Array }[];
}

interface MailPostmark {
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  To?: string;
  ToFull?: { Email?: string; MailboxHash?: string }[];
  OriginalRecipient?: string;
  MailboxHash?: string;
  Subject?: string;
  Date?: string;
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: { Name?: string; Content?: string; ContentType?: string; ContentID?: string }[];
}

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

function depuisPostmark(m: MailPostmark): MailRecu {
  const hash = m.MailboxHash || (m.ToFull || []).find(t => t.MailboxHash)?.MailboxHash;
  return {
    destinataires: [m.OriginalRecipient, m.To].filter(Boolean) as string[],
    cle: hash?.trim(),
    deNom: m.FromFull?.Name || m.FromName,
    deEmail: m.FromFull?.Email || m.From,
    sujet: m.Subject,
    date: m.Date,
    texte: m.TextBody,
    html: m.HtmlBody,
    pieces: (m.Attachments || []).filter(a => a.Name && a.Content).map(a => ({
      nom: a.Name!,
      type: a.ContentType || "",
      inline: !!a.ContentID,
      octets: Uint8Array.from(atob(a.Content!), c => c.charCodeAt(0)),
    })),
  };
}

async function depuisMime(brut: ArrayBuffer, destinataire: string): Promise<MailRecu> {
  const e = await PostalMime.parse(brut);
  return {
    destinataires: [destinataire],
    deNom: e.from?.name,
    deEmail: e.from?.address,
    sujet: e.subject,
    date: e.date,
    texte: e.text,
    html: e.html,
    pieces: (e.attachments || []).filter(a => a.filename && a.content).map(a => ({
      nom: a.filename!,
      type: a.mimeType || "",
      inline: a.disposition === "inline" && !!a.contentId,
      octets: typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content as ArrayBuffer),
    })),
  };
}

/** La clé : après le « + » de l'adresse (`agent+CLE@…`), à défaut la partie locale entière. */
function cleDuMail(m: MailRecu): string {
  if (m.cle) return m.cle;
  for (const a of m.destinataires) {
    const plus = /\+([A-Za-z0-9_-]{8,})@/.exec(a)?.[1];
    if (plus) return plus;
  }
  const local = /([A-Za-z0-9_-]{16,})@/.exec(m.destinataires[0] || "")?.[1];
  return local ?? "";
}

/** Le texte du mail ; à défaut de version texte, le HTML dépouillé. */
function texteDuMail(m: MailRecu): string {
  if (m.texte?.trim()) return m.texte;
  return (m.html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Une image de signature n'est pas une pièce jointe. */
function pieceUtile(p: MailRecu["pieces"][number]): boolean {
  if (p.inline && /^image\//i.test(p.type)) return false;
  return !/^(image|outlook-)\w*\.(png|jpe?g|gif|bmp)$/i.test(p.nom.trim());
}

function nomStockage(nom: string): string {
  return nom.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "piece";
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, raison: "POST attendu" }, 405);

  const secret = Deno.env.get("AGENT_MAIL_SECRET");
  if (secret && new URL(req.url).searchParams.get("s") !== secret) {
    console.warn("[agent-mail-depot] secret absent ou faux — mail ignoré");
    return json({ ok: false, raison: "ignoré" });
  }

  let mail: MailRecu;
  try {
    const destinataire = req.headers.get("x-destinataire");
    mail = destinataire
      ? await depuisMime(await req.arrayBuffer(), destinataire)
      : depuisPostmark(await req.json());
  } catch (e) {
    console.warn("[agent-mail-depot] mail illisible :", (e as Error).message);
    return json({ ok: false, raison: "mail illisible" });
  }

  const cle = cleDuMail(mail);
  if (!cle) {
    console.warn("[agent-mail-depot] aucune clé dans l'adresse :", mail.destinataires.join(", "));
    return json({ ok: false, raison: "clé absente" });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: proprio, error: errCle } = await sb
    .from("agent_mail_cles").select("user_id").eq("cle", cle).maybeSingle();
  if (errCle) {
    console.error("[agent-mail-depot] lecture des clés :", errCle.message);
    return json({ ok: false, raison: errCle.message }, 500);
  }
  if (!proprio) {
    console.warn("[agent-mail-depot] clé inconnue :", cle);
    return json({ ok: false, raison: "clé inconnue" });
  }

  const id = crypto.randomUUID();
  const pieces: { nom: string; chemin: string; type: string; taille: number }[] = [];
  for (const [i, p] of mail.pieces.filter(pieceUtile).entries()) {
    const chemin = `${proprio.user_id}/${id}/${i + 1}-${nomStockage(p.nom)}`;
    const { error } = await sb.storage.from("mails-agent")
      .upload(chemin, p.octets, { contentType: p.type || "application/octet-stream", upsert: true });
    if (error) {
      console.error("[agent-mail-depot] pièce jointe", p.nom, ":", error.message);
      return json({ ok: false, raison: error.message }, 500);
    }
    pieces.push({ nom: p.nom, chemin, type: p.type, taille: p.octets.length });
  }

  const recu = mail.date ? new Date(mail.date) : new Date();
  const { error } = await sb.from("mails_agent").insert({
    id,
    user_id: proprio.user_id,
    recu_le: isNaN(recu.getTime()) ? new Date().toISOString() : recu.toISOString(),
    de_nom: mail.deNom || null,
    de_email: (mail.deEmail || "").toLowerCase() || null,
    sujet: mail.sujet || null,
    texte: texteDuMail(mail),
    pieces_jointes: pieces,
  });
  if (error) {
    console.error("[agent-mail-depot] inscription :", error.message);
    return json({ ok: false, raison: error.message }, 500);
  }

  console.log(`[agent-mail-depot] reçu « ${mail.sujet} » (${pieces.length} PJ) pour ${proprio.user_id}`);
  return json({ ok: true, id });
});
