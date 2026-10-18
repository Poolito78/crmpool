/**
 * PDF « marquage au sol » du Chiffrage ISOSIGN, joint d'office au devis créé.
 *
 * Le Chiffrage (page locale http://127.0.0.1:8765, servie par
 * « Chiffrage ISOSIGN.bat ») ouvre MonCRM sur `?analyse=1#texte=…` et produit
 * en parallèle le PDF du métré : plan annoté + résumé. Ce PDF devait ensuite
 * être glissé à la main dans « Notes & Fichiers » du devis.
 *
 * Désormais :
 *   1. MonCRM, ouvert par le Chiffrage, lui signale qu'il est prêt
 *      (`moncrm-pret`, à `window.opener`) ;
 *   2. le Chiffrage répond par le PDF (`chiffrage-pdf`, octets transférés) —
 *      accepté SEULEMENT d'une origine locale :87xx, celle du Chiffrage ;
 *   3. à la création du devis par l'analyse, le fichier est déposé dans le
 *      bucket `devis-pj` et inscrit dans `devis_pieces_jointes`, comme
 *      « Joindre un fichier » (`DevisChatter.handleUpload`).
 *
 * Le fichier est pris UNE fois (`prendreFichierChiffrage`) : une seconde
 * analyse dans la même session ne le rattache pas à un autre devis.
 */
import { supabase } from '@/integrations/supabase/client';

/** Le Chiffrage tourne en local ; serve.py prend le premier port libre de 8765 à 8789. */
const ORIGINE_CHIFFRAGE = /^http:\/\/(127\.0\.0\.1|localhost):87[6-8]\d$/;

let fichier: File | null = null;

export function origineChiffrageValide(origine: string): boolean {
  return ORIGINE_CHIFFRAGE.test(origine);
}

/** À appeler au démarrage quand MonCRM est ouvert par le Chiffrage (`?analyse=1`). */
export function ecouterDepotChiffrage(): void {
  window.addEventListener('message', (e: MessageEvent) => {
    if (!origineChiffrageValide(e.origin)) return;
    const d = e.data as { type?: string; nom?: unknown; buffer?: unknown } | null;
    if (!d || d.type !== 'chiffrage-pdf' || !(d.buffer instanceof ArrayBuffer)) return;
    const nom = String(d.nom || 'marquage au sol.pdf').slice(0, 180);
    fichier = new File([d.buffer], nom, { type: 'application/pdf' });
  });
  /* « prêt » : sans donnée, l'origine de la fenêtre qui l'a ouvert importe peu. */
  try { window.opener?.postMessage({ type: 'moncrm-pret' }, '*'); } catch { /* fenêtre sans opener */ }
}

/** Le PDF reçu, retiré du dépôt (une seule pièce jointe par envoi). */
export function prendreFichierChiffrage(): File | null {
  const f = fichier;
  fichier = null;
  return f;
}

/** Dépose le fichier dans les pièces jointes du devis (bucket privé, URL signée 10 ans). */
export async function joindreAuDevis(devisId: string, file: File): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('utilisateur non connecté');
  const path = `${user.id}/${devisId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: upErr } = await supabase.storage.from('devis-pj').upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { data: signe } = await supabase.storage.from('devis-pj').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  const { error: dbErr } = await supabase.from('devis_pieces_jointes').insert({
    user_id: user.id,
    devis_id: devisId,
    type: 'fichier',
    fichier_nom: file.name,
    fichier_url: signe?.signedUrl ?? path,
    fichier_taille: file.size,
    fichier_mime: file.type,
    confidentiel: false,
  });
  if (dbErr) throw new Error(dbErr.message);
}
