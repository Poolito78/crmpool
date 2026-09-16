/**
 * Un système demandé mais absent de la base : on va le chercher dans le
 * dossier des fiches système, et on l'y importe.
 *
 * La table `systemes` recopie les fiches Flowcrete rangées dans
 * `ISOFLOOR\02 MARKETING\Fiches système`. Quand une fiche nouvelle y arrive —
 * « Flowfast 319 Concrete », septembre 2026 — la base l'ignore, et la demande
 * « Flowfast 319 Concrete, ligne jaune 0,10 m x 965 ml » se chiffrait comme un
 * article quelconque. Le dossier, lui, la connaît déjà.
 *
 * Le navigateur ne lit pas un chemin Windows : l'utilisateur désigne le
 * dossier UNE fois (File System Access API), le droit est mémorisé dans
 * IndexedDB, et les recherches suivantes s'y font sans rien demander.
 * PC, Chrome ou Edge — comme `moFiches.ts`, dont ce module reprend la forme.
 *
 * ⚠️ **L'IMPORT NE SE FAIT QU'APRÈS RELECTURE.** Gemini lit la fiche et rend
 * les dosages ; l'écran les montre composant par composant, et rien n'entre
 * en base sans un clic. Un dosage qui manque à la fiche reste vide : on
 * n'invente pas une consommation, elle se facturerait au client.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Produit } from '@/lib/store';
import type { Systeme } from '@/lib/systemes';
import { normaliser } from '@/lib/rapprochementSysteme';
import { appelerGemini, texteGemini } from '@/lib/modelesIA';

/* ── Le dossier ──────────────────────────────────────────────────────────── */

/** Le dossier attendu, à afficher : le navigateur ne peut pas l'ouvrir seul. */
export const DOSSIER_FICHES_SYSTEME =
  'OneDrive - ISOSIGN\\Documents\\ISOFLOOR\\02 MARKETING\\Fiches système';

const IDB_NAME = 'crmpool-settings';
const IDB_STORE = 'handles';
const IDB_KEY = 'fiches-systeme-folder';

type DirHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FileSystemHandle>;
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};
type ShowDirPicker = (opts?: object) => Promise<FileSystemDirectoryHandle>;

export function dossierFichesDisponible(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function ouvrirIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lireHandle(): Promise<DirHandle | null> {
  try {
    const db = await ouvrirIdb();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as DirHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function garderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await ouvrirIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* le dossier sera redemandé */ }
}

async function droitLecture(h: DirHandle, interactif: boolean): Promise<boolean> {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'read' })) === 'granted') return true;
  /* Chrome n'accorde le droit qu'à un geste de l'utilisateur : hors clic, on
     se tait plutôt que d'échouer bruyamment. */
  if (!interactif || !h.requestPermission) return false;
  return (await h.requestPermission({ mode: 'read' })) === 'granted';
}

/**
 * Le dossier des fiches, mémorisé. `interactif` : sur un clic, on redemande le
 * droit ou l'on fait choisir le dossier ; sinon on rend `null` sans bruit.
 */
export async function dossierFiches(interactif: boolean, changer = false): Promise<FileSystemDirectoryHandle | null> {
  if (!dossierFichesDisponible()) return null;
  const garde = changer ? null : await lireHandle();
  if (garde && await droitLecture(garde, interactif)) return garde;
  if (!interactif) return null;
  const choisi = await (window as typeof window & { showDirectoryPicker: ShowDirPicker })
    .showDirectoryPicker({ id: 'fiches-systeme', mode: 'read', startIn: 'documents' });
  await garderHandle(choisi);
  return choisi;
}

/* ── La recherche ────────────────────────────────────────────────────────── */

/**
 * Les gammes Flowcrete, telles qu'elles s'écrivent dans une demande. Une ligne
 * qui en nomme une parle d'un système, même sans le mot « système ».
 */
const GAMMES = [
  'flowfast', 'flowshield', 'flowcoat', 'flowfresh', 'flowseal', 'flowchem',
  'flowscreed', 'flowtex', 'peran', 'deckshield', 'hydraseal', 'coracoat',
  'corafloor', 'mondeco', 'isocrete',
];

/** Mots qui ne désignent pas un système — ceux d'un tracé, d'une quantité. */
const MOTS_NEUTRES = new Set([
  'systeme', 'systemes', 'system', 'fiche', 'fs', 'fr', 'pdf', 'xlsx', 'de', 'du',
  'la', 'le', 'les', 'des', 'et', 'en', 'pour', 'sur', 'au', 'aux', 'avec', 'ou',
  'mm', 'cm', 'ml', 'm', 'm2', 'kg', 'x', 'ligne', 'lignes', 'bande', 'bandes',
  'largeur', 'longueur', 'dimension', 'unite', 'unites', 'jaune', 'blanc',
  'blanche', 'vert', 'verte', 'bleu', 'bleue', 'rouge', 'noir', 'gris', 'resine',
  'sol', 'fourniture', 'calcul', 'web', 'maj',
]);

