/**
 * Mails types d'envoi : l'objet et le corps proposés quand on envoie un devis,
 * une commande fournisseur, une facture ou l'accusé de réception d'une
 * commande client.
 *
 * Chaque utilisateur règle les siens dans Paramètres → Mails (table
 * `mails_types`, une ligne par type) — chacun sa signature. Un type sans ligne
 * garde le texte d'origine de l'application (`MAILS_DEFAUT`), qui reprend
 * ce que les dialogues écrivaient en dur avant.
 *
 * Les valeurs du document entrent par des champs `{numero}`, `{montantHT}`…
 * Un passage entre `[[ ]]` disparaît si l'un de ses champs est vide : « (Réf.
 * {reference}) » ne doit pas laisser « (Réf. ) » sur un devis sans référence.
 * Un champ inconnu reste tel quel, pour que la faute de frappe se voie.
 *
 * Les relances de devis gardent leurs propres mails types (`relanceDevis.ts`),
 * choisis au rang de la relance.
 *
 * IMAGES (logo, signature) : rangées avec le mail type en data URL, placées
 * dans le texte par un repère `{img:logo}` — sur sa propre ligne ou dans le
 * fil du texte. À l'envoi, le .eml les porte EN LIGNE (multipart/related,
 * `cid:`) : un lien vers une image externe est bloqué par Outlook. Sur
 * mobile (mailto, texte seul), les repères s'effacent.
 *
 * MISE EN FORME (police, taille, couleur, gras, italique) : le texte d'un mail
 * type mis en forme est du HTML (`EditeurMail`) ; les textes d'origine et les
 * réglages d'avant restent du texte brut, lu ligne à ligne. `estHtmlMail`
 * tranche, et chaque fonction ci-dessous accepte les deux. Le HTML est
 * nettoyé (`nettoyerHtml`) avant d'être affiché ou envoyé.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TypeMail = 'devis' | 'commande_fournisseur' | 'facture' | 'ar_commande';

export interface ImageMail {
  /** Identifiant du repère `{img:id}` (lettres, chiffres, tirets). */
  id: string;
  nom: string;
  /** L'image elle-même, réduite à l'ajout (data:image/png;base64,…). */
  dataUrl: string;
  /** Largeur affichée dans le mail, en pixels. */
  largeur: number;
}

export interface ModeleMail { objet: string; corps: string; images?: ImageMail[] }

export interface DefinitionMail extends ModeleMail {
  libelle: string;
  description: string;
  /** Champs disponibles : clé → libellé et exemple (aperçu des Paramètres). */
  champs: Record<string, { libelle: string; exemple: string }>;
}

const DESTINATAIRE = { libelle: 'Nom du destinataire', exemple: 'Roger Cheval' };
const NUMERO = { libelle: 'Numéro', exemple: 'DEV-2026-138' };
const REFERENCE = { libelle: "Réf. affaire", exemple: 'BAO BLANCHE' };
const SOCIETE = { libelle: 'Société', exemple: "PRESTA'SERVICE" };

