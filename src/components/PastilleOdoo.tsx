/**
 * Le n° du devis Odoo à côté de celui du CRM (« DEV-2026-186 · AF042095 »).
 *
 * VERT seulement si le montant HT lu chez Odoo est celui du devis CRM au
 * centime près (vérifié à la création, puis à chaque ouverture du mail
 * d'envoi). Orange : écart, dit au survol. Gris : montant Odoo jamais lu.
 * Un clic ouvre la commande dans Odoo.
 */
import { ExternalLink } from 'lucide-react';
import { type Devis, calculerTotalDevis, formatMontant } from '@/lib/store';
import { ODOO_WEB } from '@/lib/numerosOdoo';
import { ECART_TOLERE } from '@/lib/devisOdooEnvoi';

export default function PastilleOdoo({ devis }: { devis: Devis }) {
  const o = devis.odoo;
  if (!o?.numero) return null;
  const crm = calculerTotalDevis(devis.lignes, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20).totalHT;
  const ecart = o.montantHT !== undefined ? Math.round((o.montantHT - crm) * 100) / 100 : undefined;
  const verifie = ecart !== undefined && Math.abs(ecart) <= ECART_TOLERE;
  const couleur = verifie
    ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
    : ecart !== undefined
      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
      : 'bg-muted text-muted-foreground border-border';
  const titre = verifie
    ? `Devis Odoo ${o.numero} — montant identique (${formatMontant(crm)} HT)`
    : ecart !== undefined
      ? `Devis Odoo ${o.numero} — ÉCART : Odoo ${formatMontant(o.montantHT!)} HT, CRM ${formatMontant(crm)} HT`
      : `Devis Odoo ${o.numero} — montant non vérifié`;
  const lien = o.id
    ? `${ODOO_WEB}/web#id=${o.id}&model=sale.order&view_type=form`
    : `${ODOO_WEB}/web#model=sale.order&view_type=list`;
  return (
    <a href={lien} target="_blank" rel="noopener noreferrer" title={titre} onClick={e => e.stopPropagation()}
       className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono font-semibold hover:opacity-80 ${couleur}`}>
      {o.numero}{verifie ? ' ✓' : ecart !== undefined ? ' ≠' : ''}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}
