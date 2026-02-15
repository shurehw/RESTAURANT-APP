/**
 * Check purchase log Excel files for ALL columns — find vendor name data
 */
import * as XLSX from 'xlsx';

const files = [
  'G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx',
  'G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx'
];

for (const file of files) {
  console.log(`\n═══ ${file.split('/').pop()} ═══\n`);
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  // Show header rows (may be in first few rows)
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    console.log(`Row ${i}: ${JSON.stringify(rows[i])}`);
  }
  console.log(`\nTotal rows: ${rows.length}`);
  console.log(`Columns per row: ${rows[6]?.length}`);

  // Show unique values in each column for a sample
  const sampleRows = rows.slice(6, 20);
  for (let col = 0; col < (rows[6]?.length || 0); col++) {
    const vals = sampleRows.map(r => r[col]).filter(v => v !== undefined && v !== null);
    console.log(`  Col ${col}: ${JSON.stringify(vals.slice(0, 3))}`);
  }
}
