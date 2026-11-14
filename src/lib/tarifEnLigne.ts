/**
 * Tarif en ligne ISOFLOOR, côté MonCRM : création des identifiants d'un
 * client et mail qui les lui transmet.
 *
 * Le mot de passe est généré par la fonction `tarif-catalogue` et rendu UNE
 * seule fois en clair : seul son hash est gardé (`tarif_acces`). Le perdre,
 * c'est en régénérer un. L'identifiant est l'e-mail de la fiche client.
 */
import { supabase } from '@/integrations/supabase/client';

/** Adresse publique de la page — le lien envoyé au client. */
export function urlTarif(): string {
  return `${window.location.origin}/tarif`;
}

export interface IdentifiantsTarif {
  identifiant: string;
  mdp: string;
}

export async function genererIdentifiantsTarif(clientId: string, email?: string): Promise<IdentifiantsTarif> {
  const { data, error } = await supabase.functions.invoke('tarif-catalogue', {
    body: { action: 'identifiants', client_id: clientId, email },
  });
  if (error) {
    let msg = 'Création des identifiants impossible.';
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.erreur) msg = j.erreur;
    } catch { /* corps illisible */ }
    throw new Error(msg);
  }
  return data as IdentifiantsTarif;
}

/** Lien `mailto:` pré-rédigé : l'admin relit et envoie depuis sa messagerie. */
export function mailIdentifiantsTarif(id: IdentifiantsTarif, nomContact?: string): string {
  const sujet = 'Votre accès au tarif ISOFLOOR';
  const corps = [
    `Bonjour${nomContact ? ' ' + nomContact : ''},`,
    '',
    'Votre accès au tarif professionnel ISOFLOOR est ouvert. Vous y trouverez vos prix et pourrez les télécharger en PDF.',
    '',
    `Adresse : ${urlTarif()}`,
    `Identifiant : ${id.identifiant}`,
    `Mot de passe : ${id.mdp}`,
    '',
    'Bien cordialement,',
    'ISOFLOOR',
  ].join('\n');
  return `mailto:${encodeURIComponent(id.identifiant)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}
