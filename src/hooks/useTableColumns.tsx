import { useState, useRef, useCallback, type CSSProperties } from 'react';

// Hook réutilisable : largeur (resize) + ordre (drag) des colonnes d'un tableau.
// Persistance localStorage sous `${storageKey}_widths` et `${storageKey}_order`.

export interface UseTableColumnsResult<K extends string> {
  /** Ordre courant des clés (toutes colonnes connues, visibles ou non). */
  order: K[];
  /** Largeurs custom par clé (px). Absence = auto. */
  widths: Record<string, number>;
  /** Renvoie la liste ordonnée filtrée par un prédicat de visibilité. */
  ordered: <T extends { key: K }>(all: readonly T[], isVisible?: (k: K) => boolean) => T[];
  /** Style à appliquer sur <th>/<td> pour une largeur fixe (ou undefined). */
  widthStyle: (key: K) => CSSProperties | undefined;
  /** Props à étaler sur le <th> pour activer resize + reorder. */
  thProps: (key: K) => {
    'data-col': K;
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Props pour la poignée de resize (un <div> en bordure droite du th). */
  resizeHandleProps: (key: K) => {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onDoubleClick: () => void;
  };
  /** Clé en cours de drag (pour styliser la source). */
  dragKey: K | null;
  /** Clé survolée pendant le drag (pour styliser la cible). */
  dragOverKey: K | null;
  /** true pendant un resize (pour désactiver le drag du th). */
  isResizing: boolean;
  /** Réinitialise ordre + largeurs. */
  reset: () => void;
  /** Ajuste chaque colonne visible à son contenu le plus large (en-tête
   *  compris) et l'enregistre comme un redimensionnement manuel. `el` = le
   *  <table> ou n'importe quel élément qu'il contient (la roue crantée). */
  autoFit: (el: Element | null | undefined) => void;
}

/* Bornes de l'ajustement automatique : en dessous, la colonne n'est plus
   saisissable par sa poignée (même plancher que le resize à la souris) ;
   au-dessus, une description de 200 caractères mangerait tout l'écran. */
const AUTOFIT_MIN = 50;
const AUTOFIT_MAX = 480;
const AUTOFIT_CLASS = 'col-autofit-measure';

/* Feuille de style de mesure, injectée une seule fois. Posée sur le <table>
   le temps d'une lecture, elle laisse chaque colonne prendre la largeur de
   son contenu sur une ligne : largeurs inline, max-w-[…] et troncatures
   neutralisées (!important l'emporte sur le style inline posé par React).
   Les lignes de détail dépliées (une cellule en colSpan) sont masquées :
   leur contenu se répartirait sur les colonnes qu'elles couvrent. */
function ensureAutoFitStyle() {
  if (typeof document === 'undefined' || document.getElementById(AUTOFIT_CLASS)) return;
  const el = document.createElement('style');
  el.id = AUTOFIT_CLASS;
  el.textContent = `
    table.${AUTOFIT_CLASS} { width: max-content !important; table-layout: auto !important; }
    table.${AUTOFIT_CLASS} > * > tr > th, table.${AUTOFIT_CLASS} > * > tr > td {
      width: auto !important; min-width: 0 !important; max-width: none !important; white-space: nowrap !important;
    }
    table.${AUTOFIT_CLASS} > * > tr > :is(th, td) > * { max-width: none !important; }
    table.${AUTOFIT_CLASS} > tbody > tr:has(> td[colspan]) { display: none !important; }
  `;
  document.head.appendChild(el);
}

export function useTableColumns<K extends string>(
  storageKey: string,
  allKeys: readonly K[],
): UseTableColumnsResult<K> {
  const widthsKey = `${storageKey}_widths`;
  const orderKey = `${storageKey}_order`;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try { const s = localStorage.getItem(widthsKey); if (s) return JSON.parse(s); } catch { /* ignore */ }
    return {};
  });

  const [order, setOrder] = useState<K[]>(() => {
    try {
      const s = localStorage.getItem(orderKey);
      if (s) {
        const saved = (JSON.parse(s) as K[]).filter(k => allKeys.includes(k));
        /* UNE COLONNE NOUVELLE SE RANGE À CÔTÉ DE SA VOISINE, pas au bout.
           La colonne « Origine », déclarée juste après « Réf. », tombait en
           dix-septième position chez quiconque avait déjà un ordre
           enregistré. On l'insère après la colonne qui la précède dans la
           déclaration — ou en tête si elle ouvre la liste. */
        const ordre = [...saved];
        allKeys.forEach((k, i) => {
          if (ordre.includes(k)) return;
          const avant = allKeys.slice(0, i).reverse().find(x => ordre.includes(x));
          ordre.splice(avant ? ordre.indexOf(avant) + 1 : 0, 0, k);
        });
        return ordre;
      }
    } catch { /* ignore */ }
    return [...allKeys];
  });

  const [dragKey, setDragKey] = useState<K | null>(null);
  const [dragOverKey, setDragOverKey] = useState<K | null>(null);
  const resizingRef = useRef<{ key: K; startX: number; startW: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const persistWidths = useCallback((w: Record<string, number>) => {
    try { localStorage.setItem(widthsKey, JSON.stringify(w)); } catch { /* ignore */ }
  }, [widthsKey]);
  const persistOrder = useCallback((o: K[]) => {
    try { localStorage.setItem(orderKey, JSON.stringify(o)); } catch { /* ignore */ }
  }, [orderKey]);

  const ordered = useCallback(<T extends { key: K }>(all: readonly T[], isVisible?: (k: K) => boolean): T[] => {
    return order
      .map(k => all.find(c => c.key === k))
      .filter((c): c is T => !!c && (!isVisible || isVisible(c.key)));
  }, [order]);

  const widthStyle = useCallback((key: K): CSSProperties | undefined => {
    const w = widths[key];
    return w ? { width: w, minWidth: w, maxWidth: w } : undefined;
  }, [widths]);

  const startResize = useCallback((e: React.MouseEvent, key: K, currentW: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: currentW };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const w = Math.max(50, Math.round(r.startW + (ev.clientX - r.startX)));
      setWidths(prev => ({ ...prev, [r.key]: w }));
    };
    const onUp = () => {
      resizingRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setWidths(prev => { persistWidths(prev); return prev; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [persistWidths]);

  const resetWidth = useCallback((key: K) => {
    setWidths(prev => { const n = { ...prev }; delete n[key]; persistWidths(n); return n; });
  }, [persistWidths]);

  const doReorder = useCallback((targetKey: K) => {
    setDragKey(dk => {
      if (!dk || dk === targetKey) return null;
      setOrder(prev => {
        const next = [...prev];
        const from = next.indexOf(dk);
        const to = next.indexOf(targetKey);
        if (from === -1 || to === -1) return prev;
        next.splice(from, 1);
        next.splice(to, 0, dk);
        persistOrder(next);
        return next;
      });
      return null;
    });
    setDragOverKey(null);
  }, [persistOrder]);

  const thProps = useCallback((key: K) => ({
    // Repère lu par autoFit pour retrouver la colonne d'un <th>.
    'data-col': key,
    draggable: !isResizing,
    onDragStart: (e: React.DragEvent) => { setDragKey(key); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', key); } catch { /* ignore */ } },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(prev => prev === key ? prev : key); },
    onDragLeave: () => { setDragOverKey(prev => prev === key ? null : prev); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); doReorder(key); },
    onDragEnd: () => { setDragKey(null); setDragOverKey(null); },
  }), [isResizing, doReorder]);

  const resizeHandleProps = useCallback((key: K) => ({
    draggable: false,
    onDragStart: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
    onMouseDown: (e: React.MouseEvent) => {
      const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement | null;
      startResize(e, key, widths[key] || th?.offsetWidth || 120);
    },
    onDoubleClick: () => resetWidth(key),
  }), [startResize, resetWidth, widths]);

  const reset = useCallback(() => {
    setOrder([...allKeys]);
    setWidths({});
    persistOrder([...allKeys]);
    try { localStorage.removeItem(widthsKey); } catch { /* ignore */ }
  }, [allKeys, persistOrder, widthsKey]);

  /* AJUSTER LES COLONNES : on ne mesure pas les textes un à un (polices,
     icônes, badges…), on laisse le navigateur faire. Classe de mesure posée,
     le tableau se met en largeur « max-content » : chaque <th> prend alors
     la largeur de la cellule la plus large de sa colonne. Lecture faite, la
     classe est retirée dans la même tâche — aucun rendu intermédiaire n'est
     peint, l'écran ne clignote pas. */
  const autoFit = useCallback((el: Element | null | undefined) => {
    const table = el?.closest('table');
    if (!table) return;
    ensureAutoFitStyle();
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>(':scope > thead > tr > th[data-col]'));
    if (ths.length === 0) return;
    table.classList.add(AUTOFIT_CLASS);
    const mesures: Record<string, number> = {};
    try {
      for (const th of ths) {
        const key = th.dataset.col;
        if (!key || !allKeys.includes(key as K)) continue;
        // +2 px : l'arrondi au pixel ne doit pas faire réapparaître les « … ».
        const w = Math.ceil(th.getBoundingClientRect().width) + 2;
        mesures[key] = Math.min(AUTOFIT_MAX, Math.max(AUTOFIT_MIN, w));
      }
    } finally {
      table.classList.remove(AUTOFIT_CLASS);
    }
    // Les colonnes masquées gardent leur largeur enregistrée.
    setWidths(prev => { const n = { ...prev, ...mesures }; persistWidths(n); return n; });
  }, [allKeys, persistWidths]);

  return { order, widths, ordered, widthStyle, thProps, resizeHandleProps, dragKey, dragOverKey, isResizing, reset, autoFit };
}
