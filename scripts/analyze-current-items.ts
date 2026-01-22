import * as fs from 'fs';
import * as path from 'path';

const csvPath = 'C:\\Users\\JacobShure\\Downloads\\PurchaseItems_20260121.csv';

console.log('Reading current items CSV:', csvPath);

const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

console.log('\n=== CSV INFO ===');
console.log('Total lines:', lines.length);

// Parse headers
const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
console.log('\nColumns:', headers);
console.log('Column count:', headers.length);

// Parse first few rows
console.log('\n=== FIRST 5 ROWS ===');
for (let i = 1; i < Math.min(6, lines.length); i++) {
  if (!lines[i].trim()) continue;

  const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
  const row: any = {};
  headers.forEach((header, idx) => {
    row[header] = values[idx] || '';
  });
  console.log(`\nRow ${i}:`, JSON.stringify(row, null, 2));
}

// Analyze column filling patterns
console.log('\n=== COLUMN FILLING ANALYSIS ===');
const columnStats: any = {};
headers.forEach(header => {
  columnStats[header] = {
    filled: 0,
    empty: 0,
    samples: []
  };
});

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;

  const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
  headers.forEach((header, idx) => {
    const value = values[idx] || '';
    if (value) {
      columnStats[header].filled++;
      if (columnStats[header].samples.length < 5) {
        columnStats[header].samples.push(value);
      }
    } else {
      columnStats[header].empty++;
    }
  });
}

headers.forEach(header => {
  const stats = columnStats[header];
  console.log(`\n${header}:`);
  console.log(`  Filled: ${stats.filled} | Empty: ${stats.empty}`);
  if (stats.samples.length > 0) {
    console.log(`  Samples:`, stats.samples);
  }
});

// Analyze subcategory patterns
console.log('\n=== SUBCATEGORY PATTERNS ===');
const subcategoryMap: any = {};
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;

  const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
  const row: any = {};
  headers.forEach((header, idx) => {
    row[header] = values[idx] || '';
  });

  const category = row['item_category'] || row['category'];
  const subcategory = row['subcategory'] || row['item_subcategory'];

  if (category && subcategory) {
    if (!subcategoryMap[category]) {
      subcategoryMap[category] = new Set();
    }
    subcategoryMap[category].add(subcategory);
  }
}

Object.keys(subcategoryMap).forEach(category => {
  console.log(`\n${category}:`);
  console.log('  Subcategories:', Array.from(subcategoryMap[category]).slice(0, 10));
});
