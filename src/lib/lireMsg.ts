/**
 * Lecteur de messages Outlook (.msg).
 *
 * Un .msg est un conteneur OLE (« Compound File Binary »), c'est-à-dire un
 * petit système de fichiers : en-tête, table d'allocation, répertoire, flux.
 * Chaque propriété du message y est un flux nommé `__substg1.0_XXXXYYYY`, où
 * XXXX identifie la propriété et YYYY son type.
 *
 * L'extraction précédente ne lisait pas cette structure : elle balayait les
 * octets du fichier à la recherche de suites de caractères UTF-16 lisibles,
 * puis écartait celles qui « ressemblaient » à de la technique. Une liste noire
 * ne peut pas être complète — les en-têtes de transport Exchange, en
 * minuscules, passaient au travers et arrivaient jusqu'à l'IA en guise de
 * corps de message. D'où des analyses vides.
 *
 * Ici on lit les propriétés voulues, et rien d'autre. Porté depuis
 * msg_reader.py du Chiffrage ISOSIGN, à l'identique.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const LIBRE = 0xfffffffa; // au-delà : secteur libre, fin de chaîne, etc.

/** Propriétés MAPI retenues, par identifiant. */
const PROPRIETES: Record<string, string> = {
  '0037': 'sujet',
  '1000': 'corps',
  '1013': 'corpsHtml',
  '0C1A': 'expediteurNom',
  '0C1F': 'expediteurAdresse',   // souvent une adresse interne Exchange
  '5D01': 'expediteurSmtp',      // la vraie adresse, quand elle est présente
  '3A16': 'societe',
};

export interface MessageOutlook {
  sujet: string;
  corps: string;
  expediteurNom: string;
  expediteurAdresse: string;
  societe: string;
  /** Texte prêt pour l'analyse : objet, expéditeur, puis corps. */
  texte: string;
}

interface Entree {
  nom: string;
  type: number;   // 0 libre, 1 dossier, 2 flux, 5 racine
  debut: number;
  taille: number;
  /* Le répertoire est un arbre : chaque entrée porte ses deux voisins de même
     niveau et son premier enfant. Sans eux on a la liste des flux, mais pas
     leur appartenance — or c'est le dossier `__attach_version1.0_#…` qui dit
     quels flux forment UNE pièce jointe. */
  gauche: number;
  droite: number;
  enfant: number;
}

/** Pièce jointe d'un message : son nom d'origine et ses octets exacts. */
export interface PieceJointeMsg {
  nom: string;
  buffer: ArrayBuffer;
}

class ErreurCFBF extends Error {}

class ConteneurOle {
  private vue: DataView;
  private octets: Uint8Array;
  private tailleSecteur: number;
  private tailleMini: number;
  private nbFat: number;
  private debutRepertoire: number;
  private seuilMini: number;
  private debutMiniFat: number;
  private debutDifat: number;
  private nbDifat: number;
  private fat: number[] = [];
  private miniFat: number[] = [];
  entrees: Entree[] = [];
  private fluxMini: Uint8Array = new Uint8Array(0);

  constructor(donnees: ArrayBuffer) {
    this.octets = new Uint8Array(donnees);
    this.vue = new DataView(donnees);
    if (this.octets.length < 512 || SIGNATURE.some((b, i) => this.octets[i] !== b)) {
      throw new ErreurCFBF("ce fichier n'est pas un message Outlook (.msg) valide");
    }
    this.tailleSecteur = 1 << this.vue.getUint16(30, true);
    this.tailleMini = 1 << this.vue.getUint16(32, true);
    this.nbFat = this.vue.getUint32(44, true);
    this.debutRepertoire = this.vue.getUint32(48, true);
    this.seuilMini = this.vue.getUint32(56, true);
    this.debutMiniFat = this.vue.getUint32(60, true);
    this.debutDifat = this.vue.getUint32(68, true);
    this.nbDifat = this.vue.getUint32(72, true);

    this.fat = this.lireFat();
    this.miniFat = this.lireChaineEntiers(this.debutMiniFat);
    this.entrees = this.lireRepertoire();
    this.fluxMini = this.lireFluxMini();
  }

  private secteur(n: number): Uint8Array {
    const debut = 512 + n * this.tailleSecteur;
    const bloc = this.octets.subarray(debut, debut + this.tailleSecteur);
    if (bloc.length === this.tailleSecteur) return bloc;
    const complet = new Uint8Array(this.tailleSecteur);
    complet.set(bloc);
    return complet;
  }

  private entiersDuSecteur(n: number): number[] {
    const bloc = this.secteur(n);
    const v = new DataView(bloc.buffer, bloc.byteOffset, bloc.byteLength);
    const out: number[] = [];
    for (let i = 0; i < bloc.length; i += 4) out.push(v.getUint32(i, true));
    return out;
  }

