import * as fs from 'fs';

// Parse R365 export to get unique vendors already in system
const raw = fs.readFileSync('G:/My Drive/Downloads/export_2_12_2026.csv', 'utf-8');
const lines = raw.split('\n').slice(1).filter(l => l.trim());
const r365Vendors = new Set<string>();

for (const l of lines) {
  let inQuote = false;
  let colIdx = 0;
  let current = '';
  for (const ch of l) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) {
      if (colIdx === 2) break;
      colIdx++;
      current = '';
      continue;
    }
    current += ch;
  }
  if (colIdx === 2 && current.trim()) r365Vendors.add(current.trim());
}

console.log(`Vendors already in R365 (${r365Vendors.size}):`);
Array.from(r365Vendors).sort().forEach(v => console.log(`  ${v}`));

// Compare with our 35 vendors
console.log('\n---\n');
const ourLines = fs.readFileSync('R365_VENDORS.csv', 'utf-8').split('\n').slice(1).filter(l => l.trim());
const ourVendors: { name: string; count: number }[] = [];
ourLines.forEach(l => {
  const m = l.match(/^"([^"]*)",(\d+)/);
  if (m) ourVendors.push({ name: m[1], count: parseInt(m[2]) });
});

const alreadyIn: string[] = [];
const missing: { name: string; count: number }[] = [];

ourVendors.forEach(v => {
  const vLower = v.name.toLowerCase();
  let found = false;
  for (const rv of r365Vendors) {
    const rvLower = rv.toLowerCase();
    if (rvLower === vLower || rvLower.includes(vLower) || vLower.includes(rvLower)) {
      alreadyIn.push(`${v.name} (${v.count} items) → ${rv}`);
      found = true;
      break;
    }
  }
  if (!found) missing.push(v);
});

console.log(`Already in R365 (${alreadyIn.length}):`);
alreadyIn.forEach(v => console.log(`  ✅ ${v}`));

console.log(`\nNEED TO CREATE in R365 (${missing.length}):`);
missing.forEach(v => console.log(`  ❌ ${v.name} (${v.count} items)`));

const missingTotal = missing.reduce((s, v) => s + v.count, 0);
console.log(`\n  Total items blocked: ${missingTotal}`);
