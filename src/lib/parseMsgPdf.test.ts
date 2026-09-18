/**
 * Un .msg est un conteneur OLE. On en fabrique ici un minuscule, complet et
 * conforme — en-tête, table d'allocation, répertoire, mini-flux — plutôt que
 * de joindre un vrai message au dépôt : le test dit alors exactement ce qui
 * est lu, et pourquoi.
 */
import { describe, it, expect } from 'vitest';
import { extrairePJsDeMsg } from './parseMsgPdf';

/* jsdom donne bien un `File`, mais sans `arrayBuffer()` : on fabrique donc le
   minimum que lisent les deux fonctions testées. */
function fichier(nom: string, octets: Uint8Array): File {
  return { name: nom, arrayBuffer: async () => octets.slice().buffer } as unknown as File;
}

const SECTEUR = 512;
const MINI = 64;
const LIBRE = 0xffffffff;
const FIN = 0xfffffffe;
const FAT_SECT = 0xfffffffd;

function nomUtf16(nom: string): Uint8Array {
  const out = new Uint8Array(64);
  for (let i = 0; i < nom.length && i * 2 + 1 < 62; i++) {
    out[i * 2] = nom.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = nom.charCodeAt(i) >> 8;
  }
  return out;
}

interface EntreeTest {
  nom: string; type: number; gauche: number; droite: number; enfant: number;
  debut: number; taille: number;
}

/** Construit un .msg portant une seule pièce jointe. */
function fabriquerMsg(nomPJ: string, contenu: Uint8Array): File {
  const secteursData = Math.ceil(contenu.length / SECTEUR);
  const PREMIER_DATA = 4;                       // 0 FAT, 1 répertoire, 2 miniFAT, 3 mini-flux
  const nbSecteurs = PREMIER_DATA + secteursData;
  const octets = new Uint8Array(SECTEUR * (1 + nbSecteurs));
  const v = new DataView(octets.buffer);
  const sect = (n: number) => SECTEUR + n * SECTEUR;

  // ── en-tête ──
  octets.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  v.setUint16(26, 3, true);            // version majeure
  v.setUint16(28, 0xfffe, true);       // petit-boutiste
  v.setUint16(30, 9, true);            // secteur = 512
  v.setUint16(32, 6, true);            // mini-secteur = 64
  v.setUint32(44, 1, true);            // 1 secteur de FAT
  v.setUint32(48, 1, true);            // répertoire en secteur 1
  v.setUint32(56, 4096, true);         // seuil du mini-flux
  v.setUint32(60, 2, true);            // miniFAT en secteur 2
  v.setUint32(64, 1, true);            // 1 secteur de miniFAT
  v.setUint32(68, FIN, true);          // pas de DIFAT
  v.setUint32(72, 0, true);
  for (let i = 0; i < 109; i++) v.setUint32(76 + i * 4, i === 0 ? 0 : LIBRE, true);

  // ── FAT (secteur 0) ──
  const fat = new Array(SECTEUR / 4).fill(LIBRE);
  fat[0] = FAT_SECT; fat[1] = FIN; fat[2] = FIN; fat[3] = FIN;
  for (let i = 0; i < secteursData; i++) {
    fat[PREMIER_DATA + i] = i === secteursData - 1 ? FIN : PREMIER_DATA + i + 1;
  }
  fat.forEach((val, i) => v.setUint32(sect(0) + i * 4, val, true));

  // ── miniFAT (secteur 2) : le nom de fichier tient dans un mini-secteur ──
  const mini = new Array(SECTEUR / 4).fill(LIBRE);
  mini[0] = FIN;
  mini.forEach((val, i) => v.setUint32(sect(2) + i * 4, val, true));

  // ── mini-flux (secteur 3) : le nom de la pièce jointe, en UTF-16LE ──
  const nomBrut = new Uint8Array(nomPJ.length * 2);
  for (let i = 0; i < nomPJ.length; i++) {
    nomBrut[i * 2] = nomPJ.charCodeAt(i) & 0xff;
    nomBrut[i * 2 + 1] = nomPJ.charCodeAt(i) >> 8;
  }
  octets.set(nomBrut, sect(3));

  // ── contenu de la pièce jointe ──
  octets.set(contenu, sect(PREMIER_DATA));

  // ── répertoire (secteur 1) ──
  const entrees: EntreeTest[] = [
    { nom: 'Root Entry',                    type: 5, gauche: LIBRE, droite: LIBRE, enfant: 1, debut: 3, taille: SECTEUR },
    { nom: '__attach_version1.0_#00000000', type: 1, gauche: LIBRE, droite: LIBRE, enfant: 2, debut: 0, taille: 0 },
    { nom: '__substg1.0_37010102',          type: 2, gauche: LIBRE, droite: 3,     enfant: LIBRE, debut: PREMIER_DATA, taille: contenu.length },
    { nom: '__substg1.0_3707001F',          type: 2, gauche: LIBRE, droite: LIBRE, enfant: LIBRE, debut: 0, taille: nomBrut.length },
  ];
  entrees.forEach((e, i) => {
    const off = sect(1) + i * 128;
    octets.set(nomUtf16(e.nom), off);
    v.setUint16(off + 64, (e.nom.length + 1) * 2, true);
    octets[off + 66] = e.type;
    v.setUint32(off + 68, e.gauche, true);
    v.setUint32(off + 72, e.droite, true);
    v.setUint32(off + 76, e.enfant, true);
    v.setUint32(off + 116, e.debut, true);
    v.setBigUint64(off + 120, BigInt(e.taille), true);
  });

  return fichier('message.msg', octets);
}

/**
 * Un PDF linéarisé porte un `%%EOF` dès sa table de première page.
 * Au-delà de 4 096 octets — le seuil du mini-flux — une pièce jointe est
 * rangée dans les secteurs ordinaires, comme l'est tout PDF réel.
 */
function pdfLinearise(taille = 5000): Uint8Array {
  const tete = '%PDF-1.7\n1 0 obj<</Linearized 1>>endobj\ntrailer<</Root 2 0 R>>\nstartxref\n0\n%%EOF\n';
  const corps = 'x'.repeat(Math.max(0, taille - tete.length - 30));
  const texte = `${tete}${corps}\nstartxref\n999\n%%EOF`;
  return new TextEncoder().encode(texte);
}

describe('extrairePJsDeMsg', () => {
  it('rend la pièce jointe entière, avec son nom d’origine', async () => {
    const contenu = pdfLinearise();
    const pjs = await extrairePJsDeMsg(fabriquerMsg('devis trappes.pdf', contenu));

    expect(pjs).toHaveLength(1);
    expect(pjs[0].name).toBe('devis trappes.pdf');
    expect(pjs[0].type).toBe('pdf');
    expect(Array.from(new Uint8Array(pjs[0].buffer))).toEqual(Array.from(contenu));
  });

  it('au repli binaire, coupe au DERNIER %%EOF et non au premier', async () => {
    /* Fichier qui n'est pas un conteneur OLE : la lecture structurée échoue et
       le balayage prend le relais. Couper au premier `%%EOF` rendait un PDF
       tronqué que pdf.js refusait (« Invalid Root reference. »). */
    const contenu = pdfLinearise();
    const brut = new Uint8Array(contenu.length + 64);
    brut.set(new TextEncoder().encode('entete quelconque du message'), 0);
    brut.set(contenu, 64);
    const faux = fichier('abime.msg', brut);

    const pjs = await extrairePJsDeMsg(faux);
    expect(pjs).toHaveLength(1);
    expect(Array.from(new Uint8Array(pjs[0].buffer))).toEqual(Array.from(contenu));
  });
});
