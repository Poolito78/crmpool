import { describe, expect, it } from 'vitest';
import { adressesDuMail, rapprocherMail, type DevisOdooLu, type ReponseDevisOdoo } from './devisOdooMails';
import type { TriMail } from './agentMail';

const tri = (t: Partial<TriMail> = {}): TriMail => ({
  id: 'x', categorie: 'demande_devis', confiance: 95, resume: '', demandes: [], ...t,
});

const devis = (d: Partial<DevisOdooLu> = {}): DevisOdooLu => ({
  numero: 'AF040100', societeId: 7, societe: 'SIGNAL ECO', creeLe: '2026-11-07T09:00:00Z',
  etat: 'draft', montantHT: 100, lignes: [], ...d,
});

const odoo = (...liste: DevisOdooLu[]): ReponseDevisOdoo => ({
  parEmail: { 'thomas@signal-eco.fr': [7] }, parDomaine: { 'signal-eco.fr': [7] }, devis: liste,
});

const adresses = { emails: ['thomas@signal-eco.fr'], domaines: ['signal-eco.fr'] };
const mail = (t: Partial<TriMail> = {}, sujet = 'Demande de prix') => ({
  recuLe: '2026-11-06T16:08:00Z', sujet, tri: tri(t),
});

describe('rapprocherMail', () => {
  it("retient d'office le devis dont les lignes portent le code demandé", () => {
    const r = rapprocherMail(mail({ demandes: ['Fourniture de j11 60U'] }), adresses,
      odoo(devis({ lignes: ['[J11.500.C1.BTR.IS.BRUT] IS J11'] })));
    expect(r?.certitude).toBe('sur');
    expect(r?.preuves[0]).toContain('J11');
  });

  it('retient par le chantier, lu dans le mail ou dans son objet', () => {
    expect(rapprocherMail(mail({ chantier: 'Vélizy 2' }), adresses, odoo(devis({ chantier: 'VELIZY' })))?.certitude).toBe('sur');
    expect(rapprocherMail(mail({}, 'TR: Marché SV Ozoir'), adresses, odoo(devis({ refClient: 'OZOIR IDF' })))?.certitude).toBe('sur');
  });

  it('même client sans preuve : proposé, jamais retenu', () => {
    const r = rapprocherMail(mail({ demandes: ['12 panneaux AB4'] }), adresses,
      odoo(devis({ lignes: ['[B14.650.C1.BTR.IS.BRUT] IS B14'] })));
    expect(r?.certitude).toBe('possible');
    expect(r?.preuves).toEqual([]);
  });

  it('une classe ou une unité communes ne prouvent rien', () => {
    const r = rapprocherMail(mail({ demandes: ['panneau C1 20KG'] }), adresses,
      odoo(devis({ lignes: ['[B14.650.C1.BTR.IS.BRUT] IS B14 20KG'] })));
    expect(r?.certitude).toBe('possible');
  });

  it('le nom du client dans la référence ne prouve rien', () => {
    const r = rapprocherMail(mail({}, 'SIGNAL-ECO - Demande de prix'), adresses, odoo(devis({ refClient: 'SIGNAL ECO' })));
    expect(r?.certitude).toBe('possible');
  });

  it('il faut au moins la moitié des demandes', () => {
    const r = rapprocherMail(mail({ demandes: ['J11', 'AB4', 'B14'] }), adresses, odoo(devis({ lignes: ['[J11.500] IS J11'] })));
    expect(r?.certitude).toBe('possible');
  });

  it('écarte un devis antérieur au mail, trop tardif ou d\'une autre société', () => {
    const m = mail({ chantier: 'VELIZY' });
    expect(rapprocherMail(m, adresses, odoo(devis({ chantier: 'VELIZY', creeLe: '2026-11-05T09:00:00Z' })))).toBeNull();
    expect(rapprocherMail(m, adresses, odoo(devis({ chantier: 'VELIZY', creeLe: '2027-02-01T09:00:00Z' })))).toBeNull();
    expect(rapprocherMail(m, adresses, odoo(devis({ chantier: 'VELIZY', societeId: 8 })))).toBeNull();
  });

  it("ne rapproche qu'une demande de devis", () => {
    expect(rapprocherMail(mail({ categorie: 'suite_devis', chantier: 'VELIZY' }), adresses, odoo(devis({ chantier: 'VELIZY' })))).toBeNull();
  });

  it('préfère le devis prouvé à un devis antérieur sans preuve, et compte les autres', () => {
    const r = rapprocherMail(mail({ chantier: 'VELIZY' }), adresses, odoo(
      devis({ numero: 'AF1', creeLe: '2026-11-06T17:00:00Z' }),
      devis({ numero: 'AF2', creeLe: '2026-11-07T17:00:00Z', chantier: 'VELIZY' }),
    ));
    expect(r?.devis.numero).toBe('AF2');
    expect(r?.autres).toBe(1);
  });

  it('un devis refusé ne revient pas', () => {
    const r = rapprocherMail(mail({ chantier: 'VELIZY' }), adresses, odoo(devis({ chantier: 'VELIZY' })), n => n === 'AF040100');
    expect(r).toBeNull();
  });
});

describe('adressesDuMail', () => {
  it("prend l'expéditeur et le domaine de sa société", () => {
    expect(adressesDuMail({ deEmail: 'Thomas@Signal-Eco.fr', corps: '', sujet: '' }))
      .toEqual({ emails: ['thomas@signal-eco.fr'], domaines: ['signal-eco.fr'] });
  });

  it("un domaine grand public ne désigne personne, l'adresse reste", () => {
    expect(adressesDuMail({ deEmail: 'lilian@gmail.com', corps: '', sujet: '' }))
      .toEqual({ emails: ['lilian@gmail.com'], domaines: [] });
  });

  it("mail d'un collègue : l'expéditeur d'origine du transfert", () => {
    const corps = 'À chiffrer\n\nDe : Jean Dupont <jean@lctp.fr>\nEnvoyé : lundi 12 octobre 2026 14:00\nObjet : Vélizy 2\n\nBonjour';
    expect(adressesDuMail({ deEmail: 'yves@isosign.fr', corps, sujet: 'TR: Vélizy 2' }).emails).toEqual(['jean@lctp.fr']);
  });

  it('ajoute les adresses de la fiche client, sans les internes', () => {
    const r = adressesDuMail({ deEmail: 'a@lctp.fr', corps: '', sujet: '' },
      { email: 'compta@lctp.fr', contacts: [{ email: 'b@lctp.fr' }, { email: 'x@isosign.fr' }] });
    expect(r.emails).toEqual(['a@lctp.fr', 'compta@lctp.fr', 'b@lctp.fr']);
  });
});