  private lireFat(): number[] {
    /* Les 109 premiers pointeurs tiennent dans l'en-tête ; au-delà, ils sont
       chaînés dans des secteurs DIFAT. */
    const secteurs: number[] = [];
    for (let i = 0; i < 109; i++) {
      const s = this.vue.getUint32(76 + i * 4, true);
      if (s < LIBRE) secteurs.push(s);
    }
    let suivant = this.debutDifat;
    let reste = this.nbDifat;
    while (suivant < LIBRE && reste > 0) {
      const vals = this.entiersDuSecteur(suivant);
      for (const v of vals.slice(0, -1)) if (v < LIBRE) secteurs.push(v);
      suivant = vals[vals.length - 1];
      reste--;
    }
    const fat: number[] = [];
    const aLire = this.nbFat ? secteurs.slice(0, this.nbFat) : secteurs;
    for (const s of aLire) fat.push(...this.entiersDuSecteur(s));
    return fat;
  }

  /** Suite des secteurs d'un flux, en remontant la table d'allocation. */
  private chaine(debut: number): number[] {
    const out: number[] = [];
    let cur = debut;
    let garde = 0;
    while (cur < LIBRE && garde < 1_000_000) {
      out.push(cur);
      cur = cur < this.fat.length ? this.fat[cur] : 0xfffffffe;
      garde++;
    }
    return out;
  }

  private lireChaineEntiers(debut: number): number[] {
    const vals: number[] = [];
    for (const s of this.chaine(debut)) vals.push(...this.entiersDuSecteur(s));
    return vals;
  }

  private concatener(secteurs: number[]): Uint8Array {
    const out = new Uint8Array(secteurs.length * this.tailleSecteur);
    secteurs.forEach((s, i) => out.set(this.secteur(s), i * this.tailleSecteur));
    return out;
  }

  private lireRepertoire(): Entree[] {
    const brut = this.concatener(this.chaine(this.debutRepertoire));
    const v = new DataView(brut.buffer, brut.byteOffset, brut.byteLength);
    const entrees: Entree[] = [];
    /* Une entrée libre est conservée (nom vide, type 0) : le rang dans ce
       tableau EST l'identifiant que les liens de l'arbre désignent, en sauter
       une décalerait tous les suivants. */
    for (let off = 0; off + 128 <= brut.length; off += 128) {
      const nlen = v.getUint16(off + 64, true);
      const nom = nlen >= 2
        ? new TextDecoder('utf-16le').decode(brut.subarray(off, off + (nlen - 2)))
        : '';
      entrees.push({
        nom,
        type: brut[off + 66],
        debut: v.getUint32(off + 116, true),
        // taille sur 64 bits ; un .msg dépassant 4 Go n'existe pas en pratique
        taille: Number(v.getBigUint64(off + 120, true)),
        gauche: v.getUint32(off + 68, true),
        droite: v.getUint32(off + 72, true),
        enfant: v.getUint32(off + 76, true),
      });
    }
    return entrees;
  }

  private lireFluxMini(): Uint8Array {
    const racine = this.entrees.find(e => e.type === 5);
    if (!racine || !racine.taille) return new Uint8Array(0);
    return this.concatener(this.chaine(racine.debut));
  }

  /** Contenu d'un flux : les petits passent par le mini-flux. */
  flux(e: Entree): Uint8Array {
    if (!e.taille) return new Uint8Array(0);
    if (e.taille < this.seuilMini) {
      const out = new Uint8Array(e.taille);
      let ecrit = 0;
      let cur = e.debut;
      let garde = 0;
      while (cur < LIBRE && ecrit < e.taille && garde < 1_000_000) {
        const debut = cur * this.tailleMini;
        const bloc = this.fluxMini.subarray(debut, debut + this.tailleMini);
        const n = Math.min(bloc.length, e.taille - ecrit);
        out.set(bloc.subarray(0, n), ecrit);
        ecrit += n;
        cur = cur < this.miniFat.length ? this.miniFat[cur] : 0xfffffffe;
        garde++;
      }
      return out;
    }
    return this.concatener(this.chaine(e.debut)).subarray(0, e.taille);
  }

  /** Entrées filles d'un dossier, par parcours de son arbre rouge-noir. */
  private enfantsDe(e: Entree): Entree[] {
    const out: Entree[] = [];
    const vus = new Set<number>();
    const pile = [e.enfant];
    while (pile.length) {
      const id = pile.pop()!;
      if (id >= this.entrees.length || vus.has(id)) continue;  // 0xFFFFFFFF = pas de voisin
      vus.add(id);
      const n = this.entrees[id];
      out.push(n);
      pile.push(n.gauche, n.droite);
    }
    return out;
  }

