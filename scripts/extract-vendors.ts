import * as fs from 'fs';

const lines = fs.readFileSync('R365_VENDOR_ITEMS_READY.csv', 'utf-8').split('\n').slice(1).filter(l => l.trim());
const vendors = new Map<string, number>();

lines.forEach(l => {
  const m = l.match(/^"[^"]*","([^"]*)"/);
  if (m && m[1]) vendors.set(m[1], (vendors.get(m[1]) || 0) + 1);
});

const rows = ['Vendor Name,Item Count'];
Array.from(vendors.entries()).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
  rows.push(`"${name}",${count}`);
});

fs.writeFileSync('R365_VENDORS.csv', rows.join('\n'));
console.log(`Unique vendors: ${vendors.size}\n`);
Array.from(vendors.entries()).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
  console.log(`  ${name}: ${count} items`);
});
