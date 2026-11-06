import { describe, expect, it } from 'vitest';
import { estLignePort, lireCodePostalLivraison, lirePoidsEcrit, nombreLu, texteEnLignes } from './portDuDocument';
import type { ItemPDF } from './grilleAffretement';

/* Disposition d'une confirmation de commande, données fictives : dans l'ORDRE de
   pdf.js, le nombre passe avant son libellé. */
const c = (str: string, x: number, y: number, page = 1): ItemPDF => ({ str, x, y, page });
const CONFIRMATION: ItemPDF[] = [
  c('890,00', 300, 500), c('Poids net:', 240, 500), c('KG', 350, 500),
  c('897,00', 300, 488), c('Poids brut:', 240, 488), c('KG', 350, 488),
  c('110,00', 300, 440), c('Poids net:', 240, 440), c('KG', 350, 440),
  c('135,00', 300, 428), c('Poids brut:', 240, 428), c('KG', 350, 428),
  c('1234567', 150, 700), c('Adresse de Livraison:', 50, 700),
  c('CONTACT EXEMPLE', 50, 690), c('0100000000', 50, 680),
  c('1 RUE DE EXEMPLE', 50, 670), c('77000 VILLE EXEMPLE', 50, 660),
];

describe('lirePoidsEcrit', () => {
  it('additionne les poids BRUTS relus à la position des cellules (897 + 135)', () => {
    expect(lirePoidsEcrit(texteEnLignes(CONFIRMATION))).toEqual({ kg: 1032, origine: 'brut', nbLignes: 2 });
  });

  it('ne les trouve pas dans le texte brut de pdf.js, d’où la relecture', () => {
    expect(lirePoidsEcrit(CONFIRMATION.map(i => i.str).join(' '))?.origine).not.toBe('brut');
  });

  it('préfère un total écrit, retombe sur le net, et ne prend un poids isolé que s’il est seul', () => {
    expect(lirePoidsEcrit('Poids brut: 10 KG\nPoids total : 1 250,50 kg')).toMatchObject({ kg: 1250.5, origine: 'total' });
    expect(lirePoidsEcrit('Poids net: 1.000,00 KG\nPoids net: 4.000,00 KG')).toMatchObject({ kg: 5000, origine: 'net' });
    expect(lirePoidsEcrit('Poids : 320 kg')).toMatchObject({ kg: 320, origine: 'unique' });
    expect(lirePoidsEcrit('Poids : 20 kg\nPoids : 25 kg')).toBeUndefined();
    expect(lirePoidsEcrit('Sac de 25 kg')).toBeUndefined();
  });
});

describe('nombreLu', () => {
  it('comprend les écritures française et allemande', () => {
    expect(nombreLu('1.012,00')).toBe(1012);
    expect(nombreLu('1 012,00')).toBe(1012);
    expect(nombreLu('1,012.50')).toBe(1012.5);
    expect(nombreLu('1.012')).toBe(1012);
    expect(nombreLu('1,250')).toBe(1.25);
    expect(nombreLu('écart')).toBeUndefined();
  });
});

describe('lireCodePostalLivraison', () => {
  it('lit le code sous « Adresse de livraison », pas le téléphone ni le n° de client', () => {
    expect(lireCodePostalLivraison(texteEnLignes(CONFIRMATION))).toBe('77000');
  });

  it('ne répond pas quand facturation et livraison sont sur deux colonnes', () => {
    expect(lireCodePostalLivraison('Adresse de facturation Adresse de livraison\n71000 VILLE UN 77000 VILLE DEUX')).toBeUndefined();
  });
});

describe('estLignePort', () => {
  it('reconnaît une ligne de transport par son libellé ou sa référence', () => {
    expect(estLignePort({ description: 'FRAIS DE TRANSPORT', reference: 'FREIGHT' })).toBe(true);
    expect(estLignePort({ description: 'Divers', reference: 'FREIGHT' })).toBe(true);
    expect(estLignePort({ description: 'Port' })).toBe(true);
    expect(estLignePort({ description: 'Forfait livraison' })).toBe(true);
  });

  it('ne prend pas un article pour du port', () => {
    expect(estLignePort({ description: 'Support de panneau' })).toBe(false);
    expect(estLignePort({ description: 'AN300 NATURAL SAND 25KG' })).toBe(false);
    expect(estLignePort({ description: 'Mât de transport' })).toBe(false);
  });
});
