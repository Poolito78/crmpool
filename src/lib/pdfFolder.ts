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

// ─── Sauvegarde dans un sous-dossier du dossier mémorisé ────────────────────
export async function writeFileToSubfolder(
  subfolderName: string,
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
    // Créer ou ouvrir le sous-dossier
    const subDir = await dirHandle.getDirectoryHandle(subfolderName, { create: true });
    const fh = await subDir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
    return { ok: true, folderName: `${dirHandle.name}/${subfolderName}` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false };
    console.error(err);
    return { ok: false };
  }
}

export async function generatePdfFromElement(
  element: HTMLElement,
  opts?: { devisNumero?: string; devisDate?: string; logoDataUrl?: string; docTitle?: string },
): Promise<string> {
  // ── Clone l'élément dans un conteneur hors-écran à la racine du body
  // pour éviter que les ancêtres (dialog overflow-y:auto → overflow-x:hidden)
  // ne rognent l'élément lors de la capture html2canvas.
  const A4_PX = 794;
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    `position:fixed`,
    `left:-${A4_PX + 200}px`,
    `top:0`,
    `width:${A4_PX}px`,
    `overflow:visible`,
    `background:white`,
    `pointer-events:none`,
    `z-index:-9999`,
  ].join(';');
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = A4_PX + 'px';
  clone.style.minWidth = A4_PX + 'px';
  clone.style.maxWidth = A4_PX + 'px';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);
  // Attend 2 frames pour que le navigateur reflowe le clone au new width avant capture
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  // ── Centrage vertical en-tête : force vertical-align:middle + padding symétrique
  // sur chaque <th> du clone avec !important pour garantir le rendu html2canvas.
  clone.querySelectorAll<HTMLElement>('thead tr').forEach((tr, rowIdx) => {
    const padV = rowIdx === 0 ? '4px' : '2px';
    // Les rangées à fond rouge sont redessinées par l'overlay jsPDF (centrage parfait) :
    // on masque leur texte dans la capture html2canvas pour éviter le doublement.
    const isRed = window.getComputedStyle(tr).backgroundColor === 'rgb(204, 0, 0)';
    tr.querySelectorAll<HTMLElement>('th').forEach(th => {
      th.style.setProperty('vertical-align', 'middle', 'important');
      th.style.setProperty('padding-top', padV, 'important');
      th.style.setProperty('padding-bottom', padV, 'important');
      if (isRed) th.style.setProperty('color', 'transparent', 'important');
    });
  });
  // 1 frame supplémentaire pour appliquer les nouveaux styles avant capture
  await new Promise<void>(r => requestAnimationFrame(() => r()));

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 15000,
      windowWidth: A4_PX,
    });
  } catch (err: unknown) {
    // Nettoyage si html2canvas échoue
    document.body.removeChild(wrap);
    throw err;
  }
  // Le clone reste dans le DOM jusqu'à la fin des mesures offsetTop/offsetHeight.
  // (Si finally retirait le wrap ici, offsetTop retourne 0 → computePageSlices inutile)
  const captureEl = clone;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pw) / canvas.width;

  // Zone réservée en bas pour le pied de page (mentions légales + numéro de page)
  const footerH = 12;
  // Entête répété sur pages 2+ (logo + DEVIS + numéro + date)
  const headerH = 14;
  // Page 1 : hauteur pleine ; pages suivantes : réduite de headerH
  const contentH1 = ph - footerH;          // page 1
  const contentHn = ph - footerH - headerH; // pages 2+
  const contentH = contentH1;              // alias pour calculs globaux

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

  // Entête répété sur pages 2+ : logo + DEVIS + numéro + date
  function drawPageHeader() {
    // Ligne de séparation rouge en bas de l'entête
    pdf.setDrawColor(204, 0, 0);
    pdf.setLineWidth(0.4);
    pdf.line(8, headerH, pw - 8, headerH);
    // Logo
    if (opts?.logoDataUrl) {
      try {
        const logoW = 28; const logoH = 8;
        pdf.addImage(opts.logoDataUrl, 'PNG', 8, 2, logoW, logoH);
      } catch { /* ignore si logo indisponible */ }
    }
    // DEVIS / AR + numéro + date (droite)
    pdf.setFontSize(11);
    pdf.setTextColor(30, 30, 30);
    pdf.setFont('helvetica', 'bold');
    pdf.text(opts?.docTitle ?? 'DEVIS', pw - 8, 6, { align: 'right' });
    if (opts?.devisNumero) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 80, 200);
      pdf.text(opts.devisNumero, pw - 8, 11, { align: 'right' });
    }
    pdf.setTextColor(30, 30, 30);
  }

  // Calcule les positions de saut de page en évitant de couper les <tr>
  // Utilise offsetTop/offsetHeight (fiable indépendamment du scroll)
  function getOffsetRelative(el: HTMLElement): { top: number; bottom: number } {
    let top = 0;
    let cur: HTMLElement | null = el;
    while (cur && cur !== captureEl) {
      top += cur.offsetTop;
      cur = cur.offsetParent as HTMLElement | null;
    }
    return { top, bottom: top + el.offsetHeight };
  }

  function computePageSlices(): number[] {
    const elementH = captureEl.scrollHeight || captureEl.offsetHeight;
    if (elementH === 0) return [];
    const domToMm = imgH / elementH;

    // Bord bas de chaque <tr> en mm depuis le haut du container
    const rowBottoms: number[] = [];
    captureEl.querySelectorAll('tr').forEach(tr => {
      const { bottom } = getOffsetRelative(tr as HTMLElement);
      const bottomMm = bottom * domToMm;
      if (bottomMm > 0 && bottomMm <= imgH) rowBottoms.push(bottomMm);
    });
    rowBottoms.sort((a, b) => a - b);

    // Après avoir choisi un bestBreak, s'assurer qu'il ne tombe pas dans une zone
    // interdite (noBreakZones collecté AVANT removeChild, coordonnées fiables).
    // Un break à exactement zone.top est autorisé (coupe juste avant le header).
    function adjustBreak(candidate: number, minBreak: number): number {
      for (const zone of noBreakZones) {
        if (candidate > zone.top + 0.5 && candidate < zone.bottom + 0.5) {
          // Le candidat est dans la zone → chercher le dernier rowBottom avant zone.top
          for (let i = rowBottoms.length - 1; i >= 0; i--) {
            if (rowBottoms[i] <= zone.top + 0.5 && rowBottoms[i] >= minBreak) {
              return rowBottoms[i];
            }
          }
        }
      }
      return candidate;
    }

    // Pas de lignes détectées → découpe standard
    if (rowBottoms.length === 0) return [];

    const slices: number[] = [];
    let consumed = 0;
    let pageIdx = 0;
    while (consumed < imgH) {
      const pageContentH = pageIdx === 0 ? contentH1 : contentHn;
      const remaining = imgH - consumed;
      if (remaining <= pageContentH) { slices.push(remaining); break; }
      const naturalBreak = consumed + pageContentH;
      // On ne recule que faiblement (max ~18%) pour aligner sur une fin de ligne :
      // un seuil trop bas (ex. 0.3) renvoyait le saut jusqu'à la dernière ligne du
      // tableau, laissant un grand vide en bas de page.
      const minBreak = consumed + pageContentH * 0.82;
      let bestBreak = naturalBreak;
      for (let i = rowBottoms.length - 1; i >= 0; i--) {
        if (rowBottoms[i] <= naturalBreak && rowBottoms[i] >= minBreak) {
          bestBreak = rowBottoms[i];
          break;
        }
      }
      if (bestBreak <= consumed) bestBreak = naturalBreak;
      // Ajuster pour éviter de couper dans une zone interdite (header de groupe)
      bestBreak = adjustBreak(bestBreak, minBreak);
      if (bestBreak <= consumed) bestBreak = naturalBreak;
      slices.push(bestBreak - consumed);
      consumed = bestBreak;
      pageIdx++;
    }
    return slices;
  }

  // ── Annotations de liens PDF (éléments portant data-pdf-href dans le clone) ──
  type PdfLinkAnnot = { url: string; xMm: number; yMm: number; wMm: number; hMm: number };
  const pdfLinks: PdfLinkAnnot[] = [];
  {
    const cloneH = captureEl.scrollHeight || captureEl.offsetHeight;
    const dToMmY = cloneH > 0 ? imgH / cloneH : 1;
    const dToMmX = pw / A4_PX;
    captureEl.querySelectorAll<HTMLElement>('[data-pdf-href]').forEach(el => {
      const url = el.getAttribute('data-pdf-href') ?? '';
      if (!url) return;
      const { top, bottom } = getOffsetRelative(el);
      let leftPx = 0;
      let cur: HTMLElement | null = el;
      while (cur && cur !== captureEl) { leftPx += cur.offsetLeft; cur = cur.offsetParent as HTMLElement | null; }
      pdfLinks.push({ url, xMm: leftPx * dToMmX, yMm: top * dToMmY, wMm: el.offsetWidth * dToMmX, hMm: (bottom - top) * dToMmY });
    });
  }

  // ── Mesure des rangées <thead> pour overlay jsPDF (centrage vertical précis) ──
  // html2canvas ne centre pas fiablement le texte dans les <th>. On redessine
  // l'en-tête manuellement avec jsPDF après avoir posé l'image html2canvas.
  type TheadRowData = {
    yMm: number; hMm: number;
    hasBgRed: boolean; // true seulement si le <tr> a effectivement un fond rouge (#CC0000)
    cells: { xMm: number; wMm: number; text: string; alignH: string; fontSizePt: number; bold: boolean; italic: boolean; opacity: number; hasBorderLeft: boolean }[];
  };
  const theadRowData: TheadRowData[] = [];
  {
    const cloneH = captureEl.scrollHeight || captureEl.offsetHeight;
    const dY = cloneH > 0 ? imgH / cloneH : 1;
    const dX = pw / A4_PX;
    captureEl.querySelectorAll<HTMLElement>('thead tr').forEach(tr => {
      let trTop = 0; let c: HTMLElement | null = tr;
      while (c && c !== captureEl) { trTop += c.offsetTop; c = c.offsetParent as HTMLElement | null; }
      const cells: TheadRowData['cells'] = [];
      tr.querySelectorAll<HTMLElement>('th').forEach(th => {
        const cs = window.getComputedStyle(th);
        let thLeft = 0; let d: HTMLElement | null = th;
        while (d && d !== captureEl) { thLeft += d.offsetLeft; d = d.offsetParent as HTMLElement | null; }
        cells.push({
          xMm: thLeft * dX,
          wMm: th.offsetWidth * dX,
          text: th.textContent?.trim() ?? '',
          alignH: cs.textAlign,
          fontSizePt: parseFloat(cs.fontSize) * 0.75,
          bold: parseInt(cs.fontWeight) >= 600,
          italic: cs.fontStyle === 'italic',
          opacity: parseFloat(cs.opacity) || 1,
          hasBorderLeft: th.classList.contains('border-l'),
        });
      });
      // Détecte le fond rouge via la couleur calculée (robuste : classe Tailwind ou style inline)
      const trBg = window.getComputedStyle(tr).backgroundColor;
      const hasBgRed = trBg === 'rgb(204, 0, 0)';
      theadRowData.push({ yMm: trTop * dY, hMm: tr.offsetHeight * dY, hasBgRed, cells });
    });
  }

  // ── Zones interdites de coupure : headers de groupe ─────────────────────────
  // IMPORTANT : collecté ici, AVANT removeChild. Après détachement du DOM,
  // offsetParent === null → getOffsetRelative ne remonte plus jusqu'à captureEl
  // et retourne des coordonnées fausses.
  const noBreakZones: { top: number; bottom: number }[] = [];
  {
    const cloneH = captureEl.scrollHeight || captureEl.offsetHeight;
    if (cloneH > 0) {
      const dY = imgH / cloneH;
      captureEl.querySelectorAll<HTMLElement>('tr[data-pdf-no-break-after]').forEach(tr => {
        let trTop = 0; let c: HTMLElement | null = tr;
        while (c && c !== captureEl) { trTop += c.offsetTop; c = c.offsetParent as HTMLElement | null; }
        const topMm = trTop * dY;
        const bottomMm = (trTop + tr.offsetHeight) * dY;
        if (bottomMm > 0) noBreakZones.push({ top: topMm, bottom: bottomMm });
      });
    }
  }

  // Calcul des slices AVANT retrait du clone : offsetTop/offsetParent fiables
  const precomputedSlices = computePageSlices();

  // Mesures terminées — on retire le clone du DOM
  document.body.removeChild(wrap);

  {
    const slices = precomputedSlices;
    // Fallback si détection DOM échoue : découpe standard
    let effectiveSlices = slices.length > 0 ? slices : (() => {
      const fallback: number[] = [];
      let y = 0; let idx = 0;
      while (y < imgH) {
        const h = Math.min(idx === 0 ? contentH1 : contentHn, imgH - y);
        fallback.push(h); y += h; idx++;
      }
      return fallback;
    })();

    // Fusionne les pages de fin qui tiendraient ensemble (évite pages quasi-vides)
    let merged = true;
    while (merged && effectiveSlices.length >= 2) {
      merged = false;
      const last = effectiveSlices[effectiveSlices.length - 1];
      const prev = effectiveSlices[effectiveSlices.length - 2];
      if (prev + last <= contentHn) {
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
      // Page 1 : contenu commence à y=0 ; pages suivantes : décalé sous l'entête
      const yContent = page === 0 ? 0 : headerH;
      pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', 0, yContent, pw, sliceH);
      if (page > 0) drawPageHeader();
      drawFooter(page + 1, totalPages);

      // ── Overlay en-tête : redessine les rangées <thead> avec jsPDF
      // pour un centrage vertical parfait (contourne les bugs html2canvas sur <th>).
      if (page === 0 && theadRowData.length > 0) {
        theadRowData.forEach(row => {
          // Ne redessiner que les rangées qui ont effectivement un fond rouge en HTML
          if (!row.hasBgRed) return;
          // Bornes X de la table depuis les mesures réelles des cellules
          // (exclut automatiquement le padding du container — ex. px-10 — qui décale tout)
          const leftX = row.cells.length > 0 ? Math.min(...row.cells.map(c => c.xMm)) : 0;
          const rightX = row.cells.length > 0 ? Math.max(...row.cells.map(c => c.xMm + c.wMm)) : pw;
          // Rectangle rouge aligné sur la table
          pdf.setFillColor(204, 0, 0);
          pdf.rect(leftX, row.yMm, rightX - leftX, row.hMm, 'F');
          // Séparateurs verticaux entre groupes de colonnes (border-l border-white/20)
          // Couleur = blanc 20% sur #CC0000 → (255*0.2+204*0.8, ...) ≈ (214,51,51)
          pdf.setDrawColor(214, 51, 51);
          pdf.setLineWidth(0.25);
          row.cells.forEach(cell => {
            if (cell.hasBorderLeft && cell.xMm > leftX + 0.5) {
              pdf.line(cell.xMm, row.yMm, cell.xMm, row.yMm + row.hMm);
            }
          });
          // Texte centré dans chaque cellule
          row.cells.forEach(cell => {
            if (!cell.text) return;
            const fontStyle = cell.bold ? (cell.italic ? 'bolditalic' : 'bold') : (cell.italic ? 'italic' : 'normal');
            pdf.setFont('helvetica', fontStyle);
            // Auto-réduit la fonte si le texte dépasse la cellule.
            // Les métriques Helvetica de jsPDF sont plus larges que le rendu navigateur →
            // les cellules étroites (<32px) débordent sur la cellule voisine sans ce clamp.
            const hPad = 0.5; // mm padding horizontal (réduit pour maximiser l'espace)
            const availW = Math.max(0.5, cell.wMm - 2 * hPad);
            const unitW = pdf.getStringUnitWidth(cell.text); // indépendant de la taille courante
            const maxFontPt = unitW > 0
              ? availW * (pdf.internal.scaleFactor) / unitW
              : cell.fontSizePt;
            const useFontPt = Math.min(cell.fontSizePt, Math.max(4, maxFontPt));
            pdf.setFontSize(useFontPt);
            // Blanc mélangé au fond rouge selon opacité (simule opacity CSS)
            const bl = (c: number) => Math.round(255 * cell.opacity + c * (1 - cell.opacity));
            pdf.setTextColor(bl(204), bl(0), bl(0));
            const midY = row.yMm + row.hMm / 2;
            if (cell.alignH === 'center') {
              pdf.text(cell.text, cell.xMm + cell.wMm / 2, midY, { align: 'center', baseline: 'middle' });
            } else if (cell.alignH === 'right') {
              pdf.text(cell.text, cell.xMm + cell.wMm - hPad, midY, { align: 'right', baseline: 'middle' });
            } else {
              pdf.text(cell.text, cell.xMm + hPad, midY, { align: 'left', baseline: 'middle' });
            }
          });
        });
        pdf.setTextColor(0, 0, 0); // reset
      }

      // Liens sur cette page
      for (const lk of pdfLinks) {
        if (lk.yMm >= yOffsetMm && lk.yMm < yOffsetMm + sliceH) {
          pdf.link(lk.xMm, (lk.yMm - yOffsetMm) + yContent, lk.wMm, lk.hMm, { url: lk.url });
        }
      }
      yOffsetMm += sliceH; page++;
    }
  }
  return pdf.output('datauristring').split(',')[1];
}

// ─── Sauvegarde PDF complet (génération + dossier + fallback) ────────────────

export async function savePdfFromElement(
  element: HTMLElement,
  fileName: string,
  opts?: { devisNumero?: string; devisDate?: string; logoDataUrl?: string },
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
