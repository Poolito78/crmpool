/**
 * Les liens d'article qu'on colle dans un mail.
 *
 * LE PROBLÈME QU'ILS RÉSOLVENT : une URL de fiche technique SharePoint fait
 * deux cents caractères et ne dit rien de l'article. Collée telle quelle dans
 * un mail, elle occupe trois lignes et le client ne sait pas sur quoi il
 * clique. Ce qu'on veut lire dans le message, c'est la DÉSIGNATION — le lien
 * se cache derrière.
 *
 * D'où « lien raccourci » : ce n'est pas l'URL qu'on raccourcit (aucun service
 * tiers, aucune table de redirection à maintenir), c'est le TEXTE AFFICHÉ
 * qu'on choisit. Un `<a href="…">Fiche technique — Flowfresh MF</a>` collé
 * dans Outlook, Gmail ou Thunderbird donne exactement une ligne cliquable
 * portant le nom de l'article. Le presse-papiers transporte les deux formes :
 * le HTML pour les messageries riches, « libellé : url » pour celles en texte
 * brut.
 *
 * TROIS DESTINATIONS, ET ELLES NE SE REMPLACENT PAS :
 *  - `fiche` : la fiche technique du fabricant (PDF SharePoint ou site
 *    fournisseur), saisie sur l'article. C'est le document qui engage.
 *  - `image` : la photo de l'article. Un client reconnaît un panneau à sa
 *    photo bien avant sa référence.
 *  - `page`  : la fiche publique du CRM (`/p/<uuid>`), qui rassemble la
 *    désignation, les photos et le lien fiche technique — sans aucun prix.
 *    C'est le seul lien qui reste juste quand la photo change.
 */

export type CibleLien = 'fiche' | 'image' | 'page';

export interface LienProduit {
  /** `${produitId}:${cible}` — stable, sert de clé de sélection. */
  id: string;
  produitId: string;
  cible: CibleLien;
  /** Texte affiché dans le mail. Éditable par l'utilisateur. */
  label: string;
  url: string;
}

/** L'article tel qu'il est nécessaire ici — volontairement minimal. */
export interface ProduitLiable {
  id: string;
  reference: string;
  description: string;
  ficheUrl?: string;
  ficheLinkLabel?: string;
}

export const LIBELLE_CIBLE: Record<CibleLien, string> = {
  fiche: 'Fiche technique',
  image: 'Photo',
  page: 'Fiche produit',
};

/**
 * La désignation, telle qu'un client la lit.
 *
 * La description prime sur la référence : « Prefabriqué thermoplastique
 * boussole blanche » désigne quelque chose, « PTboussoleblanche1500 » non.
 * La référence sert de repli quand la description manque.
 */
export function designation(p: ProduitLiable): string {
  const d = (p.description || '').trim();
  return d || (p.reference || '').trim() || 'Article';
}

