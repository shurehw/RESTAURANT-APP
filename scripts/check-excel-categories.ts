import * as XLSX from 'xlsx';

const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

// Normalize column names
const normalized = jsonData.map((row: any) => {
  const normalizedRow: any = {};
  for (const key in row) {
    const cleanKey = key.trim().replace(/\s+/g, '_');
    normalizedRow[cleanKey] = row[key];
  }
  return normalizedRow;
});

console.log('\n=== Sample Row ===');
console.log(normalized[0]);

console.log('\n=== All Column Names ===');
console.log(Object.keys(normalized[0]));

// Check what values are in "Item Category 1"
const categoryMap = new Map<string, number>();
for (const row of normalized) {
  const cat = row.Item_Category_1 || 'null';
  categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
}

console.log('\n=== Excel "Item Category 1" Distribution ===');
const sortedCats = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sortedCats) {
  console.log(`  ${cat}: ${count}`);
}
