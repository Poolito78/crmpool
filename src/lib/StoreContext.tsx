import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useStore } from './store';
import { useSocietes } from '@/hooks/useSocietes';
import { documentDeLaSociete } from './societes';

type StoreType = ReturnType<typeof useStore>;

const StoreContext = createContext<StoreType | null>(null);

type DocSociete = { id: string; societeId?: string; devisId?: string; commandeClientId?: string; factureOrigineId?: string };

/**
 * Un document NOUVEAU (absent de `prev`) sans société en reçoit une : celle
 * de son document d'origine s'il en a un (commande ← devis, facture ←
 * commande ou devis, avoir ← facture), sinon la société active. C'est le seul
 * endroit qui la pose : les quinze points de création de documents n'ont pas
 * à y penser.
 */
function tamponner<T extends DocSociete>(
  update: (fn: (prev: T[]) => T[]) => void,
  societeDe: (d: T) => string | undefined,
): (fn: (prev: T[]) => T[]) => void {
  return fn => update(prev => {
    const next = fn(prev);
    const connus = new Set(prev.map(x => x.id));
    let change = false;
    const out = next.map(x => {
      if (connus.has(x.id) || x.societeId) return x;
      const id = societeDe(x);
      if (!id) return x;
      change = true;
      return { ...x, societeId: id };
    });
    return change ? out : next;
  });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const { active, toutes, idIsosign, pourNouveau } = useSocietes();

  // Lus au moment de l'écriture, pas de la création des fonctions.
  const ref = useRef({ store, pourNouveau });
  ref.current = { store, pourNouveau };

  const tampons = useMemo(() => {
    const parDefaut = () => ref.current.pourNouveau?.id;
    const deDevis = (id?: string) => id ? ref.current.store.devis.find(d => d.id === id)?.societeId : undefined;
    const deCommande = (id?: string) => id ? ref.current.store.commandesClient.find(c => c.id === id)?.societeId : undefined;
    const deFacture = (id?: string) => id ? ref.current.store.facturesClient.find(f => f.id === id)?.societeId : undefined;
    return {
      updateDevis: tamponner(store.updateDevis, () => parDefaut()),
      updateCommandesClient: tamponner(store.updateCommandesClient, d => deDevis(d.devisId) ?? parDefaut()),
      updateCommandesFournisseur: tamponner(store.updateCommandesFournisseur, d => deDevis(d.devisId) ?? parDefaut()),
      updateFacturesClient: tamponner(store.updateFacturesClient,
        d => deFacture(d.factureOrigineId) ?? deCommande(d.commandeClientId) ?? deDevis(d.devisId) ?? parDefaut()),
      updateFacturesFournisseur: tamponner(store.updateFacturesFournisseur, () => parDefaut()),
    };
    // Les update* du store sont stables (useCallback sans dépendance).
  }, [store.updateDevis, store.updateCommandesClient, store.updateCommandesFournisseur, store.updateFacturesClient, store.updateFacturesFournisseur]);

  /* Multi-société : les documents se lisent dans la société active. Le filtre
     ne touche que ce que les pages LISENT ; les `updateXxx(prev => …)`
     reçoivent toujours la collection entière, donc rien n'est perdu à
     l'écriture. Clients et catalogue restent communs. Sans société chargée
     (migration absente) ou en « Toutes », rien n'est filtré. */
  const value = useMemo<StoreType>(() => {
    const base = { ...store, ...tampons };
    if (toutes || !active) return base;
    const id = active.id;
    const garder = <T extends { societeId?: string }>(l: T[]) => l.filter(d => documentDeLaSociete(d, id, idIsosign));
    return {
      ...base,
      devis: garder(store.devis),
      commandesClient: garder(store.commandesClient),
      commandesFournisseur: garder(store.commandesFournisseur),
      facturesClient: garder(store.facturesClient),
      facturesFournisseur: garder(store.facturesFournisseur),
    };
  }, [store, tampons, active, toutes, idIsosign]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useCRM() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useCRM must be used within StoreProvider');
  return ctx;
}
