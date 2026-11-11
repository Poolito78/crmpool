/**
 * Liste des commandes OU des factures Odoo — EN LECTURE SEULE, sous la
 * pastille « Odoo » de Commandes Client et de Factures Client.
 *
 * ⚠️ Une facture Odoo n'est PAS une facture MonCRM : ni émission, ni
 * paiement, ni avoir ici — sans quoi la même vente aurait deux factures
 * légales. Un avoir Odoo s'affiche en négatif, marqué AVOIR.
 *
 * Les lignes viennent de la copie `ventes_odoo` (`ventesOdoo.ts`), regroupées
 * par commande (`documentsOdoo`). Aucune action : ni statut, ni AR, ni
 * facturation — une commande Odoo n'entre JAMAIS dans le circuit des
 * commandes MonCRM. Le total affiché est celui des lignes du périmètre lu
 * (Flooring), pas celui de la commande Odoo entière : l'écran le dit.
 * Un clic sur une commande déplie ses lignes.
 */
import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCRM } from '@/lib/StoreContext';
import { useCurrentUser } from '@/hooks/useAuth';
import { useCommercials } from '@/hooks/useCommercials';
import { formatDate, formatMontant } from '@/lib/store';
import { CLE_VENTES_ODOO, dansPerimetreOdoo, documentsOdoo, lireVentesOdoo } from '@/lib/ventesOdoo';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

const LIBELLES = {
  commande: { titre: "Commandes confirmées d'Odoo", unite: 'commande(s)', statut: 'Facturation', vide: "Aucune commande Odoo — import à lancer depuis l'Analyse (source « Commandes Odoo »)." },
  facture: { titre: "Factures et avoirs comptabilisés d'Odoo", unite: 'facture(s) / avoir(s)', statut: 'Paiement', vide: "Aucune facture Odoo — import à lancer depuis l'Analyse (source « Factures Odoo »)." },
};

export default function DocumentsOdooListe({ source, recherche }: { source: 'commande' | 'facture'; recherche: string }) {
  const t = LIBELLES[source];
  const { clients } = useCRM();
  const { isAdmin, userId } = useCurrentUser();
  const { commercials } = useCommercials();
  const ventes = useQuery({ queryKey: CLE_VENTES_ODOO, queryFn: lireVentesOdoo, staleTime: 5 * 60_000 });
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  const clientsParId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const moi = commercials.find(c => c.userId === userId)?.name || '';

  const documents = useMemo(() => {
    const docs = documentsOdoo((ventes.data ?? []).filter(l => dansPerimetreOdoo(l, isAdmin, moi)), source);
    const mots = recherche.trim().toLocaleLowerCase('fr').split(/\s+/).filter(Boolean);
    if (!mots.length) return docs;
    return docs.filter(d => {
      const c = d.clientId ? clientsParId.get(d.clientId) : undefined;
      const t = `${d.numero} ${d.partenaire} ${c?.societe || ''} ${c?.nom || ''} ${d.referenceAffaire} ${d.lignes.map(l => `${l.reference} ${l.designation}`).join(' ')}`.toLocaleLowerCase('fr');
      return mots.every(m => t.includes(m));
    });
  }, [ventes.data, isAdmin, moi, recherche, clientsParId, source]);

  const dernierImport = (ventes.data ?? []).reduce((m, l) => (l.importe_le && l.importe_le > m ? l.importe_le : m), '');
  const total = documents.reduce((s, d) => s + d.totalHT, 0);
  const basculer = (cle: string) => setOuverts(s => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <p className="text-xs text-muted-foreground">
        {t.titre}, <b>en lecture seule</b> — lignes <b>Flooring</b> seules, le total est celui de ces lignes.
        {' '}{documents.length} {t.unite}, {formatMontant(total)} HT.
        {dernierImport && ` Dernier import : ${new Date(dernierImport).toLocaleString('fr-FR')} (bouton « Importer d'Odoo » de l'Analyse).`}
      </p>
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">N° Odoo</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Réf. Affaire</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium text-right">Total HT Flooring</th>
              <th className="px-3 py-2 font-medium">{t.statut}</th>
              <th className="px-3 py-2 font-medium">Commercial</th>
            </tr>
          </thead>
          <tbody>
            {ventes.isLoading && (
              <tr><td colSpan={7} className="py-12 text-center text-muted-foreground"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Lecture de la copie Odoo…</td></tr>
            )}
            {ventes.error && (
              <tr><td colSpan={7} className="py-12 text-center text-destructive">Lecture impossible : {(ventes.error as Error).message}</td></tr>
            )}
            {!ventes.isLoading && !ventes.error && documents.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">{t.vide}</td></tr>
            )}
            {documents.map(d => {
              const c = d.clientId ? clientsParId.get(d.clientId) : undefined;
              const ouvert = ouverts.has(d.cle);
              return (
                <Fragment key={d.cle}>
                  <tr className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => basculer(d.cle)}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold whitespace-nowrap">
                      {ouvert ? <ChevronDown className="inline w-3.5 h-3.5 mr-1" /> : <ChevronRight className="inline w-3.5 h-3.5 mr-1" />}
                      {d.numero}
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-bold tracking-wide">ODOO</span>
                      {d.typeDocument === 'avoir' && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 font-bold tracking-wide">AVOIR</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{c ? (c.societe || c.nom) : d.partenaire}</div>
                      {c && c.nom !== c.societe && <div className="text-xs text-muted-foreground">{c.nom}</div>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.referenceAffaire || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{d.date ? formatDate(d.date) : '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${d.totalHT < 0 ? 'text-rose-600' : ''}`}>{formatMontant(d.totalHT)}</td>
                    <td className="px-3 py-2 text-xs">{d.statut || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.commercial || '—'}</td>
                  </tr>
                  {ouvert && d.lignes.map(l => (
                    <tr key={l.odoo_ligne_id} className="bg-muted/20 text-xs">
                      <td className="pl-9 pr-3 py-1 font-mono text-muted-foreground">{l.reference || ''}</td>
                      <td className="px-3 py-1" colSpan={3}>{l.designation}<span className="ml-2 text-muted-foreground">{l.categorie}</span></td>
                      <td className="px-3 py-1 text-right tabular-nums">{formatMontant(Number(l.total_ht) || 0)}</td>
                      <td className="px-3 py-1 tabular-nums" colSpan={2}>Qté {Number(l.quantite).toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