export const MAILS_DEFAUT: Record<TypeMail, DefinitionMail> = {
  devis: {
    libelle: 'Envoi de devis',
    description: "Proposé par « Envoyer par mail » d'un devis (la relance garde ses propres mails types).",
    objet: 'Devis {numero}[[ — {reference}]][[ — {societe}]][[ — {chantier}]]',
    corps: `Bonjour[[ {destinataire}]],

Suite à notre échange, tu trouveras ci-joint notre devis {numero}[[ (Réf. {reference})]] d'un montant de {montantHT} HT.[[
Chantier : {chantier}]]
Ce devis est valable jusqu'au {validite}.

Restant à ta disposition pour tout complément d'information.`,
    champs: {
      destinataire: DESTINATAIRE, numero: NUMERO, reference: REFERENCE, societe: SOCIETE,
      chantier: { libelle: 'Chantier', exemple: 'BAO BLANCHE 64 ML' },
      montantHT: { libelle: 'Montant HT', exemple: '846,80 €' },
      montantTTC: { libelle: 'Montant TTC', exemple: '1 016,16 €' },
      validite: { libelle: 'Valable jusqu\'au', exemple: '12/11/2026' },
    },
  },
  commande_fournisseur: {
    libelle: 'Commande fournisseur',
    description: "Proposé à l'envoi d'une commande à un fournisseur.",
    objet: 'Commande {numero}[[ — {societe}]]',
    corps: `Bonjour[[ {destinataire}]],

Veuillez trouver ci-joint notre commande {numero} d'un montant de {montantTTC} TTC.

Détail :
{detail}

Total HT : {montantHT}
Transport : {transport}
Total TTC : {montantTTC}

Merci de confirmer la réception de cette commande et de nous communiquer le délai de livraison.

Cordialement,
[Votre nom]
[Votre entreprise]`,
    champs: {
      destinataire: DESTINATAIRE, numero: { libelle: 'Numéro', exemple: 'CF-2026-042' }, societe: { libelle: 'Société', exemple: 'URBADECCO' },
      detail: { libelle: 'Détail des lignes', exemple: '- Quartz gris 0,7-1,3 (Réf: QUARTZGRI0.7-1.3) × 10 = 228,50 €' },
      montantHT: { libelle: 'Total HT', exemple: '228,50 €' },
      transport: { libelle: 'Transport', exemple: 'Franco' },
      montantTTC: { libelle: 'Total TTC', exemple: '274,20 €' },
    },
  },
  facture: {
    libelle: 'Facture client',
    description: "Proposé à l'envoi d'une facture au client.",
    objet: 'Facture {numero}[[ — Réf. {reference}]][[ — {societe}]]',
    corps: `Bonjour[[ {destinataire}]],

Veuillez trouver ci-joint notre facture {numero} d'un montant de {montantTTC} TTC.

Détail :
- Total HT : {montantHT}
- Total TVA : {montantTVA}
- Total TTC : {montantTTC}[[
- Frais de port : {fraisPort}]][[

Date d'échéance de paiement : {echeance}]]

Restant à votre disposition pour toute question.

Cordialement,
[Votre nom]
[Votre entreprise]`,
    champs: {
      destinataire: DESTINATAIRE, numero: { libelle: 'Numéro', exemple: 'FA-2026-310' }, reference: REFERENCE, societe: SOCIETE,
      montantHT: { libelle: 'Total HT', exemple: '846,80 €' },
      montantTVA: { libelle: 'Total TVA', exemple: '169,36 €' },
      montantTTC: { libelle: 'Total TTC', exemple: '1 016,16 €' },
      fraisPort: { libelle: 'Frais de port', exemple: '87,00 €' },
      echeance: { libelle: 'Échéance', exemple: '31/12/2026' },
    },
  },
  ar_commande: {
    libelle: 'AR de commande client',
    description: "Proposé à l'envoi de l'accusé de réception d'une commande client.",
    objet: 'AR Commande {numero}[[ — {reference}]][[ — {societe}]]',
    corps: `Bonjour[[ {destinataire}]],

Nous vous confirmons la bonne réception de votre commande {numero}[[ (Réf. {reference})]] d'un montant de {montantHT} HT.[[

Date de départ prévue : {dateDepart}]][[
Date de livraison prévue : {dateLivraison}]]

Restant à votre disposition pour tout complément d'information.

Cordialement,
ISOSIGN`,
    champs: {
      destinataire: DESTINATAIRE, numero: { libelle: 'Numéro', exemple: 'CC-2026-077' }, reference: REFERENCE, societe: SOCIETE,
      montantHT: { libelle: 'Montant HT', exemple: '846,80 €' },
      dateDepart: { libelle: 'Date de départ', exemple: '20/10/2026' },
      dateLivraison: { libelle: 'Date de livraison', exemple: '22/10/2026' },
    },
  },
};

export const TYPES_MAIL = Object.keys(MAILS_DEFAUT) as TypeMail[];

/**
 * Remplit un modèle. `[[ … ]]` disparaît si l'un de ses champs est vide ;
 * un champ inconnu reste visible ; trois sauts de ligne ou plus se réduisent
 * à deux (un passage retiré ne laisse pas de trou).
 */
