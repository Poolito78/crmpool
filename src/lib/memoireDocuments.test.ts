import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  signaturesEmetteur, souvenirParSignatures, emetteurDuTexte, typeDansLeSens, sensDuType,
  type MemoireDocument,
} from './memoireDocuments';

/* L'en-tête du devis 73974 de TRAFIC TECHNOLOGIE SYSTEME (09/10/2026). */
const TTS = `TRAFIC TECHNOLOGIE SYSTEME
ZI 1ère Av 2ème Rue BP 594 06516 CARROS
Tél: 04 92 08 29 99 Fax: 04 92 08 29 90
SAS au capital de 1 088 000 Euros
SIRET 398 379 214 00065 APE 2790Z
N° TVA : FR 72 398 379 214
Département : STEP DEVIS N° 73974_ 0
ISOSIGN SAS ISOSIGN SAS
Contact : Monsieur DIEVAL EMMANUELLE 03 85 77 07 25 -
e-mail: e.dieval@isosign.fr - FAX : 03 85 55 41 14
www.ttsys.eu`;

const souvenir = (m: Partial<MemoireDocument> & { cle: string }): MemoireDocument =>
  ({ sens: 'fournisseur', nb: 1, conflit: false, ...m });

describe('signaturesEmetteur', () => {
  it('lit le SIREN (SIRET, TVA) et le site, jamais ISOSIGN', () => {
    expect(signaturesEmetteur(TTS)).toEqual(['siren:398379214', 'site:ttsys.eu']);
  });
  it('écarte les messageries publiques', () => {
    expect(signaturesEmetteur('contact : jean.dupont@gmail.com')).toEqual([]);
  });
});

describe('emetteurDuTexte', () => {
  it('trouve la raison sociale au-dessus du capital et du SIRET', () => {
    expect(emetteurDuTexte(TTS)).toBe('TRAFIC TECHNOLOGIE SYSTEME');
  });
  it('ne rend jamais ISOSIGN', () => {
    expect(emetteurDuTexte('ISOSIGN SAS\nZA DU MONAY')).toBeUndefined();
  });
});

describe('souvenirParSignatures', () => {
  it('rappelle le fournisseur retenu', () => {
    const m = [souvenir({ cle: 'siren:398379214', fournisseurId: 'f-tts', nom: 'TTS', nb: 2 })];
    expect(souvenirParSignatures(m, signaturesEmetteur(TTS))?.fournisseurId).toBe('f-tts');
  });
  it('se tait quand les signatures se contredisent ou sont en conflit', () => {
    expect(souvenirParSignatures([
      souvenir({ cle: 'siren:398379214', fournisseurId: 'f-tts' }),
      souvenir({ cle: 'site:ttsys.eu', fournisseurId: 'f-autre' }),
    ], signaturesEmetteur(TTS))).toBeUndefined();
    expect(souvenirParSignatures([souvenir({ cle: 'siren:398379214', conflit: true })],
      signaturesEmetteur(TTS))).toBeUndefined();
  });
});

describe('le sens du document', () => {
  it('remet un « devis client » d’un fournisseur à l’endroit', () => {
    expect(typeDansLeSens('devis_client', 'fournisseur')).toBe('devis_fournisseur');
    expect(typeDansLeSens('facture_client', 'fournisseur')).toBe('facture_fournisseur');
    expect(typeDansLeSens('bon_livraison', 'fournisseur')).toBe('bon_livraison');
    expect(typeDansLeSens('devis_fournisseur', 'client')).toBe('devis_client');
  });
  it('sensDuType', () => {
    expect(sensDuType('devis_fournisseur')).toBe('fournisseur');
    expect(sensDuType('demande_devis')).toBe('client');
    expect(sensDuType('offre_prix')).toBeUndefined();
  });
});
