import { afterEach, describe, expect, it, vi } from 'vitest';
import { dossierMails } from './dossierMails';

/* « Choisir le dossier » : une base IndexedDB qui ne répond jamais ne doit
 * empêcher ni l'ouverture du sélecteur, ni la suite une fois le dossier choisi. */

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

describe('dossierMails', () => {
  it('ouvre le sélecteur et rend le dossier même si IndexedDB reste muet', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', { open: () => ({}) });
    const dossier = { name: 'Mails a traiter', getDirectoryHandle: async () => { throw new Error('absent'); } };
    const selecteur = vi.fn(async () => dossier);
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = selecteur;

    const resultat = dossierMails(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(selecteur).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(resultat).resolves.toBe(dossier);
  });

  it('sans clic, ne demande rien', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', { open: () => ({}) });
    const selecteur = vi.fn();
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = selecteur;

    const resultat = dossierMails(false);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(resultat).resolves.toBeNull();
    expect(selecteur).not.toHaveBeenCalled();
  });
});
