/**
 * Lecture des BONS POUR EXÉCUTION (BPE) d'Odoo qui accompagnent un plan Kadri.
 *
 * Un BPE est une page IMAGE : « Gamme : Tasman — Fabrication : PAL — Taille
 * panneau : L 2200 x H 2100 — Film : Classe 2 — Laquage : Brut ». Aucun texte
 * à extraire (AF038821 : deux pages, « CAR FERRIES » et « PARC DES GARES »,
 * sans un seul caractère dans le PDF) : la page est rendue en image et lue par
 * Gemini, qui ne rend QUE ce qui est écrit. Une cote illisible reste absente —
 * le panneau n'est alors pas chiffré, jamais deviné.
 *
 * Les panneaux Tasman / PAL ainsi lus forment un ensemble « BPE » du plan :
 * mêmes références D3 et même prix au m² que les panneaux du plan. Sans
 * support lu, ils n'ont ni IPN ni brides (`sansSupport`).
 */

import { appelerGemini, texteGemini } from './modelesIA';
import type { EnsemblePlan } from './planDirectionnel';

export interface BonPourExecution {
  page: number;
  gamme: string;
  fabrication: string;
  largeur: number;
  hauteur: number;
  classe: number | null;
  laquage?: string;
  quantite: number;
}

const CONSIGNE = `Tu lis des pages « Bon pour exécution » d'un fabricant de panneaux de signalisation.
Une image = une page, dans l'ordre. Rends UNIQUEMENT un tableau JSON, un objet par image :
{"gamme": "...", "fabrication": "...", "largeur": 0, "hauteur": 0, "classe": 0, "laquage": "...", "quantite": 0}

Règles :
- « gamme » et « fabrication » : recopie les champs « Gamme » et « Fabrication » du cartouche de gauche.
- « largeur » et « hauteur » : ceux de « Taille panneau : L … x H … » (en mm), PAS ceux de « Taille décor ».
- « classe » : le chiffre de « Film : Classe N ».
- « quantite » : le nombre de « Qté » en bas de page ; 1 si absent.
- « laquage » : champ « Laquage ».
- Omets une clé plutôt que d'inventer sa valeur.`;

/** Les pages d'un PDF rendues en PNG (base64, sans en-tête data:). */
export async function pagesEnImages(buffer: ArrayBuffer, echelle = 1.5): Promise<string[]> {
  /* Import différé : pdf.js ne se charge pas sous les tests, et ne sert qu'ici. */
  const pdfjsLib = await import('pdfjs-dist');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: echelle });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    out.push(canvas.toDataURL('image/png').split(',')[1]);
  }
  return out;
}

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** La réponse de Gemini en bons lus ; ce qui n'a pas de cotes exploitables est écarté. */
export function lireReponseBpe(texte: string, pageDepart = 1): BonPourExecution[] {
  const json = texte.match(/\[[\s\S]*\]/);
  if (!json) return [];
  let brut: unknown;
  try { brut = JSON.parse(json[0]); } catch { return []; }
  if (!Array.isArray(brut)) return [];
  const out: BonPourExecution[] = [];
  brut.forEach((o: Record<string, unknown>, i) => {
    const largeur = nombre(o?.largeur);
    const hauteur = nombre(o?.hauteur);
    if (!largeur || !hauteur) return;
    out.push({
      page: pageDepart + i,
      gamme: String(o.gamme ?? '').trim(),
      fabrication: String(o.fabrication ?? '').trim(),
      largeur, hauteur,
      classe: nombre(o.classe),
      ...(o.laquage ? { laquage: String(o.laquage).trim() } : {}),
      quantite: Math.round(nombre(o.quantite) ?? 1),
    });
  });
  return out;
}

/** Un panneau Tasman à lames : « Gamme Tasman » ou « Fabrication PAL ». */
export const estTasmanPal = (b: Pick<BonPourExecution, 'gamme' | 'fabrication'>) =>
  /tasman/i.test(b.gamme) || /^\s*PAL\b/i.test(b.fabrication);

/** Fait lire les pages par Gemini. `[]` en cas d'échec : l'analyse continue sans. */
export async function lireBonsPourExecution(images: string[], pageDepart = 1): Promise<BonPourExecution[]> {
  if (!images.length) return [];
  try {
    const rep = await appelerGemini({
      contents: [{ parts: [
        { text: CONSIGNE },
        ...images.map(data => ({ inline_data: { mime_type: 'image/png', data } })),
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 800 },
    });
    return lireReponseBpe(texteGemini(rep), pageDepart);
  } catch (e) {
    console.warn('[bpe]', (e as Error).message);
    return [];
  }
}

/**
 * Les panneaux Tasman des bons, en ensembles du plan — un par classe, pour que
 * la référence D3 et le taux PAL suivent la classe du film. `[]` s'il n'y en a pas.
 */
export function ensemblesBpe(bons: BonPourExecution[], dossier = ''): EnsemblePlan[] {
  const tasman = bons.filter(estTasmanPal);
  const classes = [...new Set(tasman.map(b => b.classe))];
  return classes.map(classe => {
    const panneaux = tasman.filter(b => b.classe === classe).flatMap(b =>
      Array.from({ length: Math.max(1, b.quantite) }, () => ({
        code: 'BPE', largeur: b.largeur, hauteur: b.hauteur,
        surface: Math.round(b.largeur * b.hauteur / 1000) / 1000, sort: 'neuf' as const,
      })));
    return {
      page: tasman.find(b => b.classe === classe)!.page,
      dossier, section: '',
      ensemble: classes.length > 1 ? `BPE${classe ? ` C${classe}` : ''}` : 'BPE',
      produit: `TASMAN${classe ? ` CL${classe}` : ''}`,
      classe, support: '', panneaux, supports: [], embase: false, sansSupport: true,
    };
  });
}
