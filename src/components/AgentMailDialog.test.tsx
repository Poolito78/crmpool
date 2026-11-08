import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const ouvrirDossier = vi.hoisted(() => vi.fn(async () => null as FileSystemDirectoryHandle | null));
const lancerMacro = vi.hoisted(() => vi.fn());
const passage = vi.hoisted(() => vi.fn(async () => null as number | null));
const lireFichiersDossier = vi.hoisted(() => vi.fn(async (_d: FileSystemDirectoryHandle) => [] as File[]));
const ranger = vi.hoisted(() => vi.fn(async () => undefined));
const remettre = vi.hoisted(() => vi.fn(async () => undefined));
const commander = vi.hoisted(() => vi.fn(async () => undefined));

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
  dossierMails: ouvrirDossier,
  lancerMacroOutlook: lancerMacro,
  dernierPassage: passage,
  fichiersDuDossier: lireFichiersDossier,
  rangerTraite: ranger,
  remettreATraiter: remettre,
  ecrireCommandesOutlook: commander,
  dossierTraites: async () => ({ name: 'Traites' }),
  lireIndexOutlook: async () => new Map(),
  dernierExport: async () => null,
  nomDossierMails: async () => null,
  copieEnMemoire: async (f: File) => f,
  lireMailFichier: async (f: File, duDossier = false): Promise<MailAgent> => {
    const m = MAILS.find(x => `${x.id}.msg` === f.name)!;
    return {
      id: m.id, sujet: m.sujet, deNom: 'Client', deEmail: 'client@societe.fr',
      recuLe: `${m.jour}T10:00:00.000Z`, corps: '', piecesJointes: [], source: 'fichier', fichier: f, duDossier,
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

beforeEach(() => {
  localStorage.removeItem('agent_mail_groupes_replies');
  ouvrirDossier.mockReset().mockResolvedValue(null);
  passage.mockReset().mockResolvedValue(null);
  lancerMacro.mockReset();
  lireFichiersDossier.mockReset().mockResolvedValue([]);
  ranger.mockClear();
  remettre.mockClear();
  commander.mockClear();
  localStorage.removeItem('agent_mail_drapeaux');
});
afterEach(() => vi.useRealTimers());

const DOSSIER = { name: 'Mails a traiter' } as FileSystemDirectoryHandle;

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

describe('AgentMailDialog — recherche lancée dans Outlook', () => {
  /* Ces trois tests se suivent : l'état de la première ouverture vit dans le module. */
  it('ouverture sans clic : le refus de Chrome ne s\'affiche pas, l\'écran invite au bouton', async () => {
    ouvrirDossier.mockRejectedValue(new DOMException('geste requis', 'SecurityError'));
    monter();
    expect(await screen.findByText(/pas encore accessibles dans cette fenêtre/)).toBeTruthy();
    expect(screen.queryByText(/geste requis/)).toBeNull();
    expect(lancerMacro).not.toHaveBeenCalled();
  });

  it('à l\'ouverture, la recherche part seule', async () => {
    ouvrirDossier.mockResolvedValue(DOSSIER);
    monter();
    await waitFor(() => expect(lancerMacro).toHaveBeenCalledOnce());
  });

  it('rouverte dans les 5 minutes, elle ne repart pas', async () => {
    ouvrirDossier.mockResolvedValue(DOSSIER);
    monter();
    await screen.findByRole('button', { name: /Rechercher dans Outlook/ });
    expect(lancerMacro).not.toHaveBeenCalled();
  });

  it('au clic : l\'accès au dossier passe AVANT le lien, puis l\'accusé fait relire', async () => {
    ouvrirDossier.mockResolvedValue(DOSSIER);
    monter();
    const bouton = await screen.findByRole('button', { name: /Rechercher dans Outlook/ });
    ouvrirDossier.mockClear();
    passage.mockImplementation(async () => Date.now());
    fireEvent.click(bouton);
    await waitFor(() => expect(lancerMacro).toHaveBeenCalledOnce());
    expect(ouvrirDossier).toHaveBeenCalledWith(true);
    expect(ouvrirDossier.mock.invocationCallOrder[0]).toBeLessThan(lancerMacro.mock.invocationCallOrder[0]);
    await waitFor(() => expect(passage).toHaveBeenCalled(), { timeout: 4000 });
    await waitFor(() => expect(screen.getByRole('button', { name: /Rechercher dans Outlook/ })).toBeTruthy(), { timeout: 4000 });
  });

  it('sans accusé de réception, l\'écran le dit au bout d\'une minute', async () => {
    ouvrirDossier.mockResolvedValue(DOSSIER);
    monter();
    const bouton = await screen.findByRole('button', { name: /Rechercher dans Outlook/ });
    vi.useFakeTimers();
    fireEvent.click(bouton);
    await act(async () => { await vi.advanceTimersByTimeAsync(62_000); });
    expect(screen.getByText(/Outlook n'a pas répondu à la recherche/)).toBeTruthy();
  });
});

describe('AgentMailDialog — choix du dossier', () => {
  it('une fenêtre fermée sans choix se dit à l\'écran', async () => {
    monter();
    ouvrirDossier.mockRejectedValueOnce(new DOMException('annulé', 'AbortError'));
    fireEvent.click(await screen.findByRole('button', { name: /Choisir le dossier/ }));
    expect(await screen.findByText(/Aucun dossier choisi/)).toBeTruthy();
  });
});

describe('AgentMailDialog — recherche par mots', () => {
  const chercher = (texte: string) =>
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher dans les mails' }), { target: { value: texte } });

  it('filtre mot à mot, sans tenir compte des accents ni de l\'ordre', async () => {
    await chargerLesMails();
    chercher('RECENTE demande');
    expect(screen.getByText('Demande récente')).toBeTruthy();
    expect(screen.queryByText('Suite récente')).toBeNull();
    expect(screen.queryByText('Demande moyenne')).toBeNull();
    expect(screen.getByText(/1 mail trouvé/)).toBeTruthy();
  });

  it('trouve aussi dans un groupe replié, puis le repli revient quand on efface', async () => {
    await chargerLesMails();
    fireEvent.click(boutonsReplier()[0]);
    expect(screen.queryByText('Demande ancienne')).toBeNull();

    chercher('ancienne');
    expect(screen.getByText('Demande ancienne')).toBeTruthy();
    expect(screen.getByText('Suite ancienne')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(screen.queryByText('Demande ancienne')).toBeNull();
  });

  it('filtre par catégorie, avec les mots, et le nombre suit la saisie', async () => {
    await chargerLesMails();
    const pastille = (nom: RegExp) => within(screen.getByRole('group', { name: 'Filtrer par catégorie' })).getByRole('button', { name: nom });

    expect(pastille(/^Demande de devis/).textContent).toContain('3');
    fireEvent.click(pastille(/^Suite de devis/));
    expect(screen.getByText('Suite récente')).toBeTruthy();
    expect(screen.getByText('Suite ancienne')).toBeTruthy();
    expect(screen.queryByText('Demande récente')).toBeNull();

    chercher('ancienne');
    expect(pastille(/^Demande de devis/).textContent).toContain('1');
    expect(screen.getByText('Suite ancienne')).toBeTruthy();
    expect(screen.queryByText('Suite récente')).toBeNull();
    expect(screen.queryByText('Demande ancienne')).toBeNull();

    fireEvent.click(pastille(/^Suite de devis/));
    expect(screen.getByText('Demande ancienne')).toBeTruthy();
  });

  it('dit quand rien ne correspond', async () => {
    await chargerLesMails();
    chercher('introuvable');
    expect(screen.getByText('Aucun mail ne contient « introuvable ».')).toBeTruthy();
  });
});

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

describe('AgentMailDialog — mails traités et supprimés', () => {
  it('un mail écarté passe dans Supprimés et se rétablit', async () => {
    await chargerLesMails();
    const carte = screen.getByText('Commande seule').closest('div.rounded-lg') as HTMLElement;
    fireEvent.click(within(carte).getByRole('button', { name: /Écarter/ }));
    fireEvent.click(screen.getByRole('button', { name: /Supprimés \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Rétablir/ }));
    expect(screen.queryByRole('button', { name: /Supprimés/ })).toBeNull();
    expect(screen.getByText('Commande seule')).toBeTruthy();
  });

  it('« Proposer un devis » garde le mail à l\'écran et ne le range pas', async () => {
    ouvrirDossier.mockResolvedValue(DOSSIER);
    lireFichiersDossier.mockResolvedValue([new File(['x'], 'd1.msg')]);
    const proposer = vi.fn();
    render(<MemoryRouter><Dialogue open onOpenChange={() => {}} onProposerDevis={proposer} /></MemoryRouter>);
    const titre = await screen.findByText('Demande récente');
    await screen.findByRole('button', { name: /Mails déjà traités/ });
    fireEvent.click(within(titre.closest('div.rounded-lg') as HTMLElement).getByRole('button', { name: /Proposer un devis/ }));
    await waitFor(() => expect(proposer).toHaveBeenCalledOnce());
    expect(ranger).not.toHaveBeenCalled();
    expect(screen.getByText('Demande récente')).toBeTruthy();
  });

  it('les traités ne se lisent qu\'au clic, sans appeler le modèle, et peuvent revenir', async () => {
    ouvrirDossier.mockResolvedValue(DOSSIER);
    lireFichiersDossier.mockImplementation(async d => (d.name === 'Traites' ? [new File(['x'], 'c1.msg')] : []));
    gemini.mockClear();
    monter();
    const bouton = await screen.findByRole('button', { name: /Mails déjà traités/ });
    expect(lireFichiersDossier).not.toHaveBeenCalledWith({ name: 'Traites' });

    fireEvent.click(bouton);
    const section = bouton.closest('div.rounded-lg') as HTMLElement;
    expect(await within(section).findByText('Commande seule')).toBeTruthy();
    expect(gemini).not.toHaveBeenCalled();

    fireEvent.click(within(section).getByRole('button', { name: /Remettre à traiter/ }));
    await waitFor(() => expect(remettre).toHaveBeenCalledOnce());
  });

  it('« Ranger » archive dans Outlook', async () => {
    ouvrirDossier.mockResolvedValue(DOSSIER);
    lireFichiersDossier.mockResolvedValue([new File(['x'], 'd2.msg')]);
    monter();
    const titre = await screen.findByText('Demande moyenne');
    await screen.findByRole('button', { name: /Mails déjà traités/ });
    fireEvent.click(within(titre.closest('div.rounded-lg') as HTMLElement).getByRole('button', { name: /Ranger/ }));
    await waitFor(() => expect(ranger).toHaveBeenCalledOnce());
    await waitFor(() => expect(commander).toHaveBeenCalledWith(DOSSIER, [{ action: 'ARCHIVER', nom: 'd2.msg' }]));
    expect(lancerMacro).toHaveBeenCalled();
  });
});
