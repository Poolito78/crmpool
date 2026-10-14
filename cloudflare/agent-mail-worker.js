/**
 * Email Worker Cloudflare — « Transférer à MonCRM » (Agent mail sur mobile).
 *
 * Cloudflare Email Routing reçoit les mails de votre domaine ; la règle
 * « tout le reste » (catch-all) les passe à ce Worker, qui les poste BRUTS à
 * la fonction Supabase `agent-mail-depot`. Celle-ci retrouve l'utilisateur par
 * la clé de l'adresse (`agent+CLE@votre-domaine`), range le mail et ses pièces
 * jointes ; l'Agent mail de MonCRM l'affiche, PC ou mobile.
 *
 * Installation (tableau de bord Cloudflare, aucun outil à installer) :
 *  1. Workers & Pages → Créer → Worker « moncrm-agent-mail » → coller ce code.
 *  2. Paramètres du Worker → Variables : URL_MONCRM =
 *     https://qkjxcfosutclnahvxflf.supabase.co/functions/v1/agent-mail-depot
 *     (suivi de ?s=<secret> si le secret AGENT_MAIL_SECRET est posé côté Supabase).
 *  3. Votre domaine → Email → Email Routing → activer, puis « Routing rules » →
 *     Catch-all → Action « Send to a Worker » → moncrm-agent-mail.
 *
 * Un mail refusé par MonCRM (clé inconnue, panne) revient à l'expéditeur avec
 * la raison : un transfert perdu ne passe jamais inaperçu.
 */
export default {
  async email(message, env) {
    const brut = await new Response(message.raw).arrayBuffer();
    let raison = '';
    try {
      const rep = await fetch(env.URL_MONCRM, {
        method: 'POST',
        headers: { 'Content-Type': 'message/rfc822', 'x-destinataire': message.to },
        body: brut,
      });
      const corps = await rep.json().catch(() => ({}));
      if (!rep.ok || !corps.ok) raison = corps.raison || `erreur ${rep.status}`;
    } catch (e) {
      raison = `MonCRM injoignable (${e.message})`;
    }
    if (raison) message.setReject(`MonCRM n'a pas pris ce mail : ${raison}`);
  },
};