export function remplirMail(modele: string, valeurs: Record<string, string | null | undefined>): string {
  const html = estHtmlMail(modele);
  const val = (k: string) => String(valeurs[k] ?? '').trim();
  const connu = (k: string) => k in valeurs;
  const sansOptions = modele.replace(/\[\[([\s\S]*?)\]\]/g, (_, segment: string) => {
    const cles = [...segment.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    return cles.some(k => connu(k) && !val(k)) ? '' : segment;
  });
  // Dans du HTML, une valeur est du texte : échappée, ses sauts de ligne en <br>.
  const rempli = sansOptions.replace(/\{(\w+)\}/g, (m, k: string) =>
    !connu(k) ? m : html ? echapper(val(k)).replace(/\n/g, '<br>') : val(k));
  return html ? rempli : rempli.replace(/\n{3,}/g, '\n\n');
}

/* ── Texte brut ou HTML ───────────────────────────────────────────────────── */

/** Police et taille de base du mail : celles d'Outlook. */
export const POLICE_MAIL = 'Calibri, Aptos, Arial, sans-serif';
export const TAILLE_MAIL = '11pt';

/** Le texte est-il du HTML (mis en forme dans `EditeurMail`) ? */
export function estHtmlMail(corps: string): boolean {
  return /<(div|p|br|span|font|b|strong|i|em|u)\b[^>]*>/i.test(corps);
}

/** Texte brut → HTML de l'éditeur : une ligne = un bloc, la ligne vide gardée. */
export function texteVersHtml(texte: string): string {
  return texte.split('\n').map(l => `<div>${l.trim() === '' ? '<br>' : echapper(l)}</div>`).join('');
}

const BALISES_GARDEES = new Set(['DIV', 'P', 'BR', 'SPAN', 'FONT', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
const BALISES_RETIREES = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'HEAD', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'AUDIO']);

/**
 * Ne garde du HTML que la mise en forme d'un mail : blocs, gras, italique,
 * souligné, police / taille / couleur, liens http(s), mailto, tel. Le reste
 * (scripts, attributs `on…`, images collées) part ; une balise inconnue est
 * remplacée par son contenu.
 */
export function nettoyerHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const nettoyer = (el: Element) => {
    for (const enfant of [...el.children]) {
      if (BALISES_RETIREES.has(enfant.tagName)) { enfant.remove(); continue; }
      nettoyer(enfant);
      if (!BALISES_GARDEES.has(enfant.tagName)) { enfant.replaceWith(...enfant.childNodes); continue; }
      for (const attr of [...enfant.attributes]) {
        const n = attr.name.toLowerCase();
        const v = attr.value;
        const garde = (n === 'style' && !/expression|url\s*\(|javascript:/i.test(v))
          || ((n === 'face' || n === 'size' || n === 'color') && enfant.tagName === 'FONT')
          || (n === 'href' && enfant.tagName === 'A' && /^(https?:|mailto:|tel:)/i.test(v.trim()));
        if (!garde) enfant.removeAttribute(attr.name);
      }
    }
  };
  nettoyer(doc.body);
  return doc.body.innerHTML;
}

/** HTML → texte brut (mailto, mobile) : un bloc ou un <br> = un saut de ligne. */
export function htmlVersTexte(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let texte = '';
  const parcourir = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { texte += n.textContent ?? ''; return; }
    if (!(n instanceof Element)) return;
    if (n.tagName === 'BR') { texte += '\n'; return; }
    const bloc = /^(DIV|P|LI|BLOCKQUOTE|UL|OL)$/.test(n.tagName);
    if (bloc && texte && !texte.endsWith('\n')) texte += '\n';
    n.childNodes.forEach(parcourir);
    if (bloc && !texte.endsWith('\n')) texte += '\n';
  };
  doc.body.childNodes.forEach(parcourir);
  return texte.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
}

/** Le mail en texte seul, sans repères d'image — pour mailto et le partage mobile. */
export function texteDuMail(corps: string): string {
  return texteSansImages(estHtmlMail(corps) ? htmlVersTexte(corps) : corps);
}

