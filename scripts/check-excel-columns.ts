import * as XLSX from 'xlsx';

const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('Excel columns:', Object.keys(data[0] as any));
console.log('\nFirst row sample:');
console.log(JSON.stringify(data[0], null, 2));
