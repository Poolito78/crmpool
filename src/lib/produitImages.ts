import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Photos des fiches produit.
 *
 * Un article se reconnaît à sa photo bien avant sa référence, et le catalogue
 * n'en portait aucune.
 *
 * LA CONTRAINTE QUI COMMANDE TOUT LE MODULE : le forfait Supabase est le
 * gratuit, soit 1 Go de stockage — dont 103 Mo déjà pris par les pièces
 * jointes de devis. Un PNG sorti d'un appareil photo pèse 3 à 5 Mo ; deux
 * cents suffiraient à saturer le reste. On compresse donc AVANT d'envoyer,
 * dans le navigateur : 800 px de plus grand côté et du WebP ramènent la même
 * photo à 40-60 Ko, et les 900 Mo restants tiennent quinze à vingt mille
 * images. Ce n'est pas une optimisation, c'est ce qui rend la chose possible
 * sans rien payer.
 */

export const SEAU = 'produits-images';

/** Plus grand côté après redimensionnement, en pixels. */
export const COTE_MAX = 800;
/** Qualité WebP. 0,82 : la différence ne se voit pas sur une photo d'article. */
export const QUALITE = 0.82;
/** Au-delà, on refuse le fichier avant même de le lire. */
export const OCTETS_MAX = 15 * 1024 * 1024;

export interface ImageProduit {
  id: string;
  produitId: string;
  url: string;
  /** Chemin dans le seau. Absent pour une image externe. */
  chemin?: string;
  nom?: string;
  /**
   * Texte affiché du lien quand on colle la photo dans un mail ou un devis.
   *
   * Vide, le lien porte « Photo — <désignation> ». Renseigné, c'est ce
   * libellé qui s'affiche : une URL de photo fait cent caractères et ne dit
   * rien, alors que « Plot de route blanc D100 » se lit.
   */
  libelle?: string;
  octets?: number;
  largeur?: number;
  hauteur?: number;
  /** 0 = la principale. */
  ordre: number;
  createdAt: string;
}

/* ── Redimensionnement ───────────────────────────────────────────────────── */

/**
 * Les dimensions après réduction, à proportions conservées.
 *
 * Une image DÉJÀ petite n'est pas agrandie : la remonter à 800 px ne lui
 * ajouterait aucun détail et la ferait peser plus lourd qu'à l'arrivée.
 */
export function dimensionsReduites(
  largeur: number,
  hauteur: number,
  coteMax = COTE_MAX,
): { largeur: number; hauteur: number } {
  const cote = Math.max(largeur, hauteur);
  if (cote <= coteMax || cote === 0) {
    return { largeur: Math.round(largeur), hauteur: Math.round(hauteur) };
  }
  const facteur = coteMax / cote;
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  };
}

export interface ImageCompressee {
  blob: Blob;
  largeur: number;
  hauteur: number;
  /** Extension à donner au fichier, selon ce que le navigateur a su produire. */
  extension: string;
  type: string;
}

/**
 * Réduit et réencode une image dans le navigateur.
 *
 * Le WebP est demandé ; si le navigateur ne sait pas l'écrire, `toBlob` rend
 * du PNG sans prévenir — et un PNG de photo pèse plus lourd que le JPEG
 * d'origine. On vérifie donc ce qui est réellement sorti, et on retombe sur
 * le JPEG plutôt que d'expédier un fichier plus gros que celui reçu.
 */
export async function compresserImage(
  fichier: File,
  coteMax = COTE_MAX,
): Promise<ImageCompressee> {
  const bitmap = await creerBitmap(fichier);
  const { largeur, hauteur } = dimensionsReduites(bitmap.width, bitmap.height, coteMax);

  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Le navigateur n'a pas fourni de contexte de dessin.");
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();

  let blob = await versBlob(canvas, 'image/webp', QUALITE);
  if (!blob || blob.type !== 'image/webp') {
    blob = await versBlob(canvas, 'image/jpeg', QUALITE);
  }
  if (!blob) throw new Error("L'image n'a pas pu être réencodée.");

  const type = blob.type || 'image/jpeg';
  return {
    blob,
    largeur,
    hauteur,
    type,
    extension: type === 'image/webp' ? 'webp' : 'jpg',
  };
}

