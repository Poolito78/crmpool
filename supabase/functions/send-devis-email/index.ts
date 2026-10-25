/**
 * Envoi d'un devis (ou d'une relance) par Resend, depuis le MOBILE.
 *
 * Sur PC, « Envoyer par mail » génère un .eml HTML qu'Outlook ouvre : liens
 * cliquables sous le nom de la fiche, images en ligne. Sur mobile, mailto: et
 * le partage ne portent que du texte brut (« nom : https://… ») ; cette
 * fonction envoie donc le MÊME HTML depuis le serveur.
 *
 * Secrets : RESEND_API_KEY, et RESEND_FROM_EMAIL — adresse d'un domaine VÉRIFIÉ
 * chez Resend (SPF/DKIM de isosign.fr), sans quoi le mail part de
 * onboarding@resend.dev, ne peut écrire qu'au titulaire du compte, ou tombe en
 * spam. `fromName` donne le nom d'affichage ; `replyTo` reçoit les réponses ;
 * `bcc` garde une copie (le mail n'est pas dans les « Éléments envoyés »).
 * Déployer : .\deploy-function.ps1 send-devis-email
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      sonde, to, subject, body, html, pdfBase64, fileName, extraAttachments,
      inlineImages, fromName, replyTo, bcc,
    } = await req.json();

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

    /* Sans rien envoyer : cette version est-elle déployée et prête ? L'app
       sonde avant chaque envoi — une ancienne version enverrait le texte brut,
       sans les liens des fiches. */
    if (sonde) {
      return reponse({
        pret: !!RESEND_API_KEY && FROM_EMAIL !== 'onboarding@resend.dev',
        raison: !RESEND_API_KEY ? 'RESEND_API_KEY non configuré'
          : FROM_EMAIL === 'onboarding@resend.dev' ? 'RESEND_FROM_EMAIL non configuré (domaine à vérifier chez Resend)' : null,
      });
    }

    if (!RESEND_API_KEY) return reponse({ error: 'RESEND_API_KEY non configuré' }, 500);
    if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) {
      return reponse({ error: 'Adresse du destinataire invalide' }, 400);
    }

    const attachments: Array<Record<string, string>> = [];
    if (pdfBase64 && fileName) attachments.push({ filename: fileName, content: pdfBase64 });
    if (Array.isArray(extraAttachments)) attachments.push(...extraAttachments);
    // Images du mail type (logo, signature) : en ligne, appelées par `cid:` dans le HTML.
    if (Array.isArray(inlineImages)) {
      for (const i of inlineImages) attachments.push({ filename: i.filename, content: i.content, content_id: i.contentId });
    }

    const from = fromName && !FROM_EMAIL.includes('<') ? `${fromName} <${FROM_EMAIL}>` : FROM_EMAIL;
    const payload: Record<string, unknown> = { from, to: [to.trim()], subject, text: body };
    if (html) payload.html = html;
    if (replyTo) payload.reply_to = replyTo;
    if (bcc) payload.bcc = [bcc];
    if (attachments.length > 0) payload.attachments = attachments;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) return reponse({ error: data.message || 'Erreur Resend' }, res.status);
    return reponse({ success: true, id: data.id });
  } catch (err) {
    return reponse({ error: String(err) }, 500);
  }
});
