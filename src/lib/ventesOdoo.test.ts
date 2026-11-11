import { describe, it, expect } from 'vitest';
import { preparerImport, rapprocherClient, normaliserNom, type PartenaireVente, type ResultatOdooVentes, type LigneVenteOdoo } from './ventesOdoo';
import { construirePivot, faitsVentesOdoo, valeurMesure } from './analyseCroisee';
import type { Client } from './store';

const part = (id: number, nom: string, extra: Partial<PartenaireVente> = {}): PartenaireVente =>
  ({ id, nom, estSociete: true, email: '', telephone: '', mobile: '', adresse: '', codePostal: '', ville: '', tva: '', ...extra });
const client = (id: string, societe: string, extra: Partial<Client> = {}) =>
  ({ id, nom: 'Contact', societe, email: '', telephone: '', adresse: '', ville: '', codePostal: '', dateCreation: '2026-01-01', adressesLivraison: [], ...extra } as Client);
const ligne = (o: Partial<LigneVenteOdoo>): LigneVenteOdoo => ({
  source: 'facture', odooLigneId: 1, odooDocumentId: 10, numero: 'FAC/2026/0001', typeDocument: 'facture', date: '2026-03-02',
  statut: 'Payée', partenaireId: 1, commercial: 'François MOUHOT', reference: 'FLOWFAST31920', designation: 'FLOWFAST 319 (20 kg)',
  categorie: 'ISOMARK / FLOORING / MMA', quantite: 2, totalHT: 400, referenceAffaire: '', ...o,
});

describe('rapprochement client', () => {
  it('nom exact sans accents ni ponctuation', () => {
    expect(normaliserNom('Top Signalisation.')).toBe(normaliserNom('TOP  SIGNALISATION'));
    expect(rapprocherClient(part(1, 'TOP SIGNALISATION'), [client('c1', 'Top Signalisation')], new Map())?.id).toBe('c1');
  });
  it('jamais à peu près : un nom voisin ne rattache rien', () => {
    expect(rapprocherClient(part(1, 'TOP SIGNALISATION SUD'), [client('c1', 'Top Signalisation')], new Map())).toBeNull();
  });
  it('TVA et lien précédent passent avant le nom', () => {
    const cs = [client('c1', 'AUBRAC SIGNAL'), client('c2', 'Aubrac', { tvaIntra: 'FR 12 345678901' })];
    expect(rapprocherClient(part(1, 'AUBRAC SIGNAL', { tva: 'FR12345678901' }), cs, new Map())?.id).toBe('c2');
    expect(rapprocherClient(part(1, 'AUBRAC SIGNAL'), cs, new Map([[1, 'c2']]))?.id).toBe('c2');
  });
});

describe('preparerImport', () => {
  const r: ResultatOdooVentes = {
    annee: 2026, perimetre: 'flooring', journal: [],
    partenaires: [part(1, 'TOP SIGNALISATION'), part(2, 'NOUVEAU CLIENT', { email: 'a@b.fr' })],
    lignes: [
      ligne({ odooLigneId: 1, partenaireId: 1 }),
      ligne({ odooLigneId: 2, odooDocumentId: 11, partenaireId: 2 }),
      ligne({ odooLigneId: 3, odooDocumentId: 12, partenaireId: 2, typeDocument: 'avoir', quantite: -1, totalHT: -200 }),
    ],
  };

  it('rattache, crée une seule fiche par partenaire, garde le signe des avoirs', () => {
    const { nouveauxClients, lignes, rattaches } = preparerImport(r, [client('c1', 'Top Signalisation')], [], '2026-11-11');
    expect(rattaches).toBe(1);
    expect(nouveauxClients).toHaveLength(1);
    expect(nouveauxClients[0].societe).toBe('NOUVEAU CLIENT');
    expect(nouveauxClients[0].notes).toContain('partenaire #2');
    expect(lignes.map(l => l.client_id)).toEqual(['c1', nouveauxClients[0].id, nouveauxClients[0].id]);

    const faits = faitsVentesOdoo(lignes, 'facturesOdoo', { clientParId: id => [client('c1', 'Top Signalisation'), ...nouveauxClients].find(c => c.id === id) });
    const p = construirePivot(faits, ['client'], null);
    expect(valeurMesure(p.racine.total, 'totalHT')).toBe(600);
    expect(valeurMesure(p.racine.enfants.find(n => n.libelle === 'NOUVEAU CLIENT')!.total, 'totalHT')).toBe(200);
  });

  it('un partenaire écarté ne recrée pas de fiche', () => {
    const { nouveauxClients, lignes } = preparerImport(r, [client('c1', 'Top Signalisation')], [{ partenaire_odoo_id: 2, client_id: 'ecarte' }], '2026-11-11');
    expect(nouveauxClients).toHaveLength(0);
    expect(lignes.filter(l => l.partenaire_odoo_id === 2).every(l => l.client_id === 'ecarte')).toBe(true);
  });

  it('un import suivant retrouve la fiche créée (mention des notes), sans doublon', () => {
    const premier = preparerImport(r, [client('c1', 'Top Signalisation')], [], '2026-11-11');
    const second = preparerImport(r, [client('c1', 'Top Signalisation'), ...premier.nouveauxClients], [], '2026-11-12');
    expect(second.nouveauxClients).toHaveLength(0);
  });
});

describe('documentsOdoo', () => {
  it('regroupe par document, total des lignes, plus récent d\'abord, source respectée', async () => {
    const { documentsOdoo, dansPerimetreOdoo } = await import('./ventesOdoo');
    const base = { perimetre: 'flooring', type_document: 'commande' as const, statut: 'À facturer', partenaire_odoo_id: 1, partenaire_nom: 'TOP', client_id: 'c1', commercial: 'François MOUHOT', reference: 'R', designation: 'D', categorie: 'ISOMARK / FLOORING / MMA', reference_affaire: null };
    const docs = documentsOdoo([
      { ...base, source: 'commande', odoo_ligne_id: 1, odoo_document_id: 5, numero: 'S0005', date: '2026-02-01', quantite: 1, total_ht: 100 },
      { ...base, source: 'commande', odoo_ligne_id: 2, odoo_document_id: 5, numero: 'S0005', date: '2026-02-01', quantite: 2, total_ht: 50.5 },
      { ...base, source: 'commande', odoo_ligne_id: 3, odoo_document_id: 9, numero: 'S0009', date: '2026-06-01', quantite: 1, total_ht: 10 },
      { ...base, source: 'facture', odoo_ligne_id: 4, odoo_document_id: 7, numero: 'F7', date: '2026-07-01', quantite: 1, total_ht: 10 },
    ], 'commande');
    expect(docs.map(d => [d.numero, d.totalHT, d.lignes.length])).toEqual([['S0009', 10, 1], ['S0005', 150.5, 2]]);
    expect(dansPerimetreOdoo({ commercial: 'François MOUHOT' }, false, 'francois mouhot')).toBe(true);
    expect(dansPerimetreOdoo({ commercial: 'Dante TORELLA' }, false, 'François MOUHOT')).toBe(false);
  });
});
