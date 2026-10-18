/**
 * Le dossier où Outlook dépose les mails à traiter — l'Agent mail sans Azure.
 *
 * La macro `outlook_macro/ExporterMailsNonLus.bas` enregistre les mails à
 * traiter de la boîte de réception en .msg dans `DOSSIER_MAILS` — non lus,
 * mais aussi LUS SANS RÉPONSE et à suivre : ouvrir un mail ne chiffre rien —
 * puis ouvre MonCRM sur `?agentMail=1`. `ThisOutlookSession.vba` exporte
 * chaque mail à son arrivée ; sans lui, le dossier n'a que ce que le dernier
 * lancement de la macro y a mis (`dernierExport` le fait voir). Le navigateur ne peut pas ouvrir un dossier
 * seul : il est choisi une fois, et son autorisation est gardée en IndexedDB
 * (même base que le dossier des fiches système, `fichesSysteme.ts`).
 *
 * Un mail traité est RANGÉ dans le sous-dossier `Traites` — jamais supprimé :
 * le remettre à traiter, c'est le déplacer d'un dossier à l'autre. La macro
 * n'exporte pas une seconde fois un mail présent dans l'un ou l'autre.
 *
 * ⚠️ **Le mail reste NON LU dans Outlook.** Seule la connexion directe
 * Microsoft 365 (`microsoftGraph.ts`) sait le marquer lu.
 *
 * ⚠️ **Un `File` tiré d'un dossier est adossé au disque** : une fois le
 * fichier déplacé, le lire lève `NotReadableError`. `copieEnMemoire` en fait
 * une copie avant de le confier à l'analyse puis de le ranger.
 */

import { lireMsg, lirePiecesJointesMsg } from './lireMsg';
import { type MailAgent, dateDuNom, enteteEml, estFichierMail, pieceJointeUtile } from './agentMail';

/** Le dossier attendu, à afficher : c'est celui qu'écrit la macro. */
export const DOSSIER_MAILS = 'OneDrive - ISOSIGN\\Documents\\MonCRM\\Mails a traiter';
const SOUS_DOSSIER_TRAITES = 'Traites';

const IDB_NAME = 'crmpool-settings';
const IDB_STORE = 'handles';
const IDB_KEY = 'agent-mail-folder';

type DirHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FileSystemHandle>;
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};
type ShowDirPicker = (opts?: object) => Promise<FileSystemDirectoryHandle>;

