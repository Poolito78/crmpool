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

export async function generatePdfFromElement(
  element: HTMLElement,
  opts?: { devisNumero?: string },
): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pw) / canvas.width;

  // Zone réservée en bas pour le pied de page
  const footerH = 10;
  const contentH = ph - footerH;

  // Si le dépassement est inférieur à 40 mm, on réduit pour tenir sur une page
  const overflow = imgH - contentH;
  const forceSinglePage = overflow > 0 && overflow < 40;

  if (forceSinglePage) {
    // Réduction proportionnelle : image centrée, hauteur = contentH
    const scale = contentH / imgH;
    const scaledW = pw * scale;
    const x = (pw - scaledW) / 2;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, 0, scaledW, contentH);
  } else {
    const totalPages = Math.ceil(imgH / contentH);
    let yOffset = 0, page = 0;
    while (yOffset < imgH) {
      if (page > 0) pdf.addPage();
      const srcY = (yOffset / imgH) * canvas.height;
      const availH = Math.min(contentH, imgH - yOffset);
      const srcH = (availH / imgH) * canvas.height;
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width; tmp.height = Math.round(srcH);
      tmp.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, availH);

      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${page + 1} / ${totalPages}`, pw / 2, ph - 4, { align: 'center' });
      if (page > 0 && opts?.devisNumero) {
        pdf.text(opts.devisNumero, pw - 8, ph - 4, { align: 'right' });
      }

      yOffset += contentH; page++;
    }
  }
  return pdf.output('datauristring').split(',')[1];
}

// ─── Sauvegarde PDF complet (génération + dossier + fallback) ────────────────

export async function savePdfFromElement(
  element: HTMLElement,
  fileName: string,
  opts?: { devisNumero?: string },
): Promise<{ ok: boolean; folderName?: string; blobUrl: string }> {
  const base64 = await generatePdfFromElement(element, opts);
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  const res = await writeFileToFolder(fileName, bytes);
  if (res.ok) return { ...res, blobUrl };

  // Fallback : téléchargement classique
  const a = document.createElement('a');
  a.href = blobUrl; a.download = fileName; a.click();
  return { ok: false, blobUrl };
}
