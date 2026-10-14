import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Prix appris d'une offre réellement envoyée, par CLIENT et par référence.
 *
 * ⚠️ **LE CONTRAT N'EST PAS TOUJOURS LE PRIX PRATIQUÉ.** Le contrat-cadre
 * « CCI10034 R4 - PROMO AGILIS » cote le gabarit SFGAB168 à 8,25 € — le prix
 * du gabarit 60-140 —, quand l'offre AF039468 l'a facturé 35,30 € (grille
 * R4). Le CRM suivait fidèlement le contrat et l'écart revenait à chaque
 * chiffrage : la comparaison le montrait, l'apprentissage ne le retenait pas.
 *
 * « Apprendre de ce devis » (`ComparaisonDevisRealise`) retient donc, pour le
 * client du devis comparé, le prix unitaire de l'offre de chaque référence
 * dont le prix diffère. Le chiffrage suivant du même client le reprend avant
 * le contrat — et l'écran le dit (« prix appris de AF039468 »). Un prix saisi
 * à la main reste prioritaire. Table `memoire_prix`, une ligne par
 * (client, référence) : la dernière offre fait foi.
 */

export interface PrixAppris {
  clientId: string;
  reference: string;
  prix: number;
  numeroOffre?: string;
  updatedAt: string;
}

const cle = (clientId: string, reference: string) => `${clientId}|${reference.trim().toUpperCase()}`;

let index = new Map<string, PrixAppris>();
let version = 0;
let promesse: Promise<void> | null = null;
const abonnes = new Set<() => void>();

function poser(liste: PrixAppris[]) {
  index = new Map(liste.map(p => [cle(p.clientId, p.reference), p]));
  version += 1;
  for (const f of [...abonnes]) f();
}

interface LigneDb {
  client_id: string;
  reference: string;
  prix: number | string;
  numero_offre: string | null;
  updated_at: string;
}

async function charger() {
  const { data, error } = await supabase.from('memoire_prix' as never).select('*');
  if (error) {
    /* Table pas encore migrée : le chiffrage continue sans prix appris. */
    console.error('[memoire_prix]', error.message);
    poser([]);
    return;
  }
  poser(((data || []) as unknown as LigneDb[]).map(r => ({
    clientId: r.client_id, reference: r.reference, prix: Number(r.prix),
    numeroOffre: r.numero_offre || undefined, updatedAt: r.updated_at,
  })));
}

function abonner(f: () => void) {
  abonnes.add(f);
  if (!promesse) promesse = charger();
  return () => { abonnes.delete(f); };
}

/** Le prix appris pour ce client et cette référence, s'il y en a un. */
export function prixAppris(clientId?: string | null, reference?: string | null): PrixAppris | undefined {
  if (!clientId || !reference) return undefined;
  return index.get(cle(clientId, reference));
}

/** Retient les prix d'une offre pour un client. Rend l'erreur, ou `null`. */
export async function retenirPrix(
  clientId: string,
  prix: { reference: string; prix: number }[],
  numeroOffre?: string,
): Promise<string | null> {
  const lignes = prix
    .filter(p => p.reference.trim() && Number.isFinite(p.prix))
    .map(p => ({
      client_id: clientId,
      reference: p.reference.trim().toUpperCase(),
      prix: Math.round(p.prix * 1000) / 1000,
      numero_offre: numeroOffre || null,
      updated_at: new Date().toISOString(),
    }));
  if (!lignes.length) return null;
  const { error } = await supabase.from('memoire_prix' as never)
    .upsert(lignes as never, { onConflict: 'client_id,reference' });
  if (error) return error.message;
  poser([
    ...[...index.values()].filter(p => !lignes.some(l => cle(l.client_id, l.reference) === cle(p.clientId, p.reference))),
    ...lignes.map(l => ({ clientId: l.client_id, reference: l.reference, prix: l.prix,
      numeroOffre: l.numero_offre || undefined, updatedAt: l.updated_at })),
  ]);
  return null;
}

/** Oublie le prix appris d'une référence pour un client. */
export async function oublierPrix(clientId: string, reference: string): Promise<string | null> {
  const { error } = await supabase.from('memoire_prix' as never).delete()
    .eq('client_id', clientId).eq('reference', reference.trim().toUpperCase());
  if (error) return error.message;
  poser([...index.values()].filter(p => cle(p.clientId, p.reference) !== cle(clientId, reference)));
  return null;
}

/** Abonne un composant : il se redessine quand les prix appris changent. */
export function useMemoirePrix() {
  return useSyncExternalStore(abonner, () => version, () => version);
}
