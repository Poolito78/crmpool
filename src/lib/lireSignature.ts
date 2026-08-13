/**
 * Lecture des coordonnées portées par l'image de signature d'un message.
 *
 * Beaucoup de signatures professionnelles sont une image : le nom, la fonction,
 * les téléphones et l'adresse n'existent nulle part dans le texte du message.
 * Sur une demande de REFLEX SIGNALISATION, tout le bloc — Thierry BARAILLER,
 * responsable d'exploitation, ses deux numéros, l'adresse de Bailly-
 * Romainvilliers — était dans un PNG, et l'analyse retenait « Manue », le
 * prénom de la destinataire lu dans le corps du texte.
 *
 * On extrait donc les images du message et on les fait lire. Gemini Flash sait
 * le faire ; c'est déjà le modèle de repli de l'analyse de document.
 */

export interface ContactSignature {
  nom?: string;
  fonction?: string;
  societe?: string;
  email?: string;
  telephone?: string;
  mobile?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
}

/** Signatures des formats d'image qu'on sait reconnaître dans un flux binaire. */
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const PNG_FIN = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const JPEG_FIN = [0xff, 0xd9];

function indexOf(hay: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

export interface ImageExtraite {
  mime: 'image/png' | 'image/jpeg';
  /** Contenu en base64, sans en-tête data:. */
  base64: string;
  octets: number;
}

/**
 * Images contenues dans un fichier .msg ou .eml.
 *
 * On balaie le binaire plutôt que de décoder proprement le format : une
 * signature Outlook range son logo tantôt en pièce jointe MAPI, tantôt en
 * inline base64 dans le HTML. Chercher les entêtes de fichier attrape les deux.
 *
 * Les images minuscules sont écartées — pouces de suivi, puces, séparateurs —
 * comme les très grandes, qui sont des photos de chantier et non des
 * signatures.
 */
export async function extraireImages(
  file: File,
  { minOctets = 4_000, maxOctets = 2_000_000, maxImages = 4 } = {},
): Promise<ImageExtraite[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const out: ImageExtraite[] = [];

  const cherche = (
    debut: number[], fin: number[], mime: ImageExtraite['mime'],
  ) => {
    let pos = 0;
    while (out.length < maxImages) {
      const d = indexOf(bytes, debut, pos);
      if (d === -1) break;
      let f = indexOf(bytes, fin, d + debut.length);
      f = f === -1 ? Math.min(bytes.length, d + maxOctets) : f + fin.length;
      const taille = f - d;
      pos = f;
      if (taille < minOctets || taille > maxOctets) continue;
      out.push({ mime, base64: enBase64(bytes.subarray(d, f)), octets: taille });
    }
  };

  cherche(PNG, PNG_FIN, 'image/png');
  cherche(JPEG, JPEG_FIN, 'image/jpeg');

  // Le plus gros d'abord : une signature pèse davantage qu'une icône.
  return out.sort((a, b) => b.octets - a.octets).slice(0, maxImages);
}

function enBase64(bytes: Uint8Array): string {
  let binaire = '';
  const pas = 0x8000; // par tranches, sinon la pile déborde sur les gros blocs
  for (let i = 0; i < bytes.length; i += pas) {
    binaire += String.fromCharCode(...bytes.subarray(i, i + pas));
  }
  return btoa(binaire);
}

const CONSIGNE = `Tu lis le bloc de signature d'un email professionnel français.
Rends UNIQUEMENT un objet JSON, sans texte autour, avec ces clés :
nom, fonction, societe, email, telephone, mobile, adresse, codePostal, ville.

Règles :
- « nom » est la personne signataire, pas le destinataire.
- « societe » est la raison sociale de l'entreprise du signataire.
- « mobile » est le numéro préfixé P, Port., Mob. ou commençant par +33 6 / 06.
- « telephone » est le numéro fixe, préfixé T, Tél. ou commençant par +33 1..5.
- Omets une clé plutôt que d'inventer sa valeur.
- N'invente jamais une adresse email : recopie celle qui est écrite.`;

/**
 * Fait lire les images par Gemini et renvoie les coordonnées trouvées.
 *
 * Renvoie `null` sans clé, sans image, ou si le modèle ne rend rien
 * d'exploitable — l'analyse doit continuer sans, comme avant.
 */
export async function lireSignature(
  images: ImageExtraite[],
  geminiKey?: string,
): Promise<ContactSignature | null> {
  if (!geminiKey || !images.length) return null;

  const corps = {
    contents: [{
      parts: [
        { text: CONSIGNE },
        ...images.map(i => ({
          inline_data: { mime_type: i.mime, data: i.base64 },
        })),
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 600 },
  };

  for (const modele of ['gemini-2.0-flash', 'gemini-2.0-flash-lite']) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        },
      );
      if (!r.ok) { console.warn(`[signature] ${modele} ${r.status}`); continue; }
      const data = await r.json();
      const texte = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const json = texte.match(/\{[\s\S]*\}/);
      if (!json) { console.warn(`[signature] ${modele} : pas de JSON`); continue; }

      const brut = JSON.parse(json[0]) as Record<string, unknown>;
      const c: ContactSignature = {};
      for (const cle of ['nom', 'fonction', 'societe', 'email', 'telephone',
                         'mobile', 'adresse', 'codePostal', 'ville'] as const) {
        const v = brut[cle];
        if (typeof v === 'string' && v.trim()) c[cle] = v.trim();
      }
      // Une signature sans nom ni société n'apprend rien d'utile.
      return (c.nom || c.societe) ? c : null;
    } catch (e) {
      console.warn(`[signature] ${modele} exception`, e);
    }
  }
  return null;
}
