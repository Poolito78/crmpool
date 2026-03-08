import React, { createContext, useContext } from 'react';
import { useStore } from './store';

type StoreType = ReturnType<typeof useStore>;

const StoreContext = createContext<StoreType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useCRM() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useCRM must be used within StoreProvider');
  return ctx;
}
