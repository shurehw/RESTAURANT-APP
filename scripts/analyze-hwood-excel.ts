import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const excelPath = 'C:\\Users\\JacobShure\\Downloads\\Food Items h.wood.xlsx';

console.log('Reading Excel file:', excelPath);

// Read the workbook
const workbook = XLSX.readFile(excelPath);

console.log('\n=== WORKBOOK INFO ===');
console.log('Sheet Names:', workbook.SheetNames);

// Analyze each sheet
workbook.SheetNames.forEach(sheetName => {
  console.log('\n=== SHEET:', sheetName, '===');
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON to see the data
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  console.log('Total rows:', data.length);

  if (data.length > 0) {
    console.log('\nColumns:', Object.keys(data[0]));
    console.log('\nFirst 5 rows:');
    console.log(JSON.stringify(data.slice(0, 5), null, 2));

    // Show column analysis
    console.log('\n=== COLUMN ANALYSIS ===');
    const columns = Object.keys(data[0]);
    columns.forEach(col => {
      const filledCount = data.filter(row => row[col] && row[col] !== '').length;
      const emptyCount = data.length - filledCount;
      const sampleValues = data
        .filter(row => row[col] && row[col] !== '')
        .slice(0, 3)
        .map(row => row[col]);

      console.log(`\n${col}:`);
      console.log(`  Filled: ${filledCount} | Empty: ${emptyCount}`);
      if (sampleValues.length > 0) {
        console.log(`  Sample values:`, sampleValues);
      }
    });
  }
});