/** L'adresse de la fiche publique de l'article. */
export function urlFichePublique(produitId: string, origine?: string): string {
  const base = (origine ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  return `${base}/p/${produitId}`;
}

/**
 * Les liens proposés pour un article.
 *
 * L'ordre est celui de l'utilité décroissante dans un mail commercial :
 * la fiche technique d'abord (c'est le document attendu), la photo ensuite,
 * la page du CRM en dernier. Un lien dont l'URL manque n'est pas proposé —
 * mieux vaut trois lignes justes qu'une quatrième qui mène à une erreur.
 */
export function liensDuProduit(
  p: ProduitLiable,
  opts?: { imageUrl?: string; origine?: string },
): LienProduit[] {
  const nom = designation(p);
  const liens: LienProduit[] = [];

  const fiche = p.ficheUrl?.trim();
  if (fiche) {
    liens.push({
      id: `${p.id}:fiche`,
      produitId: p.id,
      cible: 'fiche',
      // Le libellé saisi sur l'article gagne : il a été écrit pour être lu.
      label: p.ficheLinkLabel?.trim() || `${LIBELLE_CIBLE.fiche} — ${nom}`,
      url: fiche,
    });
  }

  const image = opts?.imageUrl?.trim();
  if (image) {
    liens.push({
      id: `${p.id}:image`,
      produitId: p.id,
      cible: 'image',
      label: `${LIBELLE_CIBLE.image} — ${nom}`,
      url: image,
    });
  }

  liens.push({
    id: `${p.id}:page`,
    produitId: p.id,
    cible: 'page',
    label: `${LIBELLE_CIBLE.page} — ${nom}`,
    url: urlFichePublique(p.id, opts?.origine),
  });

  return liens;
}

/**
 * Les liens de tous les articles d'un devis, sans doublon.
 *
 * Une même référence peut revenir sur plusieurs lignes (deux teintes, deux
 * conditionnements) : elle ne donne qu'un jeu de liens.
 */
export function liensDesProduits(
  produits: ProduitLiable[],
  imageParProduit: Record<string, string | undefined> = {},
  origine?: string,
): LienProduit[] {
  const vus = new Set<string>();
  const out: LienProduit[] = [];
  for (const p of produits) {
    if (!p || vus.has(p.id)) continue;
    vus.add(p.id);
    out.push(...liensDuProduit(p, { imageUrl: imageParProduit[p.id], origine }));
  }
  return out;
}

/* ── Rendu ───────────────────────────────────────────────────────────────── */

export function echapperHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Le bloc HTML collé dans le mail.
 *
 * Styles en ligne et rien d'autre : Outlook jette les feuilles de style, et
 * un lien sans couleur explicite s'affiche en noir, donc invisible comme lien.
 * `#0563C1` est le bleu des liens d'Office — le message ne détonne pas.
 */
export function liensHtml(liens: LienProduit[], titre = 'Fiches produit :'): string {
  if (liens.length === 0) return '';
  return (
    `<p style="margin:0 0 4px 0"><strong>${echapperHtml(titre)}</strong></p>` +
    liens
      .map(
        l =>
          `<p style="margin:0 0 2px 0">&#8226; <a href="${echapperHtml(l.url)}" style="color:#0563C1">${echapperHtml(l.label)}</a></p>`,
      )
      .join('')
  );
}

/** La même chose pour une messagerie en texte brut : le libellé, puis l'URL. */
export function liensTexte(liens: LienProduit[], titre = 'Fiches produit :'): string {
  if (liens.length === 0) return '';
  return `${titre}\n${liens.map(l => `• ${l.label} : ${l.url}`).join('\n')}`;
}

/* ── Presse-papiers ──────────────────────────────────────────────────────── */

/**
 * Copier les liens sous les DEUX formes à la fois.
 *
 * Un presse-papiers porte plusieurs représentations du même contenu, et c'est
 * le programme qui reçoit le collage qui choisit. Outlook et Gmail prennent le
 * `text/html` et affichent des liens cliquables portant la désignation ; un
 * éditeur de texte prend le `text/plain` et affiche « libellé : url ». Écrire
 * les deux, c'est ne pas avoir à demander à l'utilisateur où il va coller.
 *
 * Le repli `execCommand('copy')` sert aux navigateurs sans
 * `ClipboardItem` (Safari ancien, Firefox jusqu'à récemment) : on copie une
 * sélection d'un fragment HTML hors écran, ce qui préserve les liens.
 */
export async function copierLiens(
  liens: LienProduit[],
  titre = 'Fiches produit :',
): Promise<boolean> {
  if (liens.length === 0) return false;
  const html = liensHtml(liens, titre);
  const texte = liensTexte(liens, titre);

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([texte], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* on tente le repli plutôt que d'échouer */
  }

  try {
    const zone = document.createElement('div');
    zone.innerHTML = html;
    // Hors écran mais dans le document : une sélection exige un nœud rendu.
    zone.setAttribute('style', 'position:fixed;left:-9999px;top:0;white-space:pre-wrap');
    zone.setAttribute('contenteditable', 'true');
    document.body.appendChild(zone);
    const plage = document.createRange();
    plage.selectNodeContents(zone);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(plage);
    const ok = document.execCommand('copy');
    sel?.removeAllRanges();
    document.body.removeChild(zone);
    if (ok) return true;
  } catch {
    /* dernier repli ci-dessous */
  }

  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}
