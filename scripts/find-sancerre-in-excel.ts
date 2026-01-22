import * as XLSX from 'xlsx';

const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('\n=== Searching for Sancerre ===\n');

const matches = (data as any[]).filter((row: any) => {
  const sku = String(row['SKU      '] || '').trim();
  const name = String(row['NAME'] || '').toLowerCase();

  return sku === 'DEZAT-SANC-23' || name.includes('sancerre') || name.includes('dezat');
});

if (matches.length === 0) {
  console.log('❌ No matches found in R365 Excel');
  console.log('\nThis item was likely created manually, not imported from R365.');
} else {
  console.log(`Found ${matches.length} match(es):\n`);

  matches.forEach((row: any, idx: number) => {
    console.log(`${idx + 1}. ${row['NAME']}`);
    console.log(`   SKU: ${row['SKU      ']}`);
    console.log(`   Pack Size: ${row['PACK SIZE      ']}`);
    console.log(`   Category: ${row['Item Category 1']}`);
    console.log(`   Subcategory: ${row['SUBCATEGORY      ']}`);
    console.log('');
  });
}