function mots(texte: string): string[] {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter(m => m.length > 1 && !MOTS_NEUTRES.has(m))
    /* Un nombre ne désigne un système que s'il en est le code — « 319 » ;
       une date de fiche (20230607) ou une longueur (965) n'y aide pas. */
    .filter(m => !/^\d+$/.test(m) || m.length === 3);
}

/**
 * La ligne parle-t-elle d'un système ? Le mot « système », une gamme
 * Flowcrete, ou le premier mot d'un système déjà en base.
 */
export function ressembleASysteme(texte: string, systemes: Systeme[] = []): boolean {
  const ms = new Set(normaliser(texte).split(/[^a-z0-9]+/));
  if (ms.has('systeme') || ms.has('system')) return true;
  if (GAMMES.some(g => ms.has(g))) return true;
  return systemes.some(s => {
    const premier = mots(s.nom)[0];
    return !!premier && premier.length >= 5 && ms.has(premier);
  });
}

export interface FicheTrouvee {
  /** Chemin relatif au dossier choisi : « Flowfast 319 Concrete/FS_….pdf ». */
  chemin: string;
  nom: string;
  handle: FileSystemFileHandle;
  /** Le tableur de calcul rangé à côté, quand il y en a un. */
  annexes: FileSystemFileHandle[];
  /** Mots de la demande retrouvés dans le chemin. */
  score: number;
  /** Une fiche de ce nom est déjà en base. */
  dejaEnBase: boolean;
}

interface EntreeFichier { chemin: string; nom: string; handle: FileSystemFileHandle; dossier: string }

/**
 * Note d'un chemin pour une demande : les mots de la demande qu'il porte.
 *
 * Le chemin entier compte, pas le seul nom du fichier : la fiche du 319
 * Concrete s'appelle « FS_Flowfast-319-Concrete_fr.pdf », mais une autre
 * pourrait ne s'appeler que « fiche.pdf » dans un sous-dossier bien nommé.
 * La GAMME est exigée : sans elle, « ligne jaune 965 ml » trouverait n'importe
 * quelle fiche qui dit « ligne ».
 */
export function noterChemin(demande: string, chemin: string): number {
  const md = new Set(mots(demande));
  const mc = new Set(mots(chemin.replace(/\.[a-z0-9]+$/i, '')));
  const gammes = GAMMES.filter(g => md.has(g));
  if (gammes.length && !gammes.some(g => mc.has(g))) return 0;
  let score = 0;
  for (const m of md) if (mc.has(m)) score += 1;
  /* La gamme seule ne suffit pas : « Flowfast 319 Concrete » ne doit pas
     retenir la fiche du Flowfast BC. */
  return score >= 2 ? score : 0;
}

const EXTENSIONS_FICHE = /\.pdf$/i;
const EXTENSIONS_ANNEXE = /\.(xlsx|xls|csv)$/i;

/** Les fiches du dossier qui répondent à la demande, les meilleures d'abord. */
export async function chercherFiches(
  dossier: FileSystemDirectoryHandle,
  demande: string,
  systemes: Systeme[] = [],
  max = 5,
): Promise<FicheTrouvee[]> {
  const fichiers: EntreeFichier[] = [];
  async function parcourir(d: DirHandle, prefixe: string, profondeur: number) {
    if (profondeur > 4 || fichiers.length > 2000) return;
    for await (const e of d.values()) {
      if (e.kind === 'file') {
        if (EXTENSIONS_FICHE.test(e.name) || EXTENSIONS_ANNEXE.test(e.name)) {
          fichiers.push({
            chemin: prefixe + e.name, nom: e.name,
            handle: e as FileSystemFileHandle, dossier: prefixe,
          });
        }
      } else if (e.kind === 'directory' && !/^(video|claude outputs)$/i.test(e.name)) {
        await parcourir(e as DirHandle, `${prefixe}${e.name}/`, profondeur + 1);
      }
    }
  }
  await parcourir(dossier as DirHandle, '', 0);

  const enBase = new Set(systemes.map(s => (s.sourceFiche || '').toLowerCase()).filter(Boolean));
  return fichiers
    .filter(f => EXTENSIONS_FICHE.test(f.nom))
    .map((f): FicheTrouvee => ({
      chemin: f.chemin,
      nom: f.nom,
      handle: f.handle,
      /* Le tableur de calcul n'a de sens que rangé avec sa fiche, dans un
         sous-dossier — à la racine, il serait celui d'un autre système. */
      annexes: f.dossier
        ? fichiers.filter(a => a.dossier === f.dossier && EXTENSIONS_ANNEXE.test(a.nom)).map(a => a.handle)
        : [],
      score: noterChemin(demande, f.chemin),
      dejaEnBase: enBase.has(f.nom.toLowerCase()),
    }))
    .filter(f => f.score > 0)
    /* Une fiche déjà importée ne résout rien : elle passe après. */
    .sort((a, b) => Number(a.dejaEnBase) - Number(b.dejaEnBase) || b.score - a.score)
    .slice(0, max);
}

