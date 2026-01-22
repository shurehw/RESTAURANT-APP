import * as fs from 'fs';
import * as XLSX from 'xlsx';

const csvPath = 'C:\\Users\\JacobShure\\Downloads\\PurchaseItems_20260121.csv';
const outputPath = 'C:\\Users\\JacobShure\\Downloads\\Food Items h.wood READY.xlsx';

console.log('Reading CSV file:', csvPath);

const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n').filter(line => line.trim());

// Parse CSV manually to handle commas in quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

const headers = parseCSVLine(lines[0]).map(h => h.replace(/\uFEFF/g, '').trim());
console.log('CSV Headers:', headers);
console.log(`Total rows: ${lines.length - 1}`);

// Parse all rows
const csvData: any[] = [];
for (let i = 1; i < lines.length; i++) {
  const values = parseCSVLine(lines[i]);
  const row: any = {};
  headers.forEach((header, idx) => {
    row[header] = values[idx] || '';
  });
  csvData.push(row);
}

console.log(`\nParsed ${csvData.length} items`);

// Helper: Extract pack size from name or infer from UOM
function extractPackSize(name: string, reportingUOM: string): string {
  // Try to extract pack size from item name
  // Examples: "6 x 750ml", "750ml", "1kg", etc.

  const packMatch = name.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)(ml|l|oz|lb|kg|g|gal|qt)/i);
  if (packMatch) {
    return `${packMatch[1]} x ${packMatch[2]}${packMatch[3].toLowerCase()}`;
  }

  const singleMatch = name.match(/(\d+\.?\d*)(ml|l|oz|lb|kg|g|gal|qt)/i);
  if (singleMatch) {
    return `${singleMatch[1]}${singleMatch[2].toLowerCase()}`;
  }

  // Fallback to reporting UOM
  if (reportingUOM && reportingUOM !== 'Each') {
    return reportingUOM;
  }

  return '1each';
}

// Helper: Map Category 2 to main category if it's more specific
function getCategoryAndSubcategory(cat1: string, cat2: string, costAccount: string): { category1: string; subcategory: string } {
  // If we have a Category 2, use it as subcategory
  if (cat2 && cat2.trim()) {
    // Determine if it's FOOD or BEV based on subcategory
    const subcat = cat2.trim().toUpperCase();

    if (['BEER', 'WINE', 'LIQUOR', 'SPIRITS', 'LIQUEUR'].includes(subcat)) {
      return { category1: 'BEV', subcategory: subcat };
    }

    return { category1: 'FOOD', subcategory: subcat };
  }

  // Fallback to cost account analysis
  const costLower = costAccount.toLowerCase();

  if (costLower.includes('beer')) {
    return { category1: 'BEV', subcategory: 'BEER' };
  }
  if (costLower.includes('wine')) {
    return { category1: 'BEV', subcategory: 'WINE' };
  }
  if (costLower.includes('liquor') || costLower.includes('spirit')) {
    return { category1: 'BEV', subcategory: 'LIQUOR' };
  }
  if (costLower.includes('meat')) {
    return { category1: 'FOOD', subcategory: 'MEAT' };
  }
  if (costLower.includes('seafood')) {
    return { category1: 'FOOD', subcategory: 'SEAFOOD' };
  }
  if (costLower.includes('produce')) {
    return { category1: 'FOOD', subcategory: 'PRODUCE' };
  }
  if (costLower.includes('dairy')) {
    return { category1: 'FOOD', subcategory: 'DAIRY' };
  }
  if (costLower.includes('grocery')) {
    return { category1: 'FOOD', subcategory: 'GROCERY' };
  }
  if (costLower.includes('bakery')) {
    return { category1: 'FOOD', subcategory: 'BAKERY' };
  }

  // Default to FOOD with no specific subcategory
  return { category1: 'FOOD', subcategory: '' };
}

// Convert CSV data to h.wood Excel format
const excelData = csvData.map(row => {
  const name = row['Name'] || '';
  const sku = row['Number'] || '';
  const reportingUOM = row['Reporting UofM'] || 'Each';
  const inventoryUOM = row['Inventory UofM'] || reportingUOM;
  const costAccount = row['Cost Account'] || '';
  const inventoryAccount = row['Inventory Account'] || '';
  const cat1 = row['Category 1'] || '';
  const cat2 = row['Category 2'] || '';
  const costUpdateMethod = row['Cost Update Method'] || 'LastReceipt';
  const keyItem = row['Key Item'] || 'False';

  const packSize = extractPackSize(name, reportingUOM);
  const categories = getCategoryAndSubcategory(cat1, cat2, costAccount);

  return {
    'ITEM': name,
    'SKU': sku,
    'PACK_SIZE': packSize,
    'Item_Category_1': categories.category1,
    'SUBCATEGORY': categories.subcategory,
    'Measure_Type': 'Purchase',
    'Reporting_U_of_M': reportingUOM,
    'Cost_Account': costAccount,
    'Inventory_Account': inventoryAccount,
    'Inventory_U_of_M': inventoryUOM,
    'Cost_Update_Method': costUpdateMethod,
    'Key_Item': keyItem
  };
});

// Create Excel workbook
const worksheet = XLSX.utils.json_to_sheet(excelData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

// Write to file
XLSX.writeFile(workbook, outputPath);

console.log('\n✓ Excel file created successfully!');
console.log('Output file:', outputPath);

// Show summary
console.log('\n=== SUMMARY ===');
const category1Counts: any = {};
const category2Counts: any = {};
const uofmCounts: any = {};

excelData.forEach(row => {
  const cat1 = row['Item_Category_1'];
  const cat2 = row['SUBCATEGORY'];
  const uofm = row['Reporting_U_of_M'];

  category1Counts[cat1] = (category1Counts[cat1] || 0) + 1;
  if (cat2) category2Counts[cat2] = (category2Counts[cat2] || 0) + 1;
  uofmCounts[uofm] = (uofmCounts[uofm] || 0) + 1;
});

console.log('\nCategory 1 (Main):');
Object.entries(category1Counts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

console.log('\nCategory 2 (Subcategory):');
Object.entries(category2Counts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

console.log('\nTop 10 Units of Measure:');
Object.entries(uofmCounts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .slice(0, 10)
  .forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

console.log(`\nTotal items: ${excelData.length}`);
