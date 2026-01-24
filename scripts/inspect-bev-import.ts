import * as XLSX from 'xlsx';

const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';

console.log('Reading beverage import file:', excelPath);

const workbook = XLSX.readFile(excelPath);

console.log('\nSheets in workbook:', workbook.SheetNames);

// Read first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(`\nSheet: ${sheetName}`);
console.log(`Total rows: ${data.length}`);

// Show first 3 rows to understand structure
console.log('\nFirst 3 rows:');
data.slice(0, 3).forEach((row: any, idx: number) => {
  console.log(`\nRow ${idx + 1}:`);
  console.log(JSON.stringify(row, null, 2));
});

// Show column headers
if (data.length > 0) {
  console.log('\nColumn headers:');
  Object.keys(data[0] as object).forEach((key, idx) => {
    console.log(`  ${idx + 1}. ${key}`);
  });
}

// Check if there are multiple sheets
if (workbook.SheetNames.length > 1) {
  console.log('\nOther sheets:');
  workbook.SheetNames.slice(1).forEach((name: string, idx: number) => {
    const sheet = workbook.Sheets[name];
    const sheetData = XLSX.utils.sheet_to_json(sheet);
    console.log(`  ${idx + 1}. ${name} (${sheetData.length} rows)`);
  });
}
