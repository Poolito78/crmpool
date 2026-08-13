import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ── Nom d'affichage créateur ───────────────────────────────────────────────
// Stocké dans localStorage : { "email@example.com": "f.mouhot" }
const LS_KEY = 'crm_creator_names';

export function getCreatorNames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

export function setCreatorName(email: string, displayName: string) {
  const map = getCreatorNames();
  map[email] = displayName;
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

export function formatCreateur(emailOrName: string | undefined): string {
  if (!emailOrName) return '—';
  const map = getCreatorNames();
  return map[emailOrName] || emailOrName;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Concurrent {
  id: string;
  nom: string;
  siteWeb?: string;
  email?: string;
  telephone?: string;
  notes?: string;
  createdBy?: string;
  createdByEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConcurrentProduit {
  id: string;
  concurrentId: string;
  nom: string;
  reference?: string;
  categorie?: string;
  quantite?: number;
  quantiteUnite?: string;  // unité de la quantité (m², kg, L, U, seau…)
  prixHT?: number;
  prixUnite?: string;      // unité du prix de vente (€/m², €/kg, €/U…)
  description?: string;
  /** Article ISOSIGN équivalent — permet de comparer notre prix au leur. */
  produitId?: string;
  /** Affaire sur laquelle ce prix a été rencontré. */
  devisId?: string;
  clientId?: string;
  clientNom?: string;
  informateur?: string;
  dateRenseignement?: string;
  createdBy?: string;
  createdByEmail?: string;
  createdAt: string;
}

export interface ConcurrentNote {
  id: string;
  concurrentId: string;
  titre: string;
  contenu?: string;
  source?: string;
  dateNote: string;
  createdBy?: string;
  createdByEmail?: string;
  createdAt: string;
}

// ── DB mapping ─────────────────────────────────────────────────────────────

function dbToConcurrent(r: any): Concurrent {
  return {
    id: r.id,
    nom: r.nom,
    siteWeb: r.site_web || undefined,
    email: r.email || undefined,
    telephone: r.telephone || undefined,
    notes: r.notes || undefined,
    createdBy: r.created_by || undefined,
    createdByEmail: r.created_by_email || undefined,
    createdAt: r.created_at?.split('T')[0] || '',
    updatedAt: r.updated_at?.split('T')[0] || '',
  };
}

function concurrentToDb(c: Concurrent) {
  return {
    id: c.id,
    nom: c.nom,
    site_web: c.siteWeb || null,
    email: c.email || null,
    telephone: c.telephone || null,
    notes: c.notes || null,
    created_by: c.createdBy || null,
    created_by_email: c.createdByEmail || null,
  };
}

function dbToConcurrentProduit(r: any): ConcurrentProduit {
  return {
    id: r.id,
    concurrentId: r.concurrent_id,
    nom: r.nom,
    reference: r.reference || undefined,
    categorie: r.categorie || undefined,
    quantite: r.quantite != null ? Number(r.quantite) : undefined,
    quantiteUnite: r.quantite_unite || undefined,
    prixHT: r.prix_ht != null ? Number(r.prix_ht) : undefined,
    prixUnite: r.prix_unite || undefined,
    description: r.description || undefined,
    produitId: r.produit_id || undefined,
    devisId: r.devis_id || undefined,
    clientId: r.client_id || undefined,
    clientNom: r.client_nom || undefined,
    informateur: r.informateur || undefined,
    dateRenseignement: r.date_renseignement || undefined,
    createdBy: r.created_by || undefined,
    createdByEmail: r.created_by_email || undefined,
    createdAt: r.created_at?.split('T')[0] || '',
  };
}

function concurrentProduitToDb(p: ConcurrentProduit) {
  return {
    id: p.id,
    concurrent_id: p.concurrentId,
    nom: p.nom,
    reference: p.reference || null,
    categorie: p.categorie || null,
    prix_ht: p.prixHT ?? null,
    description: p.description || null,
    client_id: p.clientId || null,
    created_by: p.createdBy || null,
    created_by_email: p.createdByEmail || null,
    // Colonnes ajoutées via migration — incluses conditionnellement pour éviter
    // l'erreur PostgREST si la migration n'a pas encore été appliquée
    ...(p.clientNom !== undefined ? { client_nom: p.clientNom || null } : {}),
    ...(p.informateur !== undefined ? { informateur: p.informateur || null } : {}),
    ...(p.dateRenseignement !== undefined ? { date_renseignement: p.dateRenseignement || null } : {}),
    ...(p.quantite !== undefined ? { quantite: p.quantite ?? null } : {}),
    ...(p.quantiteUnite !== undefined ? { quantite_unite: p.quantiteUnite || null } : {}),
    ...(p.prixUnite !== undefined ? { prix_unite: p.prixUnite || null } : {}),
    ...(p.produitId !== undefined ? { produit_id: p.produitId || null } : {}),
    ...(p.devisId !== undefined ? { devis_id: p.devisId || null } : {}),
  };
}

function dbToConcurrentNote(r: any): ConcurrentNote {
  return {
    id: r.id,
    concurrentId: r.concurrent_id,
    titre: r.titre,
    contenu: r.contenu || undefined,
    source: r.source || undefined,
    dateNote: r.date_note || r.created_at?.split('T')[0] || '',
    createdBy: r.created_by || undefined,
    createdByEmail: r.created_by_email || undefined,
    createdAt: r.created_at?.split('T')[0] || '',
  };
}

function concurrentNoteToDb(n: ConcurrentNote) {
  return {
    id: n.id,
    concurrent_id: n.concurrentId,
    titre: n.titre,
    contenu: n.contenu || null,
    source: n.source || null,
    date_note: n.dateNote || null,
    created_by: n.createdBy || null,
    created_by_email: n.createdByEmail || null,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useConcurrents() {
  const [concurrents, setConcurrents] = useState<Concurrent[]>([]);
  const [produits, setProduits] = useState<ConcurrentProduit[]>([]);
  const [notes, setNotes] = useState<ConcurrentNote[]>([]);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<{ id: string; email: string } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      sessionRef.current = { id: session.user.id, email: session.user.email || '' };

      const [concRes, prodRes, noteRes] = await Promise.all([
        supabase.from('concurrents').select('*').order('nom'),
        supabase.from('concurrent_produits').select('*').order('nom'),
        supabase.from('concurrent_notes').select('*').order('date_note', { ascending: false }),
      ]);

      if (concRes.data) setConcurrents(concRes.data.map(dbToConcurrent));
      if (prodRes.data) setProduits(prodRes.data.map(dbToConcurrentProduit));
      if (noteRes.data) setNotes(noteRes.data.map(dbToConcurrentNote));
      setLoading(false);
    }
    load();
  }, []);

  // ── Concurrents CRUD ──

  const addConcurrent = useCallback(async (c: Omit<Concurrent, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'createdByEmail'>) => {
    const session = sessionRef.current;
    if (!session) return null;
    const newC: Concurrent = {
      ...c,
      id: crypto.randomUUID(),
      createdBy: session.id,
      createdByEmail: session.email,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };
    const { error } = await supabase.from('concurrents').insert(concurrentToDb(newC) as any);
    if (!error) setConcurrents(prev => [...prev, newC].sort((a, b) => a.nom.localeCompare(b.nom)));
    return error ? null : newC;
  }, []);

  const updateConcurrent = useCallback(async (c: Concurrent) => {
    const updated = { ...c, updatedAt: new Date().toISOString().split('T')[0] };
    const { error } = await supabase.from('concurrents').update(concurrentToDb(updated) as any).eq('id', c.id);
    if (!error) setConcurrents(prev => prev.map(x => x.id === c.id ? updated : x));
    return error;
  }, []);

  const deleteConcurrent = useCallback(async (id: string) => {
    const { error } = await supabase.from('concurrents').delete().eq('id', id);
    if (!error) {
      setConcurrents(prev => prev.filter(x => x.id !== id));
      setProduits(prev => prev.filter(x => x.concurrentId !== id));
      setNotes(prev => prev.filter(x => x.concurrentId !== id));
    }
    return error;
  }, []);

  // ── Produits CRUD ──

  const addProduit = useCallback(async (p: Omit<ConcurrentProduit, 'id' | 'createdAt' | 'createdBy' | 'createdByEmail'>) => {
    const session = sessionRef.current;
    if (!session) return null;
    const newP: ConcurrentProduit = {
      ...p,
      id: crypto.randomUUID(),
      createdBy: session.id,
      createdByEmail: session.email,
      createdAt: new Date().toISOString().split('T')[0],
    };
    const { error } = await supabase.from('concurrent_produits').insert(concurrentProduitToDb(newP) as any);
    if (!error) setProduits(prev => [...prev, newP].sort((a, b) => a.nom.localeCompare(b.nom)));
    return error ? null : newP;
  }, []);

  const updateProduit = useCallback(async (p: ConcurrentProduit) => {
    const { error } = await supabase.from('concurrent_produits').update(concurrentProduitToDb(p) as any).eq('id', p.id);
    if (!error) setProduits(prev => prev.map(x => x.id === p.id ? p : x));
    return error;
  }, []);

  const deleteProduit = useCallback(async (id: string) => {
    const { error } = await supabase.from('concurrent_produits').delete().eq('id', id);
    if (!error) setProduits(prev => prev.filter(x => x.id !== id));
    return error;
  }, []);

  // ── Notes CRUD ──

  const addNote = useCallback(async (n: Omit<ConcurrentNote, 'id' | 'createdAt' | 'createdBy' | 'createdByEmail'>) => {
    const session = sessionRef.current;
    if (!session) return null;
    const newN: ConcurrentNote = {
      ...n,
      id: crypto.randomUUID(),
      createdBy: session.id,
      createdByEmail: session.email,
      createdAt: new Date().toISOString().split('T')[0],
    };
    const { error } = await supabase.from('concurrent_notes').insert(concurrentNoteToDb(newN) as any);
    if (!error) setNotes(prev => [newN, ...prev]);
    return error ? null : newN;
  }, []);

  const updateNote = useCallback(async (n: ConcurrentNote) => {
    const { error } = await supabase.from('concurrent_notes').update(concurrentNoteToDb(n) as any).eq('id', n.id);
    if (!error) setNotes(prev => prev.map(x => x.id === n.id ? n : x));
    return error;
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    const { error } = await supabase.from('concurrent_notes').delete().eq('id', id);
    if (!error) setNotes(prev => prev.filter(x => x.id !== id));
    return error;
  }, []);

  return {
    concurrents, produits, notes, loading,
    addConcurrent, updateConcurrent, deleteConcurrent,
    addProduit, updateProduit, deleteProduit,
    addNote, updateNote, deleteNote,
  };
}

// ── Veille rattachée aux articles ──────────────────────────────────────────

/** Un relevé concurrent, accompagné du nom du concurrent. */
export interface ReleveVeille extends ConcurrentProduit {
  concurrentNom: string;
}

/**
 * Relevés de veille indexés par article ISOSIGN.
 *
 * Sert au chiffrage : quand on saisit une ligne de devis, on veut savoir sur
 * le champ à combien le concurrent se positionne sur cet article. On ne charge
 * que les relevés effectivement rattachés — les autres n'ont rien à dire sur
 * un article précis — et une seule fois par session.
 */
export function useVeilleParProduit() {
  const [parProduit, setParProduit] = useState<Map<string, ReleveVeille[]>>(new Map());

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data, error } = await supabase
        .from('concurrent_produits')
        .select('*, concurrents(nom)')
        .not('produit_id', 'is', null);
      if (annule) return;
      if (error) {
        // Colonne absente si la migration n'est pas passée : le devis doit
        // continuer de fonctionner sans la veille.
        console.warn('[veille par produit]', error.message);
        return;
      }
      const map = new Map<string, ReleveVeille[]>();
      for (const r of (data || []) as any[]) {
        const releve: ReleveVeille = {
          ...dbToConcurrentProduit(r),
          concurrentNom: r.concurrents?.nom || '',
        };
        if (!releve.produitId) continue;
        const lot = map.get(releve.produitId);
        if (lot) lot.push(releve); else map.set(releve.produitId, [releve]);
      }
      // Le plus récent d'abord : c'est celui qui compte quand on chiffre.
      for (const lot of map.values()) {
        lot.sort((a, b) => (b.dateRenseignement || b.createdAt || '')
          .localeCompare(a.dateRenseignement || a.createdAt || ''));
      }
      setParProduit(map);
    })();
    return () => { annule = true; };
  }, []);

  return parProduit;
}
