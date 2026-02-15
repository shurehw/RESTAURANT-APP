import * as fs from 'fs';

// Our UOMs
const lines = fs.readFileSync('R365_VENDOR_ITEMS_READY.csv', 'utf-8').split('\n').slice(1).filter(l => l.trim());
const uoms = new Map<string, number>();
lines.forEach(l => {
  const m = l.match(/^"[^"]*","[^"]*","[^"]*","([^"]*)"/);
  if (m) uoms.set(m[1], (uoms.get(m[1]) || 0) + 1);
});
console.log('Our UOMs:');
Array.from(uoms.entries()).sort((a, b) => b[1] - a[1]).forEach(([u, c]) => console.log(`  ${u}: ${c}`));

// R365 UOMs from export
console.log('\nR365 UOMs from export:');
const r365lines = fs.readFileSync('G:/My Drive/Downloads/export_2_12_2026.csv', 'utf-8').split('\n').slice(1).filter(l => l.trim());
const r365uoms = new Map<string, number>();
r365lines.forEach(l => {
  let inQuote = false, colIdx = 0, current = '';
  for (const ch of l) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) {
      if (colIdx === 3) break;
      colIdx++; current = ''; continue;
    }
    current += ch;
  }
  if (colIdx === 3 && current.trim()) r365uoms.set(current.trim(), (r365uoms.get(current.trim()) || 0) + 1);
});
Array.from(r365uoms.entries()).sort((a, b) => b[1] - a[1]).forEach(([u, c]) => console.log(`  ${u}: ${c}`));
