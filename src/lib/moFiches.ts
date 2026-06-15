// Recherche de fiches « Mise en œuvre » dans un dossier local choisi par
// l'utilisateur (File System Access API). Le handle du dossier est mémorisé
// dans IndexedDB (même base que pdfFolder, clé distincte). PC/Chrome-Edge only.

const IDB_NAME = 'crmpool-settings';
const IDB_STORE = 'handles';
const IDB_KEY = 'mo-fiches-folder';

type DirHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FileSystemHandle>;
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};
type ShowDirPicker = (opts?: object) => Promise<FileSystemDirectoryHandle>;

export function moFichesSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStored(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function store(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

async function verifyPerm(handle: DirHandle, interactive: boolean): Promise<boolean> {
  const opts = { mode: 'read' as const };
  try {
    if ((await handle.queryPermission?.(opts)) === 'granted') return true;
    if (interactive && (await handle.requestPermission?.(opts)) === 'granted') return true;
  } catch { /* ignore */ }
  return false;
}

/** Récupère le dossier mémorisé (ou en fait choisir un si interactive). */
export async function ensureMoFolder(interactive: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!moFichesSupported()) return null;
  let handle = (await getStored()) as DirHandle | null;
  if (handle && await verifyPerm(handle, interactive)) return handle;
  if (interactive) {
    handle = await (window as typeof window & { showDirectoryPicker: ShowDirPicker })
      .showDirectoryPicker({ mode: 'read', startIn: 'documents' }) as DirHandle;
    await store(handle);
    return handle;
  }
  return null;
}

const ACCENTS = new RegExp('[\\u0300-\\u036f]', 'g');
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(ACCENTS, '').replace(/[^a-z0-9]/g, '');

export interface MoFiche { name: string; handle: FileSystemFileHandle; }

/** Cherche récursivement les fichiers dont le nom contient le système. */
export async function findMoFiches(dir: FileSystemDirectoryHandle, systeme: string, max = 25): Promise<MoFiche[]> {
  const target = norm(systeme);
  if (!target) return [];
  const out: MoFiche[] = [];
  async function walk(d: DirHandle, prefix: string, depth: number) {
    if (out.length >= max || depth > 4) return;
    for await (const entry of d.values()) {
      if (out.length >= max) return;
      if (entry.kind === 'file') {
        if (norm(entry.name).includes(target)) out.push({ name: prefix + entry.name, handle: entry as FileSystemFileHandle });
      } else if (entry.kind === 'directory') {
        await walk(entry as DirHandle, `${prefix}${entry.name}/`, depth + 1);
      }
    }
  }
  await walk(dir as DirHandle, '', 0);
  return out;
}
