import { supabase } from '@/integrations/supabase/client';

/**
 * LES DOSSIERS ODOO CITÉS DANS UN MAIL, OUVERTS D'UN CLIC.
 *
 * « Re: ACHAT P29317- AF041510 » (Quartz Résines Minéraux, 06/11/2026) nomme
 * une commande d'achat et un devis client : il fallait recopier chaque numéro
 * dans la recherche d'Odoo. On les reconnaît ici, et un clic ouvre la fiche.
 *
 * Seules les formes d'ISOSIGN sont lues — on ne devine pas : AF + 6 chiffres
 * (devis / commande client, `sale.order`), P + 5 chiffres (commande
 * d'achat, `purchase.order`). « P50 », « P25 » (profils de panneaux) n'ont pas
 * cinq chiffres et ne sont pas pris.
 *
 * Le navigateur ne connaît pas l'identifiant Odoo d'un numéro : la fonction
 * `odoo-devis-mails` (mode `ouvrir`, LECTURE SEULE) le retrouve et rend le
 * lien de la fiche. Sans elle (pas encore déployée, Odoo muet), la liste du
 * modèle s'ouvre et le numéro part dans le presse-papiers, à coller dans la
 * recherche.
 */

export type ModeleOdoo = 'sale.order' | 'purchase.order';

export interface NumeroOdoo {
  numero: string;
  modele: ModeleOdoo;
}

/** Adresse de l'Odoo d'ISOSIGN, pour le repli (la fonction rend son propre lien). */
export const ODOO_WEB = 'https://www.odoo-sign.fr';

export const LIBELLE_MODELE: Record<ModeleOdoo, string> = {
  'sale.order': 'devis / commande client',
  'purchase.order': 'commande d\'achat',
};

/** Les numéros AF… et P… d'un texte, dans l'ordre, sans doublon. */
export function numerosOdooCites(texte: string): NumeroOdoo[] {
  const t = String(texte || '').toUpperCase();
  const trouves: { pos: number; n: NumeroOdoo }[] = [];
  for (const m of t.matchAll(/(?<![A-Z0-9])AF[\s-]?(\d{6})(?![0-9])/g)) {
    trouves.push({ pos: m.index ?? 0, n: { numero: `AF${m[1]}`, modele: 'sale.order' } });
  }
  for (const m of t.matchAll(/(?<![A-Z0-9])P[\s-]?(\d{5})(?![0-9])/g)) {
    trouves.push({ pos: m.index ?? 0, n: { numero: `P${m[1]}`, modele: 'purchase.order' } });
  }
  const vus = new Set<string>();
  return trouves.sort((a, b) => a.pos - b.pos).map(x => x.n)
    .filter(n => !vus.has(n.numero) && vus.add(n.numero) !== undefined);
}

/** Les liens déjà retrouvés : un second clic n'interroge plus Odoo. */
const connus = new Map<string, string>();

/**
 * Ouvre la fiche Odoo d'un numéro dans un nouvel onglet.
 *
 * L'onglet s'ouvre AVANT la question à Odoo : ouvert après une attente, le
 * navigateur le prendrait pour une fenêtre surgissante et le bloquerait.
 * Rend ce qui s'est passé, pour que l'écran le dise.
 */
export async function ouvrirDansOdoo(n: NumeroOdoo): Promise<'ouvert' | 'introuvable' | 'liste' | 'a-deployer'> {
  const deja = connus.get(n.numero);
  if (deja) { window.open(deja, '_blank', 'noopener'); return 'ouvert'; }
  const onglet = window.open('', '_blank');
  try {
    const { data, error } = await supabase.functions.invoke('odoo-devis-mails', {
      body: { mode: 'ouvrir', numeros: [n] },
    });
    /* Une fonction d'avant le mode « ouvrir » répond « date depuis attendue »
       (400) : ce n'est pas Odoo qui est muet, c'est la fonction à redéployer. */
    if (!data?.liens) {
      const ancienne = !!error && /400|non-2xx/i.test(error.message || '');
      throw Object.assign(new Error(error?.message || data?.erreur || 'réponse inattendue'), { ancienne });
    }
    const lien: string | null = data.liens[n.numero] ?? null;
    if (!lien) { onglet?.close(); return 'introuvable'; }
    connus.set(n.numero, lien);
    if (onglet) onglet.location.href = lien; else window.open(lien, '_blank', 'noopener');
    return 'ouvert';
  } catch (e) {
    /* Fonction pas encore déployée ou Odoo muet : la liste du modèle, et le
       numéro prêt à coller dans sa recherche. */
    try { await navigator.clipboard.writeText(n.numero); } catch { /* le numéro reste affiché */ }
    const liste = `${ODOO_WEB}/web#model=${n.modele}&view_type=list`;
    if (onglet) onglet.location.href = liste; else window.open(liste, '_blank', 'noopener');
    return (e as { ancienne?: boolean }).ancienne ? 'a-deployer' : 'liste';
  }
}