/* ── La lecture de la fiche ──────────────────────────────────────────────── */

export interface ComposantExtrait {
  libelle: string;
  role: string;
  consommation?: number;
  ratioBase?: number;
  pourcentage?: number;
  obligatoire: boolean;
  auKit: boolean;
  conditionnementKg?: number;
  condition?: string;
  phraseSource?: string;
  /** Article du catalogue retenu à l'écran. */
  produitId?: string;
}

export interface SystemeExtrait {
  nom: string;
  variante?: string;
  famille?: string;
  usage?: string;
  support: string;
  description?: string;
  surfaceKitM2?: number;
  kitSurfaceMaxM2?: number;
  composants: ComposantExtrait[];
}

const CONSIGNE = `Tu lis une FICHE SYSTÈME de revêtement de sol en résine (Flowcrete).
Rends UNIQUEMENT un objet JSON, sans texte autour :
{
  "nom": "nom du système, sans le mot Système (ex. Flowfast 319 Concrete)",
  "variante": "épaisseur ou finition qui le distingue, ou null",
  "famille": "gamme (ex. Flowfast), ou null",
  "usage": "usage en quelques mots, ou null",
  "support": "exigences de support recopiées de la fiche, ou 'tous'",
  "description": "une phrase, ou null",
  "surface_kit_m2": nombre ou null,
  "composants": [
    {
      "libelle": "nom du produit tel qu'écrit",
      "role": "primaire | saupoudrage | couche de masse - liant | couche de masse - charge | pigment | finition | catalyseur | …",
      "consommation": kg par m² (nombre) ou null,
      "ratio_base": multiple de la résine ou null,
      "pourcentage": part de la résine en % ou null,
      "obligatoire": true si le composant fait partie du système, false s'il est optionnel ou alternatif,
      "au_kit": true si le composant entre dans un mélange prêt à doser vendu par surface (kit),
      "conditionnement_kg": poids du conditionnement de ce composant pour UN kit, ou null,
      "condition": "condition d'emploi, ou null",
      "phrase_source": "la phrase exacte de la fiche qui donne le dosage"
    }
  ]
}
Règles :
- Recopie les dosages EXACTEMENT. Un dosage absent de la fiche vaut null : n'estime jamais.
- Quand un mélange se détaille (résine + charge + pigments), donne un composant par produit, avec le dosage du tableau, pas le dosage global du mélange.
- "surface_kit_m2" : la PLUS PETITE surface traitée par un kit du tableau des conditionnements, sinon null.
- "conditionnement_kg" : le poids de ce produit dans ce plus petit kit.
- Les virgules décimales deviennent des points.`;

const nombreOuRien = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
};
const texteOuRien = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : undefined;

/**
 * La réponse du modèle, remise en forme — et nettoyée de ce qui ne se
 * chiffre pas. Un composant sans libellé est écarté ; un dosage illisible
 * devient `undefined`, jamais zéro.
 */
export function normaliserExtraction(brut: unknown): SystemeExtrait | null {
  const b = (brut ?? {}) as Record<string, unknown>;
  const nom = texteOuRien(b.nom)?.replace(/^syst[eè]me\s+/i, '');
  if (!nom) return null;
  const composants = (Array.isArray(b.composants) ? b.composants : [])
    .map((c): ComposantExtrait | null => {
      const x = (c ?? {}) as Record<string, unknown>;
      const libelle = texteOuRien(x.libelle);
      if (!libelle) return null;
      return {
        libelle,
        role: texteOuRien(x.role) ?? 'base',
        consommation: nombreOuRien(x.consommation),
        ratioBase: nombreOuRien(x.ratio_base),
        pourcentage: nombreOuRien(x.pourcentage),
        obligatoire: x.obligatoire !== false,
        auKit: x.au_kit === true,
        conditionnementKg: nombreOuRien(x.conditionnement_kg),
        condition: texteOuRien(x.condition),
        phraseSource: texteOuRien(x.phrase_source),
      };
    })
    .filter((c): c is ComposantExtrait => !!c);
  const surfaceKitM2 = nombreOuRien(b.surface_kit_m2);
  return {
    nom,
    variante: texteOuRien(b.variante),
    famille: texteOuRien(b.famille),
    usage: texteOuRien(b.usage),
    support: texteOuRien(b.support) ?? 'tous',
    description: texteOuRien(b.description),
    /* Le plafond des petits mélanges est une règle de la maison, pas de la
       fiche : 50 m², au-delà une surface pleine se chiffre au kilo. */
    ...(surfaceKitM2 ? { surfaceKitM2, kitSurfaceMaxM2: 50 } : {}),
    composants,
  };
}

