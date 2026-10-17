import { describe, it, expect } from 'vitest';
import {
  sirenValide, siretValide, cleTvaFr, tvaIntraFrValide, sirenDuClient,
  categorieSuggeree, controlerFacture, mentionsPaiement,
} from './factureConforme';
import { EMETTEUR } from './emetteur';
import type { Client, FactureClient, LigneDevis } from './store';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', nom: 'Matthieu NOLLET', societe: 'HORUS', email: '', telephone: '',
  adresse: '1 rue du Port', ville: 'Lyon', codePostal: '69001', dateCreation: '2026-01-01',
  adressesLivraison: [], siret: '', tvaIntra: 'FR76494922313', ...p,
});
const ligne = (p: Partial<LigneDevis> = {}) => ({ id: 'l1', description: 'Hydraseal DPM', quantite: 1, prixUnitaireHT: 100, tva: 20, produitId: 'p1', ...p }) as LigneDevis;
const facture = (p: Partial<FactureClient> = {}): FactureClient => ({
  id: 'f1', numero: '', clientId: 'c1', dateCreation: '2026-10-17', dateEcheance: '2026-11-30',
  statut: 'brouillon', lignes: [ligne()], totalHT: 100, totalTVA: 20, totalTTC: 120, fraisPortHT: 0,
  categorieOperation: 'biens', typeDocument: 'facture', ...p,
});

describe('identifiants', () => {
  it('contrôle SIREN et clé de TVA de ISOSIGN', () => {
    expect(sirenValide('494922313')).toBe(true);
    expect(sirenValide('494922314')).toBe(false);
    expect(cleTvaFr('494922313')).toBe('76');
    expect(tvaIntraFrValide('FR 76 494922313')).toBe(true);
    expect(tvaIntraFrValide('FR77494922313')).toBe(false);
  });
  it('refuse le SIRET imprimé sur les documents ISOSIGN (13 chiffres)', () => {
    expect(siretValide('4949223130005')).toBe(false);
  });
  it('accepte un SIRET connu (La Poste, règle à part)', () => {
    expect(siretValide('35600000000010')).toBe(true);
  });
  it('lit le SIREN dans le SIRET, à défaut dans la TVA, jamais au hasard', () => {
    expect(sirenDuClient({ siret: '494 922 313 00012', tvaIntra: '' })).toBe('494922313');
    expect(sirenDuClient({ siret: '', tvaIntra: 'FR76494922313' })).toBe('494922313');
    expect(sirenDuClient({ siret: '', tvaIntra: 'DE123456789' })).toBeNull();
  });
});

describe('catégorie d’opération suggérée', () => {
  it('articles seuls → biens', () => {
    expect(categorieSuggeree([ligne(), ligne({ id: 'l2', type: 'groupe', description: 'Pose' })])).toBe('biens');
  });
  it('articles + pose → mixte ; rien que de la pose → services', () => {
    expect(categorieSuggeree([ligne(), ligne({ id: 'l2', description: 'Pose du système', produitId: undefined })])).toBe('mixte');
    expect(categorieSuggeree([ligne({ description: "Main d'oeuvre application", produitId: undefined })])).toBe('services');
  });
  it('ligne libre sans indice → on ne sait pas', () => {
    expect(categorieSuggeree([ligne({ produitId: undefined, description: 'Divers' })])).toBeNull();
  });
});

describe('contrôle avant émission', () => {
  it('une facture complète ne bloque pas (le SIRET émetteur reste à compléter)', () => {
    const r = controlerFacture(facture(), client(), EMETTEUR);
    expect(r.bloquants).toEqual([]);
    expect(r.avertissements.some(a => a.includes('SIRET de ISOSIGN'))).toBe(true);
  });
  it('bloque sans SIREN client, sans catégorie, sans échéance', () => {
    const r = controlerFacture(facture({ categorieOperation: undefined, dateEcheance: undefined }), client({ tvaIntra: '' }), EMETTEUR);
    expect(r.bloquants.some(b => b.includes('SIREN du client absent'))).toBe(true);
    expect(r.bloquants.some(b => b.includes("Catégorie d'opération"))).toBe(true);
    expect(r.bloquants.some(b => b.includes("échéance"))).toBe(true);
  });
  it('un particulier coché passe en e-reporting au lieu de bloquer', () => {
    const r = controlerFacture(facture({ horsEInvoicing: true }), client({ tvaIntra: '' }), EMETTEUR);
    expect(r.bloquants).toEqual([]);
    expect(r.avertissements.some(a => a.includes('e-reporting'))).toBe(true);
  });
  it('bloque une TVA qui ne correspond pas au SIRET', () => {
    const r = controlerFacture(facture(), client({ siret: '73282932000074', tvaIntra: 'FR76494922313' }), EMETTEUR);
    expect(r.bloquants.some(b => b.includes('ne correspond pas'))).toBe(true);
  });
  it('bloque des totaux incohérents et un montant négatif', () => {
    expect(controlerFacture(facture({ totalTTC: 119 }), client(), EMETTEUR).bloquants.some(b => b.includes('incohérents'))).toBe(true);
    expect(controlerFacture(facture({ totalHT: -100, totalTVA: -20, totalTTC: -120 }), client(), EMETTEUR).bloquants.some(b => b.includes('avoir'))).toBe(true);
  });
  it('un avoir exige une facture d’origine émise et ne la dépasse pas', () => {
    const origine = facture({ id: 'f0', numero: 'FAC-2026-001', emiseLe: '2026-10-01T10:00:00Z', totalTTC: 60, totalHT: 50, totalTVA: 10 });
    expect(controlerFacture(facture({ typeDocument: 'avoir' }), client(), EMETTEUR).bloquants.some(b => b.includes('référencer'))).toBe(true);
    expect(controlerFacture(facture({ typeDocument: 'avoir', factureOrigineId: 'f0' }), client(), EMETTEUR, origine).bloquants.some(b => b.includes('dépasse'))).toBe(true);
  });
  it('signale une adresse de livraison à choisir', () => {
    const c = client({ adressesLivraison: [{ id: 'a1', libelle: 'Chantier', adresse: 'x', ville: 'y', codePostal: '1', parDefaut: false, type: 'livraison' }] });
    expect(controlerFacture(facture(), c, EMETTEUR).avertissements.some(a => a.includes('livraison'))).toBe(true);
    expect(controlerFacture(facture({ livraisonALaFacturation: true }), c, EMETTEUR).avertissements.some(a => a.includes('adresses de livraison'))).toBe(false);
  });
});

describe('mentions de paiement', () => {
  it('pénalités, 40 €, escompte ; TVA sur les débits seulement pour des services', () => {
    expect(mentionsPaiement({ categorieOperation: 'biens', tvaSurDebits: true })).toHaveLength(3);
    expect(mentionsPaiement({ categorieOperation: 'services', tvaSurDebits: true }).at(-1)).toContain('débits');
  });
});
