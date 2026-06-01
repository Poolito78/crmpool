// Constantes partagées entre Devis.tsx et Parametres.tsx
// (évite l'import circulaire Parametres → Devis → App)

export const DEVIS_TABLE_COLS_DEF = [
  { key: 'numero',     label: 'Numéro',       align: 'left'  },
  { key: 'statut',     label: 'Statut',       align: 'left'  },
  { key: 'client',     label: 'Client',       align: 'left'  },
  { key: 'refAffaire', label: 'Réf. affaire', align: 'left'  },
  { key: 'systeme',    label: 'Système',      align: 'left'  },
  { key: 'date',       label: 'Date',         align: 'left'  },
  { key: 'validite',   label: 'Validité',     align: 'left'  },
  { key: 'totalHT',    label: 'Total HT',     align: 'right' },
  { key: 'marge',      label: 'Marge',        align: 'right' },
  { key: 'port',       label: 'Port HT',      align: 'right' },
  { key: 'reussite',   label: '% réussite',   align: 'right' },
  { key: 'realisation', label: 'Réalisation', align: 'left' },
] as const;

export type DevisTableColKey = typeof DEVIS_TABLE_COLS_DEF[number]['key'];
export const DEFAULT_DEVIS_TABLE_COLS: DevisTableColKey[] = ['numero', 'statut', 'client', 'refAffaire', 'date', 'totalHT'];