async function enBase64(fichier: File): Promise<string> {
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(binaire);
}

/** Fait lire la fiche — et son tableur de calcul — par Gemini. */
export async function lireFiche(fiche: FicheTrouvee): Promise<SystemeExtrait> {
  const pdf = await fiche.handle.getFile();
  const parts: unknown[] = [
    { text: CONSIGNE },
    { inline_data: { mime_type: 'application/pdf', data: await enBase64(pdf) } },
  ];
  if (fiche.annexes.length) {
    const { parseExcel } = await import('@/lib/parseExcel');
    for (const a of fiche.annexes) {
      try {
        const { texte } = await parseExcel(await a.getFile());
        parts.push({ text: `Tableur de calcul joint (${a.name}) :\n${texte.slice(0, 12000)}` });
      } catch { /* la fiche suffit */ }
    }
  }
  const reponse = await appelerGemini({
    contents: [{ parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });
  const texte = texteGemini(reponse);
  const json = texte.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('la lecture de la fiche n’a rendu aucun JSON');
  const extrait = normaliserExtraction(JSON.parse(json[0]));
  if (!extrait) throw new Error('la fiche ne nomme aucun système');
  if (!extrait.composants.length) throw new Error('aucun composant lu dans la fiche');
  return extrait;
}

/**
 * L'article du catalogue qu'un composant désigne, s'il n'y en a qu'un de sûr.
 * Un composant sans article part en ligne libre — mieux qu'un homonyme.
 */
export function articlePourComposant(
  libelle: string,
  produits: Produit[],
  rapprocher: (texte: string, produits: Produit[]) => { meilleur?: Produit; confiance: string },
): Produit | undefined {
  const r = rapprocher(libelle, produits);
  return r.confiance === 'sure' ? r.meilleur : undefined;
}

/* ── L'enregistrement ────────────────────────────────────────────────────── */

/** Écrit le système relu en base. Rend son identifiant. */
export async function enregistrerSysteme(extrait: SystemeExtrait, fiche: FicheTrouvee): Promise<string> {
  const { data, error } = await supabase
    .from('systemes')
    .insert({
      nom: extrait.nom,
      variante: extrait.variante ?? null,
      famille: extrait.famille ?? null,
      usage: extrait.usage ?? null,
      support: extrait.support,
      description: extrait.description ?? null,
      source_fiche: fiche.nom,
      source_drive: `${DOSSIER_FICHES_SYSTEME}\\${fiche.chemin.replace(/\//g, '\\')}`,
      ...(extrait.surfaceKitM2 != null ? { surface_kit_m2: extrait.surfaceKitM2 } : {}),
      ...(extrait.kitSurfaceMaxM2 != null ? { kit_surface_max_m2: extrait.kitSurfaceMaxM2 } : {}),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'système non enregistré');

  const { error: erreurComposants } = await supabase.from('systeme_composants').insert(
    extrait.composants.map((c, i) => ({
      systeme_id: data.id,
      ordre: i + 1,
      produit_id: c.produitId ?? null,
      libelle: c.libelle,
      role: c.role,
      consommation: c.consommation ?? null,
      ratio_base: c.ratioBase ?? null,
      pourcentage: c.pourcentage ?? null,
      obligatoire: c.obligatoire,
      au_kit: c.auKit,
      conditionnement_kg: c.conditionnementKg ?? null,
      condition: c.condition ?? null,
      phrase_source: c.phraseSource ?? null,
    })),
  );
  if (erreurComposants) {
    /* Un système sans composants se reconnaîtrait et ne chiffrerait rien :
       on le retire plutôt que de le laisser à moitié écrit. */
    await supabase.from('systemes').delete().eq('id', data.id);
    throw new Error(erreurComposants.message);
  }
  return data.id;
}
