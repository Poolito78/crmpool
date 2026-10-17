import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCompte, prendreCompte, rendreCompte, formatOctets } from './quotaEgress';

afterEach(() => { vi.unstubAllGlobals(); prendreCompte(); });

describe('compteur d’egress', () => {
  it('pèse une réponse annoncée et une réponse découpée', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => u.endsWith('/a')
      ? new Response('x'.repeat(10), { headers: { 'content-length': '1000' } })
      : new Response('y'.repeat(250))));
    await fetchCompte('https://x.supabase.co/rest/v1/a');
    await fetchCompte('https://x.supabase.co/rest/v1/b');
    await new Promise(r => setTimeout(r, 10));
    const c = prendreCompte();
    expect(c.requetes).toBe(2);
    expect(c.octets).toBe(1250);
    expect(prendreCompte().octets).toBe(0);
  });
  it('ne compte pas son propre envoi, et rend un envoi échoué', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('z', { headers: { 'content-length': '500' } })));
    await fetchCompte('https://x.supabase.co/rest/v1/rpc/noter_egress');
    expect(prendreCompte().requetes).toBe(0);
    rendreCompte({ octets: 42, requetes: 1 });
    expect(prendreCompte()).toEqual({ octets: 42, requetes: 1 });
  });
  it('formate en Mo / Go', () => {
    expect(formatOctets(3_500_000_000)).toBe('3,50 Go');
    expect(formatOctets(263_000_000)).toBe('263 Mo');
  });
});
