import { describe, it, expect } from 'vitest';
import {
  dimensionsReduites, estImageAcceptee, occupation, formatOctets,
  COTE_MAX, QUOTA_GRATUIT, type ImageProduit,
} from './produitImages';

function image(p: Partial<ImageProduit> & { id: string }): ImageProduit {
  return {
    produitId: 'p1', url: 'https://exemple/img.webp', ordre: 0,
    createdAt: '2026-09-03T00:00:00Z', ...p,
  };
}

describe('réduction des dimensions', () => {
  it('ramène le plus grand côté à la limite, à proportions conservées', () => {
    expect(dimensionsReduites(4000, 3000)).toEqual({ largeur: 800, hauteur: 600 });
    expect(dimensionsReduites(3000, 4000)).toEqual({ largeur: 600, hauteur: 800 });
    expect(dimensionsReduites(4000, 4000)).toEqual({ largeur: 800, hauteur: 800 });
  });

  /* AGRANDIR NE CRÉE AUCUN DÉTAIL et alourdit le fichier : une vignette de
     120 px remontée à 800 pèserait plus lourd qu'à l'arrivée, pour rien. */
  it('n’agrandit jamais une image déjà petite', () => {
    expect(dimensionsReduites(120, 90)).toEqual({ largeur: 120, hauteur: 90 });
    expect(dimensionsReduites(COTE_MAX, 400)).toEqual({ largeur: 800, hauteur: 400 });
  });

  it('ne descend jamais en dessous d’un pixel', () => {
    // Une bannière très allongée : 2 px de haut pour 6000 de large.
    const d = dimensionsReduites(6000, 2);
    expect(d.largeur).toBe(800);
    expect(d.hauteur).toBe(1);
  });

  it('ne divise pas par zéro sur une image vide', () => {
    expect(dimensionsReduites(0, 0)).toEqual({ largeur: 0, hauteur: 0 });
  });

  it('respecte une limite choisie', () => {
    expect(dimensionsReduites(2000, 1000, 200)).toEqual({ largeur: 200, hauteur: 100 });
  });
});

describe('formats acceptés', () => {
  const f = (type: string) => new File([''], 'x', { type });

  it('accepte les images courantes', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']) {
      expect(estImageAcceptee(f(t))).toBe(true);
    }
  });

  /* Un PDF glissé sur la zone d'images doit être refusé ici, pas envoyé au
     stockage pour y être rejeté par le seau. */
  it('refuse ce qui n’est pas une image', () => {
    for (const t of ['application/pdf', 'text/plain', 'image/svg+xml', '']) {
      expect(estImageAcceptee(f(t))).toBe(false);
    }
  });
});

describe('place occupée', () => {
  /* SEULES LES IMAGES DÉPOSÉES PÈSENT. Une image externe vit chez son
     hébergeur : la compter gonflerait le total et ferait croire à un quota
     saturé qui ne l'est pas. */
  it('ne compte que les images déposées, pas les liens externes', () => {
    const o = occupation([
      image({ id: '1', chemin: 'p1/a.webp', octets: 50_000 }),
      image({ id: '2', chemin: 'p1/b.webp', octets: 30_000 }),
      image({ id: '3', octets: 9_999_999 }),   // externe : chemin absent
    ]);
    expect(o.fichiers).toBe(2);
    expect(o.octets).toBe(80_000);
    expect(o.quota).toBe(QUOTA_GRATUIT);
  });

  it('tient une taille manquante pour zéro', () => {
    expect(occupation([image({ id: '1', chemin: 'p/a.webp' })]).octets).toBe(0);
    expect(occupation([]).octets).toBe(0);
  });
});

describe('affichage des tailles', () => {
  it('choisit l’unité qui se lit', () => {
    expect(formatOctets(512)).toBe('512 o');
    expect(formatOctets(48_000)).toBe('47 Ko');
    expect(formatOctets(103 * 1024 * 1024)).toBe('103.0 Mo');
    expect(formatOctets(QUOTA_GRATUIT)).toBe('1.00 Go');
  });
});
