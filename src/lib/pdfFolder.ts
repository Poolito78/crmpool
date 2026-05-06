import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ─── IndexedDB : persistance du dossier mémorisé ─────────────────────────────

const IDB_NAME = 'crmpool-settings';
const IDB_STORE = 'handles';
const IDB_KEY = 'pdf-folder';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function storeDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function clearStoredDirHandle(): Promise<void> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ─── Sauvegarde dans le dossier mémorisé ─────────────────────────────────────

type ShowDirPicker = (opts?: object) => Promise<FileSystemDirectoryHandle>;

export async function writeFileToFolder(
  fileName: string,
  content: Uint8Array,
  forcePickFolder = false,
): Promise<{ ok: boolean; folderName?: string }> {
  if (!('showDirectoryPicker' in window)) return { ok: false };
  try {
    let dirHandle = await getStoredDirHandle();
    if (!forcePickFolder && dirHandle) {
      // @ts-expect-error – requestPermission pas encore dans les types DOM
      const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') dirHandle = null;
    }
    if (!dirHandle || forcePickFolder) {
      dirHandle = await (window as typeof window & { showDirectoryPicker: ShowDirPicker })
        .showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await storeDirHandle(dirHandle);
    }
    const fh = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
    return { ok: true, folderName: dirHandle.name };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false };
    console.error(err);
    return { ok: false };
  }
}

// ─── Génération PDF depuis un élément DOM ─────────────────────────────────────

export async function generatePdfFromElement(element: HTMLElement): Promise<string> {
  // Clone dans un conteneur offscreen fixé à 794px pour une capture A4 propre
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;z-index:-1;';
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = '794px';
  clone.style.maxWidth = '794px';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  await new Promise(r => setTimeout(r, 80));

  const canvas = await html2canvas(clone, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  document.body.removeChild(wrapper);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pw) / canvas.width;
  let yOffset = 0, page = 0;
  while (yOffset < imgH) {
    if (page > 0) pdf.addPage();
    const srcY = (yOffset / imgH) * canvas.height;
    const srcH = Math.min((ph / imgH) * canvas.height, canvas.height - srcY);
    const sliceH = (srcH / canvas.height) * imgH;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = srcH;
    tmp.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
    pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, sliceH);
    yOffset += ph; page++;
  }
  return pdf.output('datauristring').split(',')[1];
}

// ─── Sauvegarde PDF complet (génération + dossier + fallback) ────────────────

export async function savePdfFromElement(
  element: HTMLElement,
  fileName: string,
): Promise<{ ok: boolean; folderName?: string }> {
  const base64 = await generatePdfFromElement(element);
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const res = await writeFileToFolder(fileName, bytes);
  if (res.ok) return res;

  // Fallback : téléchargement classique
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { ok: false };
}
