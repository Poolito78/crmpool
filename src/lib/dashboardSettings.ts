import { useSyncExternalStore } from 'react';

// ─── Réglages d'affichage des tuiles du Tableau de bord ───────────────────────
// On stocke la liste des tuiles MASQUÉES (par id). Ainsi toute nouvelle tuile
// ajoutée plus tard est visible par défaut.

export type DashboardTileId =
  | 'stat-clients'
  | 'stat-produits'
  | 'stat-fournisseurs'
  | 'stat-devis'
  | 'stat-ca'
  | 'stat-marge-annuelle'
  | 'stat-marge-mensuelle'
  | 'stat-stock-bas'
  | 'stat-concurrents'
  | 'alerte-commandes'
  | 'alerte-relances'
  | 'encours-fourn-fdm'
  | 'encours-client-fdm'
  | 'panel-echeances-fourn'
  | 'panel-derniers-devis'
  | 'panel-alertes-stock'
  | 'panel-veille';

export interface DashboardTileDef {
  id: DashboardTileId;
  label: string;
  group: 'Indicateurs' | 'Alertes' | 'Encours fin de mois' | 'Panneaux';
}

export const DASHBOARD_TILES: DashboardTileDef[] = [
  { id: 'stat-clients',          label: 'Clients',                 group: 'Indicateurs' },
  { id: 'stat-produits',         label: 'Produits',                group: 'Indicateurs' },
  { id: 'stat-fournisseurs',     label: 'Fournisseurs',            group: 'Indicateurs' },
  { id: 'stat-devis',            label: 'Devis',                   group: 'Indicateurs' },
  { id: 'stat-ca',               label: 'CA Accepté HT',           group: 'Indicateurs' },
  { id: 'stat-marge-annuelle',   label: 'Marge annuelle',          group: 'Indicateurs' },
  { id: 'stat-marge-mensuelle',  label: 'Marge mensuelle',         group: 'Indicateurs' },
  { id: 'stat-stock-bas',        label: 'Stock bas',               group: 'Indicateurs' },
  { id: 'stat-concurrents',      label: 'Concurrents suivis',      group: 'Indicateurs' },
  { id: 'alerte-commandes',      label: 'Alerte commandes à traiter', group: 'Alertes' },
  { id: 'alerte-relances',       label: 'Alerte relances CRM',     group: 'Alertes' },
  { id: 'encours-fourn-fdm',     label: 'À payer — fournisseurs',  group: 'Encours fin de mois' },
  { id: 'encours-client-fdm',    label: 'À encaisser — clients',   group: 'Encours fin de mois' },
  { id: 'panel-echeances-fourn', label: 'Échéances fournisseurs',  group: 'Panneaux' },
  { id: 'panel-derniers-devis',  label: 'Derniers devis',          group: 'Panneaux' },
  { id: 'panel-alertes-stock',   label: 'Alertes stock',           group: 'Panneaux' },
  { id: 'panel-veille',          label: 'Veille concurrence',      group: 'Panneaux' },
];

const STORAGE_KEY = 'crm_dashboard_tiles_hidden';

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '[]';
  } catch {
    return '[]';
  }
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function getHiddenTiles(): DashboardTileId[] {
  try {
    return JSON.parse(readRaw()) as DashboardTileId[];
  } catch {
    return [];
  }
}

export function setHiddenTiles(ids: DashboardTileId[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  emit();
}

export function toggleTile(id: DashboardTileId) {
  const hidden = getHiddenTiles();
  if (hidden.includes(id)) setHiddenTiles(hidden.filter(x => x !== id));
  else setHiddenTiles([...hidden, id]);
}

export function showAllTiles() {
  setHiddenTiles([]);
}

/** Hook réactif : renvoie l'ensemble des ids masqués (Set). */
export function useHiddenTiles(): Set<DashboardTileId> {
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    window.addEventListener('storage', cb);
    return () => {
      listeners.delete(cb);
      window.removeEventListener('storage', cb);
    };
  };
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  try {
    return new Set(JSON.parse(raw) as DashboardTileId[]);
  } catch {
    return new Set();
  }
}