  /**
   * Pièces jointes du message, lues dans la structure.
   *
   * Chaque pièce jointe est un dossier `__attach_version1.0_#XXXXXXXX` dont le
   * flux `__substg1.0_37010102` porte les octets et `3707`/`3704` le nom de
   * fichier. On rend donc exactement ce qu'Outlook a rangé, nom compris.
   */
  piecesJointes(): PieceJointeMsg[] {
    const racine = this.entrees.find(e => e.type === 5);
    if (!racine) return [];
    const out: PieceJointeMsg[] = [];
    for (const dossier of this.enfantsDe(racine)) {
      if (dossier.type !== 1 || !/^__attach_version1\.0_#/i.test(dossier.nom)) continue;
      let donnees: Uint8Array | null = null;
      let nomLong = '', nomCourt = '', extension = '';
      for (const f of this.enfantsDe(dossier)) {
        if (f.type !== 2) continue;
        const m = /^__substg1\.0_([0-9A-Fa-f]{4})([0-9A-Fa-f]{4})$/.exec(f.nom);
        if (!m) continue;
        const prop = m[1].toUpperCase();
        const type = m[2].toUpperCase();
        if (prop === '3701' && type === '0102') donnees = this.flux(f);
        else if (prop === '3707') nomLong = decoder(this.flux(f), type) || '';
        else if (prop === '3704') nomCourt = decoder(this.flux(f), type) || '';
        else if (prop === '3703') extension = decoder(this.flux(f), type) || '';
      }
      /* Un message joint à un message (`3701000D`) est un conteneur, pas un
         fichier : il n'a pas de flux d'octets et sort d'ici sans bruit. */
      if (!donnees || donnees.length === 0) continue;
      const nom = (nomLong || nomCourt).trim()
        || `piece-jointe-${out.length + 1}${extension.trim()}`;
      out.push({ nom, buffer: donnees.slice().buffer });
    }
    return out;
  }
}

/** 001F = UTF-16LE, 001E = 8 bits. Les autres types ne nous intéressent pas. */
function decoder(brut: Uint8Array, typeHex: string): string | null {
  const t = typeHex.toUpperCase();
  if (t === '001F') {
    return new TextDecoder('utf-16le').decode(brut).replace(/\0+$/, '');
  }
  if (t === '001E') {
    for (const enc of ['utf-8', 'windows-1252', 'latin1']) {
      try {
        return new TextDecoder(enc).decode(brut).replace(/\0+$/, '');
      } catch { /* encodage suivant */ }
    }
  }
  return null;
}

/** Réduction d'un corps HTML en texte lisible : suffisant pour l'analyse. */
function htmlEnTexte(html: string): string {
  let t = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|tr|li|h[1-6])\s*>/gi, '\n');
  t = t.replace(/<\/t[dh]\s*>/gi, '\t');
  t = t.replace(/<[^>]+>/g, ' ');
  const remplacements: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&eacute;': 'é', '&egrave;': 'è', '&agrave;': 'à',
    '&ccedil;': 'ç', '&ocirc;': 'ô', '&ugrave;': 'ù',
  };
  for (const [k, v] of Object.entries(remplacements)) t = t.split(k).join(v);
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/**
 * Lit un .msg et rend ses champs utiles.
 * Lève une erreur si le fichier n'est pas un conteneur OLE valide.
 */
export async function lireMsg(fichier: File): Promise<MessageOutlook> {
  const conteneur = new ConteneurOle(await fichier.arrayBuffer());

  const valeurs: Record<string, string> = {};
  for (const e of conteneur.entrees) {
    if (e.type !== 2) continue;
    const m = /^__substg1\.0_([0-9A-Fa-f]{4})([0-9A-Fa-f]{4})$/.exec(e.nom);
    if (!m) continue;
    const champ = PROPRIETES[m[1].toUpperCase()];
    if (!champ) continue;
    const texte = decoder(conteneur.flux(e), m[2]);
    if (texte && !valeurs[champ]) valeurs[champ] = texte;
  }

  const sujet = (valeurs.sujet || '').trim();
  // Le corps HTML sert de repli : certains messages n'ont pas de version texte.
  const corps = (valeurs.corps || (valeurs.corpsHtml ? htmlEnTexte(valeurs.corpsHtml) : '')).trim();

  /* L'adresse SMTP prime sur l'adresse Exchange interne : c'est elle qui permet
     de retrouver le client, une adresse « /O=EXCHANGELABS/... » ne désignant
     rien hors du serveur qui l'a émise. */
  const brute = valeurs.expediteurSmtp || valeurs.expediteurAdresse || '';
  const expediteurAdresse = /@/.test(brute) ? brute.trim() : '';

  const entete = [
    sujet ? `Objet : ${sujet}` : '',
    valeurs.expediteurNom ? `De : ${valeurs.expediteurNom.trim()}` : '',
    expediteurAdresse ? `Adresse : ${expediteurAdresse}` : '',
    valeurs.societe ? `Société : ${valeurs.societe.trim()}` : '',
  ].filter(Boolean).join('\n');

  return {
    sujet,
    corps,
    expediteurNom: (valeurs.expediteurNom || '').trim(),
    expediteurAdresse,
    societe: (valeurs.societe || '').trim(),
    texte: [entete, corps].filter(Boolean).join('\n\n'),
  };
}

/**
 * Pièces jointes d'un .msg, avec leur nom d'origine.
 * Lève la même erreur que `lireMsg` si le fichier n'est pas un conteneur OLE.
 */
export async function lirePiecesJointesMsg(fichier: File): Promise<PieceJointeMsg[]> {
  return new ConteneurOle(await fichier.arrayBuffer()).piecesJointes();
}
