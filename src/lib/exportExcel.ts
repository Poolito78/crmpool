import * as XLSX from 'xlsx';

export function exportToExcel(data: Record<string, any>[], fileName: string, sheetName = 'Export') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

export function exportMultiSheet(sheets: { name: string; data: Record<string, any>[] }[], fileName: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  }
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
