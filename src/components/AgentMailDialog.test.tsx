import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { MailAgent, TriMail } from '@/lib/agentMail';

/* Replier les mails par catégorie : le premier du groupe porte le bouton, et
 * replié il reste seul à l'écran avec le nombre de mails du groupe. */

const MAILS: { id: string; sujet: string; categorie: TriMail['categorie']; jour: string }[] = [
  { id: 'd1', sujet: 'Demande récente', categorie: 'demande_devis', jour: '2026-11-07' },
  { id: 'd2', sujet: 'Demande moyenne', categorie: 'demande_devis', jour: '2026-11-06' },
  { id: 'd3', sujet: 'Demande ancienne', categorie: 'demande_devis', jour: '2026-11-05' },
  { id: 's1', sujet: 'Suite récente', categorie: 'suite_devis', jour: '2026-11-07' },
  { id: 's2', sujet: 'Suite ancienne', categorie: 'suite_devis', jour: '2026-11-04' },
  { id: 'c1', sujet: 'Commande seule', categorie: 'commande', jour: '2026-11-03' },
];

const gemini = vi.hoisted(() => vi.fn());

vi.mock('@/lib/StoreContext', () => ({ useCRM: () => ({ clients: [], devis: [] }) }));
vi.mock('@/lib/modelesIA', () => ({ appelerGemini: gemini, texteGemini: () => '' }));
vi.mock('@/lib/mailsTransferes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailsTransferes')>()),
  lireAdresseAgent: async () => null,
  lireMailsTransferes: async () => [],
}));
vi.mock('@/lib/devisOdooMails', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/devisOdooMails')>()),
  lireDevisOdoo: async () => ({ parEmail: {}, parDomaine: {}, devis: [], tronque: false }),
}));
vi.mock('@/lib/dossierMails', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/dossierMails')>()),
  dossierMailsDisponible: () => true,
  dossierMails: async () => null,
  nomDossierMails: async () => null,
  copieEnMemoire: async (f: File) => f,
  lireMailFichier: async (f: File): Promise<MailAgent> => {
    const m = MAILS.find(x => `${x.id}.msg` === f.name)!;
    return {
      id: m.id, sujet: m.sujet, deNom: 'Client', deEmail: 'client@societe.fr',
      recuLe: `${m.jour}T10:00:00.000Z`, corps: '', piecesJointes: [], source: 'fichier', fichier: f,
    };
  },
}));

let Dialogue: ComponentType<{ open: boolean; onOpenChange: (o: boolean) => void; onProposerDevis: (f: File[]) => void }>;

beforeAll(async () => {
  /* Le tri est relu au chargement du module : il doit être là avant l'import. */
  localStorage.setItem('agent_mail_tri', JSON.stringify(Object.fromEntries(MAILS.map(m => [m.id, {
    id: m.id, categorie: m.categorie, confiance: 90, resume: '', demandes: [],
  }]))));
  Dialogue = (await import('./AgentMailDialog')).default;
});

beforeEach(() => localStorage.removeItem('agent_mail_groupes_replies'));

const monter = () => render(
  <MemoryRouter><Dialogue open onOpenChange={() => {}} onProposerDevis={() => {}} /></MemoryRouter>,
);

async function chargerLesMails() {
  const rendu = monter();
  const champ = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(champ, { target: { files: MAILS.map(m => new File(['x'], `${m.id}.msg`)) } });
  await screen.findByText('Commande seule');
  return rendu;
}

const boutonsReplier = () => screen.getAllByRole('button', { name: 'Replier ce groupe' });

describe('AgentMailDialog — repli par catégorie', () => {
  it('un bouton par catégorie, sur le premier mail du groupe seulement', async () => {
    await chargerLesMails();
    expect(boutonsReplier()).toHaveLength(3);
    const carteDuPremier = screen.getByText('Demande récente').closest('div.rounded-lg') as HTMLElement;
    expect(within(carteDuPremier).getByRole('button', { name: 'Replier ce groupe' })).toBeTruthy();
    const carteSuivante = screen.getByText('Demande moyenne').closest('div.rounded-lg') as HTMLElement;
    expect(within(carteSuivante).queryByRole('button', { name: 'Replier ce groupe' })).toBeNull();
    expect(gemini).not.toHaveBeenCalled();
  });

  it('replié : le premier reste avec le nombre, les autres groupes ne bougent pas', async () => {
    await chargerLesMails();
    fireEvent.click(boutonsReplier()[0]);

    const ligne = screen.getByRole('button', { name: /Demande récente/ });
    expect(ligne.textContent).toContain('3');
    expect(ligne.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Demande moyenne')).toBeNull();
    expect(screen.queryByText('Demande ancienne')).toBeNull();
    expect(screen.getByText('Suite ancienne')).toBeTruthy();
    expect(screen.getByText('Commande seule')).toBeTruthy();

    fireEvent.click(ligne);
    expect(screen.getByText('Demande ancienne')).toBeTruthy();
    expect(boutonsReplier()).toHaveLength(3);
  });

  it('le repli se retrouve à la réouverture', async () => {
    const { unmount } = await chargerLesMails();
    fireEvent.click(boutonsReplier()[1]);
    expect(screen.queryByText('Suite ancienne')).toBeNull();

    unmount();
    monter();
    expect(screen.getByRole('button', { name: /Suite récente/ }).textContent).toContain('2');
    expect(screen.queryByText('Suite ancienne')).toBeNull();
    expect(screen.getByText('Demande ancienne')).toBeTruthy();
  });

  it('un stockage illisible ne casse pas la fenêtre : tout reste déplié', async () => {
    localStorage.setItem('agent_mail_groupes_replies', 'pas du json');
    await chargerLesMails();
    expect(boutonsReplier()).toHaveLength(3);
  });
});
