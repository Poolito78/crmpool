/**
 * Les panneaux d'un plan Kadri lus sur le DESSIN, quand la page ne les porte
 * pas en texte.
 *
 * Sur certains carnets (NMP850, plans de marché Demidoff), le dessin de chaque
 * ensemble est une image collée dans la page : le texte du PDF ne donne que le
 * cartouche et les supports, et la lecture déterministe (`lireEnsemble`)
 * annonçait « 0 panneau à fabriquer » sur 64 pages. La page est alors rendue
 * en image et Gemini RECOPIE les blocs d'annotation de chaque panneau — sort,
 * cote, fond — sans rien interpréter.
 *
 * ⚠️ **L'IA RECOPIE, ELLE NE CHIFFRE PAS.** Tout ce qu'elle rend repasse par
 * `panneauxDesAnnotations` (`planDirectionnel.ts`) : une cote dont largeur ×
 * hauteur ne redonne pas la surface imprimée est écartée, et une page dont la
 * somme des panneaux ne redonne pas la « Surface totale » du cartouche est
 * signalée à vérifier. Un sort non recopié vaut « existant » : non chiffré.
 */

import { appelerGemini, texteGemini } from './modelesIA';
import type { AnnotationLue } from './planDirectionnel';

const CONSIGNE = `Chaque image est une page « Plan avec détails » d'un logiciel de signalisation directionnelle (Kadri).
Sur le dessin, chaque PANNEAU est accompagné d'un bloc de texte de trois lignes, écrit en petit à côté de lui :
  1. le SORT : « Existant Pose Depose », « Pose », « Existant », « Existant Depose » ou « A Supprimer » ;
  2. la COTE : code, largeur x hauteur = surface, par exemple « D21 2200x250=0.550m² » ;
  3. le FOND : par exemple « Blanc 3290 ».
Rends UNIQUEMENT un tableau JSON, un élément par image, dans l'ordre des images :
[{"panneaux": [{"sort": "...", "cote": "...", "fond": "..."}]}]

Règles :
- Recopie chaque bloc EXACTEMENT tel qu'il est écrit, caractère par caractère. N'invente, ne complète et ne corrige rien.
- Un bloc par panneau, tous les panneaux de la page, existants compris.
- Le sort est la ligne juste AU-DESSUS de la cote ; s'il n'y en a pas, mets "".
- Ignore le texte peint SUR les panneaux (noms de lieux, pictogrammes), les lignes « L4 100 106% (1738) »,
  les cotes de hauteur (2590, 2300…) et les mots écrits près du mât.
- Une page sans panneau lisible : {"panneaux": []}.`;

/** Pages par appel : assez pour amortir l'appel, assez peu pour garder l'image lisible. */
const PAGES_PAR_APPEL = 3;
/**
 * ⚠️ **LE QUOTA DE GEMINI SE COMPTE À LA MINUTE.** Quatre appels simultanés de
 * trois pages en image épuisaient le quota au bout de 45 pages : les 16
 * dernières pages du carnet NMP850 rendaient « 429 quota dépassé » et
 * restaient « sans panneau », alors qu'elles étaient parfaitement lisibles.
 * Deux appels à la fois, et un lot refusé pour quota attend puis recommence.
 */
const APPELS_SIMULTANES = 2;
const ESSAIS_QUOTA = 5;
const ATTENTE_QUOTA_MS = 20_000;

const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
const estQuota = (e: unknown) => /\b(429|503)\b|quota|RESOURCE_EXHAUSTED|high demand/i.test((e as Error)?.message || '');

/** Certaines pages d'un PDF rendues en JPEG (base64, sans en-tête data:). */
async function pagesEnJpeg(buffer: ArrayBuffer, pages: number[], echelle = 2.5): Promise<Map<number, string>> {
  /* Import différé : pdf.js ne se charge pas sous les tests. */
  const pdfjsLib = await import('pdfjs-dist');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const out = new Map<number, string>();
  for (const n of pages) {
    if (n < 1 || n > pdf.numPages) continue;
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: echelle });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    out.set(n, canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
  }
  return out;
}

/** La réponse de Gemini : une liste d'annotations par image, dans l'ordre. */
export function lireReponsePlanImage(texte: string): AnnotationLue[][] {
  const json = texte.match(/\[[\s\S]*\]/);
  if (!json) return [];
  let brut: unknown;
  try { brut = JSON.parse(json[0]); } catch { return []; }
  if (!Array.isArray(brut)) return [];
  return brut.map((o: { panneaux?: unknown }) => (Array.isArray(o?.panneaux) ? o.panneaux : [])
    .map((a: Record<string, unknown>) => ({
      sort: String(a?.sort ?? ''),
      cote: String(a?.cote ?? ''),
      fond: String(a?.fond ?? ''),
    })));
}

async function lireLot(images: string[]): Promise<AnnotationLue[][]> {
  const rep = await appelerGemini({
    contents: [{ parts: [
      { text: CONSIGNE },
      ...images.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } })),
    ] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4000 },
  });
  return lireReponsePlanImage(texteGemini(rep));
}

/**
 * Les annotations lues sur le dessin de chaque page demandée. Une page dont
 * la lecture échoue est absente du résultat : elle reste « sans panneau ».
 */
export async function lireAnnotationsDesPages(
  buffer: ArrayBuffer,
  pages: number[],
  progression?: (faites: number, total: number, attente?: number) => void,
): Promise<Map<number, AnnotationLue[]>> {
  const images = await pagesEnJpeg(buffer, pages);
  const ordre = pages.filter(p => images.has(p));
  const lots: number[][] = [];
  for (let i = 0; i < ordre.length; i += PAGES_PAR_APPEL) lots.push(ordre.slice(i, i + PAGES_PAR_APPEL));

  const out = new Map<number, AnnotationLue[]>();
  let faites = 0;
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < lots.length) {
      const lot = lots[suivant++];
      for (let essai = 1; essai <= ESSAIS_QUOTA; essai++) {
        try {
          const lus = await lireLot(lot.map(p => images.get(p)!));
          /* Une réponse qui n'a pas une entrée par image ne dit pas laquelle
             manque : on n'attribue rien plutôt que d'attribuer de travers. */
          if (lus.length === lot.length) lot.forEach((p, k) => out.set(p, lus[k]));
          else console.warn('[plan image] réponse incomplète pour les pages', lot.join(', '));
          break;
        } catch (e) {
          if (!estQuota(e) || essai === ESSAIS_QUOTA) {
            console.warn('[plan image]', lot.join(', '), (e as Error).message);
            break;
          }
          const ms = ATTENTE_QUOTA_MS * essai;
          progression?.(faites, ordre.length, Math.round(ms / 1000));
          await attendre(ms);
        }
      }
      faites += lot.length;
      progression?.(faites, ordre.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(APPELS_SIMULTANES, lots.length) }, ouvrier));
  return out;
}
