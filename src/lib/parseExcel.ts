/**
 * Extraction de texte depuis un fichier Excel (.xlsx / .xls / .csv)
 * Utilise SheetJS (xlsx) qui tourne entièrement dans le navigateur.
 */
import * as XLSX from 'xlsx';

export interface ExcelContent {
  /** Texte tabulaire extrait de toutes les feuilles, prêt à envoyer à l'IA */
  texte: string;
  /** Nom des feuilles trouvées */
  feuilles: string[];
}

/**
 * Convertit une feuille Excel en texte tabulaire lisible par l'IA.
 * Chaque ligne = valeurs séparées par " | ", lignes vides ignorées.
 */
function feuilleEnTexte(ws: XLSX.WorkSheet, nomFeuille: string): string {
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
  const lignesNonVides = (data as string[][])
    .filter(row => row.some(cell => String(cell ?? '').trim() !== ''))
    .map(row => row.map(cell => String(cell ?? '').trim()).join(' | '));
  if (lignesNonVides.length === 0) return '';
  return `=== Feuille : ${nomFeuille} ===\n${lignesNonVides.join('\n')}`;
}

/**
 * Parse un fichier Excel et retourne le texte de toutes les feuilles.
 * Limite à 200 lignes par feuille pour rester dans les limites TPM de Groq.
 */
export async function parseExcel(file: File): Promise<ExcelContent> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const feuilles = wb.SheetNames;
  const blocs: string[] = [];

  for (const nom of feuilles) {
    const ws = wb.Sheets[nom];
    if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
    const lignesNonVides = (data as string[][])
      .filter(row => row.some(cell => String(cell ?? '').trim() !== ''))
      .slice(0, 200) // max 200 lignes par feuille
      .map(row => row.map(cell => {
        const v = cell instanceof Date
          ? cell.toLocaleDateString('fr-FR')
          : String(cell ?? '').trim();
        return v;
      }).join(' | '));
    if (lignesNonVides.length > 0) {
      blocs.push(`=== Feuille : ${nom} ===\n${lignesNonVides.join('\n')}`);
    }
  }

  return {
    texte: blocs.join('\n\n'),
    feuilles,
  };
}
