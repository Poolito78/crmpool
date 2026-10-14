/**
 * Les mails « Transférés à MonCRM » — l'Agent mail sur mobile, sans Azure.
 *
 * Le commercial transfère une demande depuis Outlook mobile vers son adresse
 * MonCRM (`<boîte>+<clé>@<domaine de réception>`). Le service de réception
 * (Cloudflare Email Routing ou Postmark Inbound) la poste à la fonction Edge
 * `agent-mail-depot`, qui l'inscrit dans `mails_agent` et range ses pièces
 * jointes dans le seau privé `mails-agent` (migration 20261014100000). Ce
 * module les lit pour l'Agent mail — sur PC comme sur mobile, le statut
 * vivant en base.
 *
 * ⚠️ **Le client est l'expéditeur D'ORIGINE, pas le commercial** : le texte
 * reçu commence par la note du commercial puis « De : client… Objet : … » ;
 * `mailTransfere` (agentMail.ts) le démêle. Sans en-tête reconnu, rien n'est
 * deviné.
 *
 * ⚠️ **Pièces jointes effacées quand le mail est traité ou écarté** : le
 * forfait gratuit de stockage est de 1 Go, et le mail reste dans Outlook.
 *
 * Les tables ne sont pas encore dans `types.ts` (à régénérer après la
 * migration) : d'où les `as never`, comme pour `mails_types`.
 */

import { supabase } from '@/integrations/supabase/client';
import { type MailAgent, emlSynthetique, mailTransfere, pieceJointeUtile } from './agentMail';

export interface AdresseAgent {
  cle: string;
  adresseEntree: string;
}

interface PieceStockee { nom: string; chemin: string; type: string; taille: number }

interface LigneMailAgent {
  id: string;
  recu_le: string;
  de_nom: string | null;
  de_email: string | null;
  sujet: string | null;
  texte: string | null;
  pieces_jointes: PieceStockee[] | null;
}

/** Ce qu'il faut garder d'un mail transféré pour le confier à l'analyse. */
export interface DonneesTransfert {
  pieces: PieceStockee[];
}

/**
 * L'adresse à laquelle transférer : la clé s'insère après un « + » dans
 * l'adresse de réception (« agent@moncrm-mails.fr » → « agent+CLE@… »).
 */
export function adresseDeTransfert(adresseEntree: string, cle: string): string {
  const a = adresseEntree.trim();
  const at = a.lastIndexOf('@');
  if (at <= 0) return a;
  const local = a.slice(0, at).split('+')[0];
  return `${local}+${cle}${a.slice(at)}`;
}

function nouvelleCle(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), o => alphabet[o % alphabet.length]).join('');
}

async function utilisateur(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Session MonCRM expirée');
  return id;
}

export async function lireAdresseAgent(): Promise<AdresseAgent | null> {
  const { data, error } = await supabase.from('agent_mail_cles' as never).select('cle, adresse_entree').maybeSingle();
  if (error) throw new Error(error.message);
  const r = data as { cle: string; adresse_entree: string } | null;
  return r ? { cle: r.cle, adresseEntree: r.adresse_entree } : null;
}

/** Enregistre l'adresse de réception ; crée la clé la première fois, la garde ensuite. */
export async function enregistrerAdresseAgent(adresseEntree: string, nouvelle = false): Promise<AdresseAgent> {
  const userId = await utilisateur();
  const existante = nouvelle ? null : await lireAdresseAgent();
  const ligne = { user_id: userId, cle: existante?.cle || nouvelleCle(), adresse_entree: adresseEntree.trim(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from('agent_mail_cles' as never).upsert(ligne as never);
  if (error) throw new Error(error.message);
  return { cle: ligne.cle, adresseEntree: ligne.adresse_entree };
}

/** Les mails transférés à traiter, du plus récent au plus ancien. */
export async function lireMailsTransferes(): Promise<(MailAgent & { transfert: DonneesTransfert })[]> {
  const { data, error } = await supabase.from('mails_agent' as never)
    .select('id, recu_le, de_nom, de_email, sujet, texte, pieces_jointes')
    .eq('statut', 'a_traiter')
    .order('recu_le', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return ((data || []) as LigneMailAgent[]).map(r => {
    const t = mailTransfere(r.texte || '', r.sujet || '');
    const pieces = r.pieces_jointes || [];
    return {
      id: `t:${r.id}`,
      ligneId: r.id,
      source: 'transfert' as const,
      sujet: t.sujet || '(sans objet)',
      deNom: t.transfere ? t.deNom : (r.de_nom || ''),
      deEmail: t.transfere ? t.deEmail : (r.de_email || ''),
      recuLe: t.date || r.recu_le,
      corps: t.note ? `Note de transfert : ${t.note}\n\n${t.corps}` : t.corps,
      piecesJointes: pieces.map(p => p.nom).filter(pieceJointeUtile),
      transfert: { pieces },
    };
  });
}

/** Traité ou écarté : le mail sort de la liste partout, ses pièces jointes sont effacées. */
export async function classerMailTransfere(m: { ligneId?: string; transfert?: DonneesTransfert }, statut: 'traite' | 'ecarte'): Promise<void> {
  if (!m.ligneId) return;
  const { error } = await supabase.from('mails_agent' as never).update({ statut } as never).eq('id', m.ligneId);
  if (error) throw new Error(error.message);
  const chemins = (m.transfert?.pieces || []).map(p => p.chemin);
  if (chemins.length) {
    const { error: e } = await supabase.storage.from('mails-agent').remove(chemins);
    if (e) console.warn('[mails transférés] pièces non effacées :', e.message);
  }
}

const estExcel = (nom: string) => /\.(xlsx|xls|csv|ods)$/i.test(nom);

/**
 * Les fichiers à confier à l'analyse de document : un .eml reconstruit (texte
 * d'origine + PDF et autres pièces), et à côté les classeurs Excel, que
 * l'analyse lit à part — comme pour un .msg.
 */
export async function fichiersPourAnalyse(m: MailAgent & { transfert: DonneesTransfert }): Promise<File[]> {
  const pieces: { nom: string; type: string; octets: Uint8Array }[] = [];
  const excels: File[] = [];
  for (const p of m.transfert.pieces) {
    const { data, error } = await supabase.storage.from('mails-agent').download(p.chemin);
    if (error || !data) throw new Error(`Pièce jointe « ${p.nom} » illisible : ${error?.message ?? 'vide'}`);
    if (estExcel(p.nom)) excels.push(new File([data], p.nom, { type: p.type }));
    else pieces.push({ nom: p.nom, type: p.type, octets: new Uint8Array(await data.arrayBuffer()) });
  }
  const eml = emlSynthetique({ deNom: m.deNom, deEmail: m.deEmail, sujet: m.sujet, date: m.recuLe, texte: m.corps, pieces });
  const nom = (m.sujet || 'mail').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'mail';
  return [new File([eml], `${nom}.eml`, { type: 'message/rfc822' }), ...excels];
}
