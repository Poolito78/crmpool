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

  // Zone réservée en bas pour le pied de page (mentions légales + numéro de page)
  const footerH = 12;
  const contentH = ph - footerH;

  const LEGAL_LINE1 = 'ISOSIGN® • ZA du Monay - 71210 SAINT-EUSÈBE - France - Tél. : 03 85 77 07 25 • Fax : 03 85 55 41 14 • isosign@isosign.fr • www.isosign.fr';
  const LEGAL_LINE2 = 'SAS au capital de 40 000 € • RCS Chalon-sur-Saône 494922313 • SIRET 4949223130005 • APE 4669B • TVA FR76494922313';

  function drawFooter(pageNum: number, totalPages: number) {
    // Trait de séparation
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.line(8, ph - footerH + 1, pw - 8, ph - footerH + 1);
    // Mentions légales sur 2 lignes resserrées
    pdf.setFontSize(6.5);
    pdf.setTextColor(130, 130, 130);
    pdf.text(LEGAL_LINE1, pw / 2, ph - footerH + 4.5, { align: 'center' });
    pdf.text(LEGAL_LINE2, pw / 2, ph - footerH + 8.5, { align: 'center' });
    // Numéro de page à droite, aligné sur la 2e ligne de mentions
    pdf.setFontSize(7.5);
    pdf.text(`Page ${pageNum} / ${totalPages}`, pw - 8, ph - footerH + 8.5, { align: 'right' });
    if (opts?.devisNumero) {
      pdf.setFontSize(7);
      pdf.text(opts.devisNumero, 8, ph - footerH + 8.5, { align: 'left' });
    }
  }

  // Calcule les positions de saut de page en évitant de couper les <tr>
  // Utilise offsetTop/offsetHeight (fiable indépendamment du scroll)
  function getOffsetRelative(el: HTMLElement): { top: number; bottom: number } {
    let top = 0;
    let cur: HTMLElement | null = el;
    while (cur && cur !== element) {
      top += cur.offsetTop;
      cur = cur.offsetParent as HTMLElement | null;
    }
    return { top, bottom: top + el.offsetHeight };
  }

  function computePageSlices(): number[] {
    const elementH = element.scrollHeight || element.offsetHeight;
    if (elementH === 0) return [];
    const domToMm = imgH / elementH;

    // Bord bas de chaque <tr> en mm depuis le haut du container
    const rowBottoms: number[] = [];
    element.querySelectorAll('tr').forEach(tr => {
      const { bottom } = getOffsetRelative(tr as HTMLElement);
      const bottomMm = bottom * domToMm;
      if (bottomMm > 0 && bottomMm <= imgH) rowBottoms.push(bottomMm);
    });
    rowBottoms.sort((a, b) => a - b);

    // Pas de lignes détectées → découpe standard
    if (rowBottoms.length === 0) return [];

    const slices: number[] = [];
    let consumed = 0;
    while (consumed < imgH) {
      const remaining = imgH - consumed;
      if (remaining <= contentH) { slices.push(remaining); break; }
      const naturalBreak = consumed + contentH;
      // Dernier bord de <tr> qui tient dans la page (au moins 30% de la page doit être remplie)
      const minBreak = consumed + contentH * 0.3;
      let bestBreak = naturalBreak;
      for (let i = rowBottoms.length - 1; i >= 0; i--) {
        if (rowBottoms[i] <= naturalBreak && rowBottoms[i] >= minBreak) {
          bestBreak = rowBottoms[i];
          break;
        }
      }
      if (bestBreak <= consumed) bestBreak = naturalBreak;
      slices.push(bestBreak - consumed);
      consumed = bestBreak;
    }
    return slices;
  }

  // Si le dépassement est inférieur à 150 mm, on compresse pour tenir sur une page
  const overflow = imgH - contentH;
  const forceSinglePage = overflow > 0 && overflow < 150;

  if (forceSinglePage) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, contentH);
    drawFooter(1, 1);
  } else {
    const slices = computePageSlices();
    // Fallback si détection DOM échoue : découpe standard
    let effectiveSlices = slices.length > 0 ? slices : (() => {
      const fallback: number[] = [];
      let y = 0;
      while (y < imgH) { const h = Math.min(contentH, imgH - y); fallback.push(h); y += h; }
      return fallback;
    })();

    // Fusionne les pages de fin qui tiendraient ensemble (évite pages quasi-vides)
    let merged = true;
    while (merged && effectiveSlices.length >= 2) {
      merged = false;
      const last = effectiveSlices[effectiveSlices.length - 1];
      const prev = effectiveSlices[effectiveSlices.length - 2];
      if (prev + last <= contentH) {
        effectiveSlices = [...effectiveSlices.slice(0, -2), prev + last];
        merged = true;
      }
    }

    const totalPages = effectiveSlices.length;
    let yOffsetMm = 0, page = 0;
    for (const sliceH of effectiveSlices) {
      if (page > 0) pdf.addPage();
      const srcY = Math.round((yOffsetMm / imgH) * canvas.height);
      const srcH = Math.round((sliceH / imgH) * canvas.height);
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width; tmp.height = Math.max(1, srcH);
      tmp.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, sliceH);
      drawFooter(page + 1, totalPages);
      yOffsetMm += sliceH; page++;
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
