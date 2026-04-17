/**
 * Extraction de texte depuis un fichier Excel (.xlsx / .xls / .csv / .ods)
 * Utilise SheetJS (xlsx) qui tourne entièrement dans le navigateur.
 */
import * as XLSX from 'xlsx';

export interface ExcelContent {
  /** Texte tabulaire extrait de toutes les feuilles, prêt à envoyer à l'IA */
  texte: string;
  /** Nom des feuilles trouvées */
  feuilles: string[];
}

/** Formate une valeur de cellule en chaîne lisible */
function cellToStr(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toLocaleDateString('fr-FR');
  const s = String(cell).trim();
  // Supprimer les retours à la ligne internes aux cellules
  return s.replace(/[\r\n]+/g, ' ');
}

/**
 * Parse un fichier Excel et retourne le texte de toutes les feuilles.
 * - Utilise Uint8Array (requis par SheetJS type:'array')
 * - Supprime les cellules vides en fin de ligne
 * - Limite à 200 lignes / feuille pour rester sous la limite TPM Groq
 */
export async function parseExcel(file: File): Promise<ExcelContent> {
  const buffer = await file.arrayBuffer();
  // SheetJS type:'array' attend un Uint8Array, pas un ArrayBuffer brut
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

  const feuilles = wb.SheetNames;
  const blocs: string[] = [];

  for (const nom of feuilles) {
    const ws = wb.Sheets[nom];
    if (!ws) continue;

    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];

    const lignes = data
      // ignorer les lignes entièrement vides
      .filter(row => row.some(cell => cellToStr(cell) !== ''))
      .slice(0, 200)
      .map(row => {
        const cells = row.map(cellToStr);
        // Supprimer les colonnes vides en fin de ligne
        let last = cells.length - 1;
        while (last >= 0 && cells[last] === '') last--;
        return cells.slice(0, last + 1).join(' | ');
      })
      // Ignorer les lignes qui ne contiennent plus rien après nettoyage
      .filter(l => l.trim() !== '');

    if (lignes.length > 0) {
      blocs.push(`=== Feuille : ${nom} ===\n${lignes.join('\n')}`);
    }
  }

  return {
    texte: blocs.join('\n\n'),
    feuilles,
  };
}