export function dossierMailsDisponible(): boolean {
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

/** Le nom du dossier déjà choisi, sans demander de droit (pour l'affichage). */
export async function nomDossierMails(): Promise<string | null> {
  return (await lireHandle())?.name ?? null;
}

/**
 * Le dossier, avec droit de lecture-écriture (l'écriture sert à ranger).
 * `interactif` : sur un clic, on redemande le droit ou l'on fait choisir le
 * dossier ; sinon on rend `null` sans bruit — Chrome n'accorde un droit qu'à
 * un geste de l'utilisateur.
 */
export async function dossierMails(interactif: boolean, changer = false): Promise<FileSystemDirectoryHandle | null> {
  if (!dossierMailsDisponible()) return null;
  const garde = changer ? null : await lireHandle();
  if (garde) {
    if (!garde.queryPermission || (await garde.queryPermission({ mode: 'readwrite' })) === 'granted') return garde;
    if (interactif && garde.requestPermission
      && (await garde.requestPermission({ mode: 'readwrite' })) === 'granted') return garde;
    if (!interactif) return null;
  }
  if (!interactif) return null;
  const choisi = await resoudreDossier(await (window as typeof window & { showDirectoryPicker: ShowDirPicker })
    .showDirectoryPicker({ id: 'agent-mail', mode: 'readwrite', startIn: 'documents' }));
  await garderHandle(choisi);
  return choisi;
}

/**
 * Le dossier où sont VRAIMENT les mails : si l'on a désigné un parent
 * (« Documents », « MonCRM »), on descend jusqu'à « Mails a traiter ».
 */
export async function resoudreDossier(dossier: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  const chemin = ['MonCRM', 'Mails a traiter'];
  for (let depart = 0; depart < chemin.length; depart++) {
    let d: FileSystemDirectoryHandle = dossier;
    try {
      for (const nom of chemin.slice(depart)) d = await d.getDirectoryHandle(nom);
      return d;
    } catch { /* ce chemin n'existe pas sous ce dossier */ }
  }
  return dossier;
}

/** Les .msg / .eml à la racine du dossier (pas dans `Traites`). */
export async function fichiersDuDossier(dossier: FileSystemDirectoryHandle): Promise<File[]> {
  const res: File[] = [];
  for await (const h of (dossier as DirHandle).values()) {
    if (h.kind === 'file' && estFichierMail(h.name)) res.push(await (h as FileSystemFileHandle).getFile());
  }
  return res;
}

/**
 * La réception du mail le plus récent jamais exporté (dossier ou `Traites`),
 * lue dans le nom du fichier. Plusieurs jours sans rien, c'est une macro qui
 * ne tourne plus : « Relire » relit le dossier, il n'interroge pas Outlook.
 */
export async function dernierExport(dossier: FileSystemDirectoryHandle): Promise<string | null> {
  let max: string | null = null;
  const parcourir = async (d: FileSystemDirectoryHandle) => {
    for await (const h of (d as DirHandle).values()) {
      const date = h.kind === 'file' && estFichierMail(h.name) ? dateDuNom(h.name) : undefined;
      if (date && (!max || date > max)) max = date;
    }
  };
  await parcourir(dossier);
  try { await parcourir(await dossier.getDirectoryHandle(SOUS_DOSSIER_TRAITES)); } catch { /* pas encore de Traites */ }
  return max;
}

/**
 * Nom du .msg → EntryID Outlook, noté par la macro dans `entryids.txt` (en
 * ANSI : lu en windows-1252, sinon les accents des objets ne collent plus au
 * nom du fichier). Un mail exporté avant l'index ou glissé n'y est pas.
 */
export async function lireIndexOutlook(dossier: FileSystemDirectoryHandle): Promise<Map<string, string>> {
  const res = new Map<string, string>();
  try {
    const f = await (await dossier.getFileHandle('entryids.txt')).getFile();
    const texte = new TextDecoder('windows-1252').decode(await f.arrayBuffer());
    for (const ligne of texte.split(/\r?\n/)) {
      const [nom, id] = ligne.split('\t');
      if (nom && id && /^[0-9A-F]+$/i.test(id.trim())) res.set(nom, id.trim());
    }
  } catch { /* pas encore d'index */ }
  return res;
}

/**
 * Rouvre le mail dans Outlook (`OUTLOOK.EXE /select`). Le protocole n'existe
 * pas d'office : `outlook_macro/lien-outlook.reg`, une fois par poste.
 * ⚠️ Un mail déplacé dans Outlook peut changer d'EntryID : le lien échoue.
 */
export function lienOutlook(entryId: string): string {
  return `outlook:${entryId}`;
}

/** Copie détachée du disque : reste lisible une fois l'original rangé. */
export async function copieEnMemoire(f: File): Promise<File> {
  return new File([await f.arrayBuffer()], f.name, { type: f.type, lastModified: f.lastModified });
}

/** Range le fichier dans `Traites` (copie puis retrait de l'original). */
export async function rangerTraite(dossier: FileSystemDirectoryHandle, f: File): Promise<void> {
  const traites = await dossier.getDirectoryHandle(SOUS_DOSSIER_TRAITES, { create: true });
  const cible = await traites.getFileHandle(f.name, { create: true });
  const w = await cible.createWritable();
  await w.write(await f.arrayBuffer());
  await w.close();
  await dossier.removeEntry(f.name);
}

/** Identifiant stable d'un fichier de mail, d'une lecture à l'autre. */
export function idFichier(f: File): string {
  return `f:${f.name}:${f.size}`;
}

/** Lit un .msg ou un .eml en mail de l'agent. */
export async function lireMailFichier(f: File, duDossier = false): Promise<MailAgent> {
  const base = { id: idFichier(f), source: 'fichier' as const, fichier: f, duDossier };
  const dateFichier = dateDuNom(f.name) || new Date(f.lastModified || Date.now()).toISOString();

  if (/\.msg$/i.test(f.name)) {
    const m = await lireMsg(f);
    let pj: string[] = [];
    try { pj = (await lirePiecesJointesMsg(f)).map(p => p.nom); } catch { /* sans pièces jointes */ }
    return {
      ...base,
      sujet: m.sujet || f.name.replace(/\.msg$/i, ''),
      deNom: m.expediteurNom,
      deEmail: m.expediteurAdresse.toLowerCase(),
      recuLe: dateFichier,
      corps: m.corps,
      piecesJointes: pj.filter(pieceJointeUtile),
    };
  }

  const brut = await f.text();
  const e = enteteEml(brut);
  const { parseEml } = await import('./parseEml');
  const corps = (await parseEml(f)).texte.replace(/^Objet : .*\n\n/, '');
  const pj = [...brut.matchAll(/filename\*?=\s*"?([^";\r\n]+)"?/gi)].map(m => m[1].trim());
  return {
    ...base,
    sujet: e.sujet || f.name.replace(/\.eml$/i, ''),
    deNom: e.deNom,
    deEmail: e.deEmail,
    recuLe: e.date || dateFichier,
    corps,
    piecesJointes: [...new Set(pj)].filter(pieceJointeUtile),
  };
}