/* ── Les mails types de l'utilisateur ─────────────────────────────────────────
   Lus une fois par session et partagés entre les dialogues : un dialogue qui
   s'ouvre trouve ses textes déjà là. */
let cache: Partial<Record<TypeMail, ModeleMail>> | null = null;
let chargement: Promise<void> | null = null;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach(f => f());

function charger(): Promise<void> {
  if (!chargement) {
    chargement = (async () => {
      const { data, error } = await supabase.from('mails_types' as never).select('type, objet, corps, images');
      const lus: Partial<Record<TypeMail, ModeleMail>> = {};
      if (!error) {
        for (const r of (data ?? []) as { type: string; objet: string; corps: string; images: ImageMail[] | null }[]) {
          if (r.type in MAILS_DEFAUT) lus[r.type as TypeMail] = { objet: r.objet, corps: r.corps, images: Array.isArray(r.images) ? r.images : [] };
        }
      } else {
        console.error('[mails_types] lecture', error.message);
      }
      cache = lus;
      prevenir();
    })();
  }
  return chargement;
}

export function useMailsTypes() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const f = () => setVersion(v => v + 1);
    abonnes.add(f);
    void charger();
    return () => { abonnes.delete(f); };
  }, []);

  /** Le modèle retenu pour ce type : celui de l'utilisateur, sinon l'origine. */
  const modele = useCallback((t: TypeMail): ModeleMail => cache?.[t] ?? MAILS_DEFAUT[t],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]);
  const estPersonnalise = useCallback((t: TypeMail) => !!cache?.[t],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]);

  const enregistrer = useCallback(async (t: TypeMail, m: ModeleMail) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Non connecté';
    const { error } = await supabase.from('mails_types' as never).upsert(
      { user_id: session.user.id, type: t, objet: m.objet, corps: m.corps, images: m.images?.length ? m.images : null, updated_at: new Date().toISOString() } as never,
      { onConflict: 'user_id,type' },
    );
    if (error) return error.message;
    cache = { ...(cache ?? {}), [t]: m };
    prevenir();
    return null;
  }, []);

  /** Revient au texte d'origine : la ligne de l'utilisateur est effacée. */
  const reinitialiser = useCallback(async (t: TypeMail) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Non connecté';
    const { error } = await supabase.from('mails_types' as never).delete().eq('user_id', session.user.id).eq('type', t);
    if (error) return error.message;
    const suite = { ...(cache ?? {}) };
    delete suite[t];
    cache = suite;
    prevenir();
    return null;
  }, []);

  /** Toutes les images de l'utilisateur, tous mails confondus (pour réutiliser un logo). */
  const toutesImages = useCallback((): ImageMail[] => {
    const vues = new Map<string, ImageMail>();
    for (const m of Object.values(cache ?? {})) for (const i of m?.images ?? []) if (!vues.has(i.dataUrl)) vues.set(i.dataUrl, i);
    return [...vues.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return { modele, estPersonnalise, enregistrer, reinitialiser, toutesImages, charge: cache !== null, version };
}

/* ── Images dans le mail ──────────────────────────────────────────────────── */

const JETON_IMAGE = /\{img:([\w-]+)\}/g;

export const jetonImage = (id: string) => `{img:${id}}`;

/** Identifiant de repère tiré du nom de fichier, unique parmi `pris`. */
export function idImage(nom: string, pris: string[]): string {
  const base = (nom.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image').slice(0, 24);
  let id = base;
  for (let n = 2; pris.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** Le texte du mail sans ses repères d'image (envoi texte seul : mailto, mobile). */
export function texteSansImages(corps: string): string {
  return corps.replace(JETON_IMAGE, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
}

/** Images réellement placées dans le texte. */
export function imagesUtilisees(corps: string, images: ImageMail[] = []): ImageMail[] {
  const ids = new Set([...corps.matchAll(JETON_IMAGE)].map(m => m[1]));
  return images.filter(i => ids.has(i.id));
}

function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Le texte en HTML, les repères remplacés par leur image. Texte brut : une
 * ligne par paragraphe (la mise en forme des .eml d'avant). HTML mis en
 * forme : nettoyé, dans la police et la taille de base d'Outlook. `src` :
 * `cid` pour le .eml, `data` pour un aperçu dans le navigateur.
 */
export function corpsEnHtml(corps: string, images: ImageMail[] = [], src: 'cid' | 'data' = 'cid'): string {
  const parId = new Map(images.map(i => [i.id, i]));
  const balise = (img: ImageMail) =>
    `<img src="${src === 'cid' ? `cid:${img.id}@crmpool` : img.dataUrl}" alt="${echapper(img.nom)}" width="${img.largeur}" style="width:${img.largeur}px;height:auto;border:0;vertical-align:middle">`;
  if (estHtmlMail(corps)) {
    const html = nettoyerHtml(corps).replace(JETON_IMAGE, (m, id: string) => {
      const img = parId.get(id);
      return img ? balise(img) : m;
    });
    return `<div style="font-family:${POLICE_MAIL};font-size:${TAILLE_MAIL}">${html}</div>`;
  }
  return corps.split('\n').map(ligne => {
    if (ligne.trim() === '') return '<br>';
    let html = '';
    let dernier = 0;
    for (const m of ligne.matchAll(JETON_IMAGE)) {
      html += echapper(ligne.slice(dernier, m.index));
      const img = parId.get(m[1]);
      html += img ? balise(img) : echapper(m[0]);
      dernier = (m.index ?? 0) + m[0].length;
    }
    html += echapper(ligne.slice(dernier));
    return `<p style="margin:0">${html}</p>`;
  }).join('\n');
}

/**
 * La partie HTML d'un .eml, prête à suivre une ligne `--frontière` : le HTML
 * seul, ou un multipart/related qui porte aussi les images placées dans le
 * texte (`Content-ID` = la référence `cid:` de `corpsEnHtml`).
 */
export function partieHtmlEml(html: string, images: ImageMail[], enQuotedPrintable: (s: string) => string): string[] {
  const htmlPart = ['Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: quoted-printable', '', enQuotedPrintable(html), ''];
  if (!images.length) return htmlPart;
  const rel = `----=_Rel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lignes = [`Content-Type: multipart/related; boundary="${rel}"`, '', `--${rel}`, ...htmlPart];
  for (const img of images) {
    const m = img.dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) continue;
    const ext = (m[1].split('/')[1] || 'png').replace('jpeg', 'jpg');
    const nom = `${img.id}.${ext}`;
    lignes.push(`--${rel}`, `Content-Type: ${m[1]}; name="${nom}"`, 'Content-Transfer-Encoding: base64',
      `Content-ID: <${img.id}@crmpool>`, `Content-Disposition: inline; filename="${nom}"`, '',
      ...(m[2].match(/.{1,76}/g) ?? []), '');
  }
  lignes.push(`--${rel}--`, '');
  return lignes;
}

/**
 * Réduit une image choisie (600 px de large au plus) et la rend en data URL —
 * PNG pour garder la transparence d'un logo, JPEG pour une photo. Refuse
 * au-delà de 400 Ko : elle part dans chaque mail envoyé.
 */
export async function lireImageMail(fichier: File): Promise<{ dataUrl: string; largeur: number }> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible'));
      i.src = url;
    });
    const largeur = Math.min(600, img.naturalWidth || 600);
    const hauteur = Math.max(1, Math.round((img.naturalHeight || largeur) * largeur / (img.naturalWidth || largeur)));
    const canvas = document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    canvas.getContext('2d')!.drawImage(img, 0, 0, largeur, hauteur);
    const photo = /jpe?g/i.test(fichier.type);
    const dataUrl = canvas.toDataURL(photo ? 'image/jpeg' : 'image/png', 0.85);
    if (dataUrl.length > 400 * 1024 * 4 / 3) throw new Error('Image trop lourde (400 Ko au plus après réduction)');
    // Affichée à 250 px au plus par défaut : la taille d'un logo de signature.
    return { dataUrl, largeur: Math.min(largeur, 250) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