function versBlob(canvas: HTMLCanvasElement, type: string, qualite: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, qualite));
}

async function creerBitmap(fichier: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(fichier); } catch { /* repli ci-dessous */ }
  }
  /* Safari ancien : `createImageBitmap` refuse certains formats. */
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    img.src = url;
  });
}

/** Un fichier déposé est-il une image qu'on saura traiter ? */
export function estImageAcceptee(f: File): boolean {
  return /^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.type);
}

/* ── Mapping base ↔ application ──────────────────────────────────────────── */

type Row = Record<string, unknown>;
const txt = (v: unknown) => (v == null || v === '' ? undefined : String(v));
const nb = (v: unknown) => (v == null ? undefined : Number(v));

function dbToImage(r: Row): ImageProduit {
  return {
    id: String(r.id),
    produitId: String(r.produit_id),
    url: String(r.url),
    chemin: txt(r.chemin),
    nom: txt(r.nom),
    libelle: txt(r.libelle),
    octets: nb(r.octets),
    largeur: nb(r.largeur),
    hauteur: nb(r.hauteur),
    ordre: Number(r.ordre) || 0,
    createdAt: String(r.created_at),
  };
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

/**
 * Les images du catalogue.
 *
 * Toutes sont chargées d'un coup, et c'est délibéré : la table ne compte
 * qu'une ligne par image RÉELLEMENT ajoutée, pas une par article. Elle restera
 * longtemps à quelques centaines de lignes, là où les 22 508 produits
 * imposeraient une lecture à la demande.
 */
export function useProduitImages() {
  const [images, setImages] = useState<ImageProduit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from('produit_images').select('*')
      .order('produit_id').order('ordre');
    if (error) {
      console.error('[produit_images]', error.message);
      setErreur(error.message);
      setImages([]);
    } else {
      setImages((data || []).map(dbToImage));
    }
    setChargement(false);
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  const imagesDe = useCallback(
    (produitId?: string) => (produitId
      ? images.filter(i => i.produitId === produitId).sort((a, b) => a.ordre - b.ordre)
      : []),
    [images]);

  const principaleDe = useCallback(
    (produitId?: string) => imagesDe(produitId)[0], [imagesDe]);

  /** Dépose une image compressée et l'enregistre. */
  const deposer = useCallback(async (produitId: string, fichier: File): Promise<string | null> => {
    if (!estImageAcceptee(fichier)) return `« ${fichier.name} » n'est pas une image.`;
    if (fichier.size > OCTETS_MAX) {
      return `« ${fichier.name} » dépasse ${Math.round(OCTETS_MAX / 1024 / 1024)} Mo.`;
    }

    let compressee: ImageCompressee;
    try {
      compressee = await compresserImage(fichier);
    } catch (e) {
      return `« ${fichier.name} » n'a pas pu être lue : ${(e as Error).message}`;
    }

    const chemin = `${produitId}/${crypto.randomUUID()}.${compressee.extension}`;
    const { error: eDepot } = await supabase.storage
      .from(SEAU)
      .upload(chemin, compressee.blob, { contentType: compressee.type, upsert: false });
    if (eDepot) return eDepot.message;

    const { data: pub } = supabase.storage.from(SEAU).getPublicUrl(chemin);

    /* Placée en dernier : la principale ne change pas parce qu'on ajoute. */
    const ordre = imagesDe(produitId).length;
    const ligne = {
      produit_id: produitId,
      url: pub.publicUrl,
      chemin,
      nom: fichier.name,
      octets: compressee.blob.size,
      largeur: compressee.largeur,
      hauteur: compressee.hauteur,
      ordre,
    };
    const { data, error } = await supabase
      .from('produit_images').insert(ligne as never).select().single();
    if (error) {
      /* La ligne manque : sans elle, le fichier déposé n'est plus référencé
         nulle part et pèserait sur le quota sans jamais s'afficher. */
      await supabase.storage.from(SEAU).remove([chemin]);
      return error.message;
    }
    setImages(prev => [...prev, dbToImage(data as Row)]);
    return null;
  }, [imagesDe]);

  /** Enregistre une image hébergée ailleurs : rien n'est déposé. */
  const ajouterLien = useCallback(async (produitId: string, url: string): Promise<string | null> => {
    const propre = url.trim();
    if (!/^https?:\/\//i.test(propre)) return "L'adresse doit commencer par http:// ou https://";
    const ligne = { produit_id: produitId, url: propre, ordre: imagesDe(produitId).length };
    const { data, error } = await supabase
      .from('produit_images').insert(ligne as never).select().single();
    if (error) return error.message;
    setImages(prev => [...prev, dbToImage(data as Row)]);
    return null;
  }, [imagesDe]);

  /** Change le texte affiché du lien de cette image. */
  const renommer = useCallback(async (image: ImageProduit, libelle: string): Promise<string | null> => {
    const propre = libelle.trim();
    const { error } = await supabase.from('produit_images')
      .update({ libelle: propre || null } as never).eq('id', image.id);
    if (error) return error.message;
    setImages(prev => prev.map(i =>
      i.id === image.id ? { ...i, libelle: propre || undefined } : i));
    return null;
  }, []);

  const supprimer = useCallback(async (image: ImageProduit): Promise<string | null> => {
    const { error } = await supabase.from('produit_images').delete().eq('id', image.id);
    if (error) return error.message;
    /* Le fichier part avec la ligne — mais seulement s'il nous appartient :
       une image externe n'est pas la nôtre à supprimer. */
    if (image.chemin) await supabase.storage.from(SEAU).remove([image.chemin]);

    const restantes = imagesDe(image.produitId)
      .filter(i => i.id !== image.id)
      .map((i, rang) => ({ ...i, ordre: rang }));
    setImages(prev => [
      ...prev.filter(i => i.produitId !== image.produitId),
      ...restantes,
    ]);
    await renumeroter(restantes);
    return null;
  }, [imagesDe]);

  /** Promeut une image en principale ; les autres se décalent. */
  const rendrePrincipale = useCallback(async (image: ImageProduit) => {
    const suite = [
      image,
      ...imagesDe(image.produitId).filter(i => i.id !== image.id),
    ].map((i, rang) => ({ ...i, ordre: rang }));
    setImages(prev => [
      ...prev.filter(i => i.produitId !== image.produitId),
      ...suite,
    ]);
    await renumeroter(suite);
  }, [imagesDe]);

  return {
    images, chargement, erreur, recharger,
    imagesDe, principaleDe, deposer, ajouterLien, supprimer, rendrePrincipale, renommer,
  };
}

async function renumeroter(images: ImageProduit[]) {
  await Promise.all(images.map(i =>
    supabase.from('produit_images').update({ ordre: i.ordre } as never).eq('id', i.id)));
}

/* ── Place occupée ───────────────────────────────────────────────────────── */

export interface OccupationStockage {
  octets: number;
  fichiers: number;
  /** Le forfait gratuit de Supabase : 1 Go de fichiers. */
  quota: number;
}

export const QUOTA_GRATUIT = 1024 * 1024 * 1024;

/**
 * Ce que pèsent les images du catalogue.
 *
 * Somme des tailles enregistrées à l'envoi, pas une interrogation du
 * stockage : cette dernière n'est pas accessible depuis le navigateur, et la
 * somme suffit pour dire s'il reste de la place.
 */
export function occupation(images: ImageProduit[]): OccupationStockage {
  const deposees = images.filter(i => i.chemin);
  return {
    octets: deposees.reduce((s, i) => s + (i.octets || 0), 0),
    fichiers: deposees.length,
    quota: QUOTA_GRATUIT,
  };
}

export function formatOctets(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} Go`;
}
