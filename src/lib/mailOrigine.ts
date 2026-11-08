/**
 * mailOrigine.ts — LE DEVIS RÉPOND AU MAIL DU CLIENT.
 *
 * Un devis né d'une demande partait en nouveau mail : « Devis DEV-2026-180 —
 * TOP SIGNALISATION — DS SMITH », là où le client attendait la suite de son
 * « devis ds smith ». L'analyse retient donc le mail d'origine, et l'envoi
 * prépare une réponse : « RE: », `In-Reply-To` / `References`, message cité
 * sous la signature.
 *
 * ⚠️ **C'EST UN BROUILLON .eml, PAS LA COMMANDE « RÉPONDRE » D'OUTLOOK** : le
 * fil se suit chez le client et dans la conversation, mais Outlook ne pose pas
 * sa flèche « répondu » sur le mail d'origine.
 *
 * Rangé dans ce navigateur, par devis : c'est là que le .eml se fabrique, sur le
 * PC d'Outlook. Un devis sans mail retenu part en nouveau mail, comme avant.
 */
import { lireMsg } from './lireMsg';

export interface MailOrigine {
  sujet: string;
  expediteurNom: string;
  adresse: string;
  /** « 06/11/2026 11:02 », lu dans le nom du .msg exporté par la macro. */
  date?: string;
  /** Message-ID d'origine, chevrons compris. */
  messageId?: string;
  corps: string;
}

const CLE = 'devis_mail_origine:';
/** Une citation n'a pas à saturer le stockage du navigateur. */
const CORPS_MAX = 20000;

/** « 20261106-1102 - devis ds smith.msg » → « 06/11/2026 11:02 ». */
export function dateDepuisNomMsg(nom: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2}) - /.exec(nom);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : undefined;
}

/** Le mail d'origine lu dans un .msg ; `null` s'il ne dit pas à qui répondre. */
export async function mailOrigineDeMsg(fichier: File): Promise<MailOrigine | null> {
  try {
    const m = await lireMsg(fichier);
    if (!m.expediteurAdresse) return null;
    return {
      sujet: m.sujet,
      expediteurNom: m.expediteurNom,
      adresse: m.expediteurAdresse,
      date: dateDepuisNomMsg(fichier.name),
      messageId: m.messageId,
      corps: m.corps.slice(0, CORPS_MAX),
    };
  } catch {
    return null;
  }
}

export function retenirMailOrigine(devisId: string, origine: MailOrigine): void {
  try { localStorage.setItem(CLE + devisId, JSON.stringify(origine)); } catch { /* le devis partira en nouveau mail */ }
}

export function mailOrigineDuDevis(devisId: string): MailOrigine | null {
  try {
    const brut = localStorage.getItem(CLE + devisId);
    return brut ? JSON.parse(brut) as MailOrigine : null;
  } catch {
    return null;
  }
}

/** L'objet de la réponse. Un « RE: » déjà là n'est pas redoublé. */
export const objetReponse = (sujet: string): string =>
  /^\s*re\s*:/i.test(sujet) ? sujet.trim() : `RE: ${sujet.trim()}`;

/** Les en-têtes qui rattachent le mail au fil du client. */
export function entetesReponse(o: Pick<MailOrigine, 'messageId'>): string[] {
  const id = o.messageId?.trim();
  return id ? [`In-Reply-To: ${id}`, `References: ${id}`] : [];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Le message cité sous la réponse, présenté comme le fait Outlook. */
export function citationHtml(o: MailOrigine): string {
  const de = o.expediteurNom ? `${esc(o.expediteurNom)} &lt;${esc(o.adresse)}&gt;` : esc(o.adresse);
  const lignes = [
    `<b>De :</b> ${de}`,
    ...(o.date ? [`<b>Envoyé :</b> ${esc(o.date)}`] : []),
    `<b>Objet :</b> ${esc(o.sujet)}`,
  ];
  return `<br><hr style="border:none;border-top:1px solid #b5c4df"><div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${lignes.join('<br>')}<br><br>${esc(o.corps).replace(/\r?\n/g, '<br>')}</div>`;
}
