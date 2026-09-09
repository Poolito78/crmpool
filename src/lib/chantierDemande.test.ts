import { describe, it, expect } from 'vitest';
import { chantierDansTexte } from './chantierDemande';

describe('le chantier lu dans la demande', () => {
  /* Le cas réel : le mail de MGD pour le devis Odoo AF036911, dont la case
     Chantier porte « CHANTIER PANTIN ». */
  it('lit le chantier dans l’objet du mail', () => {
    expect(chantierDansTexte('Objet : Consultation Chantier PANTIN\nDe : Meyriam KHERBOUCHE'))
      .toBe('PANTIN');
    /* « Zac des Vignes » se réduit à « Zac » : la préposition arrête la
       lecture, et le chantier vaut mieux tronqué que prolongé au hasard. */
    expect(chantierDansTexte('Subject: Devis chantier Zac des Vignes')).toBe('Zac');
  });

  /* ⚠️ LE PIÈGE QUI JUSTIFIE LA FONCTION. « chantier » est aussi un mot de la
     signalisation : sur ces lignes-là il qualifie le panneau, pas le lieu.
     Proposer « interdit » comme chantier serait pire que ne rien proposer. */
  it('ne prend pas la prose de signalisation pour un lieu', () => {
    expect(chantierDansTexte('7 panneaux KC1 chantier interdit au public')).toBeNull();
    expect(chantierDansTexte('2 panneaux de chantier mobile')).toBeNull();
    expect(chantierDansTexte('panneaux de signalisation de chantier')).toBeNull();
  });

  /* L'objet prime sur le corps — et c'est le corps qui parle des panneaux. */
  it('préfère l’objet au corps du message', () => {
    const mail = [
      'Objet : Consultation Chantier PANTIN',
      '',
      'Peux-tu me chiffrer :',
      '7 panneaux KC1 chantier interdit au public ;',
    ].join('\n');
    expect(chantierDansTexte(mail)).toBe('PANTIN');
  });

  /* Faute d'objet, le corps peut nommer le chantier. */
  it('descend dans le corps quand l’objet est muet', () => {
    expect(chantierDansTexte('Bonjour,\nMerci pour le chantier SAINT-DENIS.')).toBe('SAINT-DENIS');
  });

  it('garde les accents du nom', () => {
    expect(chantierDansTexte('Objet : chantier Séméac')).toBe('Séméac');
  });

  /* Rendre `null` est une réponse : une case vide se remplit en trois
     secondes, un chantier inventé se recopie dans Odoo. */
  it('ne propose rien plutôt que n’importe quoi', () => {
    expect(chantierDansTexte('')).toBeNull();
    expect(chantierDansTexte('Demande de devis pour panneaux')).toBeNull();
    expect(chantierDansTexte('chantier 94440')).toBeNull();
  });
});
