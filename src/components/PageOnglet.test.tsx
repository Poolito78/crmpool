import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import PageOnglet from './PageOnglet';
import { useOnglets } from '@/hooks/useOnglets';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/* Les onglets gardent leur page : un devis ouvert survit au passage sur un
 * autre onglet, sans figer cet autre onglet (lib/onglets.ts). */

function PageDevis() {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  return (
    <div>
      <button onClick={() => setOuvert(true)}>ouvrir devis</button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent>
          <DialogTitle>Devis</DialogTitle>
          <input aria-label="référence" value={texte} onChange={e => setTexte(e.target.value)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageProduits() {
  const navigate = useNavigate();
  const { search } = useLocation();
  return (
    <div>
      <p>catalogue {search}</p>
      <button onClick={() => navigate('/produits?page=2')}>page suivante</button>
    </div>
  );
}

const routes = <>
  <Route path="/devis" element={<PageDevis />} />
  <Route path="/produits" element={<PageProduits />} />
</>;

let api: ReturnType<typeof useOnglets>;
function Coquille() {
  api = useOnglets();
  const { pathname, search } = useLocation();
  return (
    <>
      <output data-testid="adresse">{pathname + search}</output>
      {api.onglets.map(o => (
        <PageOnglet key={o.id} onglet={o} actif={o.id === api.actif} routes={routes} deplacer={api.deplacer} nommer={api.nommer} />
      ))}
    </>
  );
}

function monter() {
  sessionStorage.clear();
  window.name = '';
  return render(
    <MemoryRouter initialEntries={['/devis']}>
      <Routes><Route path="*" element={<Coquille />} /></Routes>
    </MemoryRouter>,
  );
}

describe('onglets', () => {
  it('le devis ouvert survit au passage sur un autre onglet, qui reste cliquable', () => {
    monter();
    fireEvent.click(screen.getByText('ouvrir devis'));
    fireEvent.change(screen.getByLabelText('référence'), { target: { value: 'DEV-2026-134' } });
    expect(document.body.style.pointerEvents).toBe('none');

    act(() => api.ouvrir('/produits'));
    expect(screen.getByTestId('adresse').textContent).toBe('/produits');
    expect(screen.getByText(/catalogue/)).toBeTruthy();
    // Le devis est toujours là, caché avec son onglet, et ne verrouille plus la page.
    const dialogue = document.querySelector('[role="dialog"]')!;
    expect(dialogue.closest('[data-onglet]')?.className).toContain('hidden');
    expect(document.body.style.pointerEvents).not.toBe('none');

    act(() => api.basculer(api.onglets[0].id));
    expect(screen.getByTestId('adresse').textContent).toBe('/devis');
    expect((screen.getByLabelText('référence') as HTMLInputElement).value).toBe('DEV-2026-134');
  });

  it("une navigation dans l'onglet actif le suit ; celle d'un onglet caché ne touche que lui", () => {
    monter();
    act(() => api.ouvrir('/produits'));
    fireEvent.click(screen.getByText('page suivante'));
    expect(screen.getByTestId('adresse').textContent).toBe('/produits?page=2');

    act(() => api.basculer(api.onglets[0].id));
    const produits = api.onglets[1].id;
    act(() => api.deplacer(produits, '/produits?page=3', null));
    expect(screen.getByTestId('adresse').textContent).toBe('/devis');
    act(() => api.basculer(produits));
    expect(screen.getByTestId('adresse').textContent).toBe('/produits?page=3');
  });

  it('un clic sur une page déjà ouverte dans un autre onglet y bascule', () => {
    monter();
    act(() => api.ouvrir('/produits'));
    let traite = false;
    act(() => { traite = api.cliquerMenu('/devis', { ctrlKey: false, metaKey: false }); });
    expect(traite).toBe(true);
    expect(screen.getByTestId('adresse').textContent).toBe('/devis');
    expect(api.onglets).toHaveLength(2);
  });
});
