import * as XLSX from 'xlsx';

const excelPath = 'C:\\Users\\JacobShure\\Downloads\\Food Items h.wood.xlsx';
const outputPath = 'C:\\Users\\JacobShure\\Downloads\\Food Items h.wood.xlsx'; // Overwrite

console.log('Reading Excel file:', excelPath);

const workbook = XLSX.readFile(excelPath);
const worksheet = workbook.Sheets['Sheet1'];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(`Processing ${data.length} items...`);

// Helper: Extract UofM from pack size
function extractUofM(packSize: string): string {
  if (!packSize) return 'Each';

  const lower = packSize.toLowerCase();

  // Weight patterns
  if (lower.includes('lb')) return 'LB';
  if (lower.includes('kg')) return 'KG';
  if (lower.includes('oz') && !lower.includes('fl')) return 'OZ';
  if (lower.includes('g') && !lower.includes('kg')) return 'G';

  // Volume patterns
  if (lower.includes('gal')) return 'GAL';
  if (lower.includes('ltr') || lower.includes('liter') || lower.includes('litre')) return 'LTR';
  if (lower.includes('ml')) return 'ML';
  if (lower.includes('fl oz')) return 'FL OZ';
  if (lower.includes('qt')) return 'QT';

  // Count patterns
  if (lower.includes('case')) return 'Case';
  if (lower.includes('bag')) return 'Bag';
  if (lower.includes('box')) return 'Box';
  if (lower.includes('bunch')) return 'Bunch';
  if (lower.includes('each') || lower.match(/^\d+$/)) return 'Each';

  return 'Each';
}

// Helper: Map GL category to Cost/Inventory accounts
function mapGLCategory(glCode: string): { costAccount: string; inventoryAccount: string; category1: string; category2: string } {
  if (!glCode) return { costAccount: '', inventoryAccount: '', category1: '', category2: '' };

  const lower = glCode.toLowerCase();

  if (lower.includes('meat')) {
    return {
      costAccount: 'Meat Cost',
      inventoryAccount: 'Meat Inventory',
      category1: 'FOOD',
      category2: 'MEAT'
    };
  }
  if (lower.includes('seafood') || lower.includes('fish')) {
    return {
      costAccount: 'Seafood Cost',
      inventoryAccount: 'Seafood Inventory',
      category1: 'FOOD',
      category2: 'SEAFOOD'
    };
  }
  if (lower.includes('produce')) {
    return {
      costAccount: 'Produce Cost',
      inventoryAccount: 'Produce Inventory',
      category1: 'FOOD',
      category2: 'PRODUCE'
    };
  }
  if (lower.includes('dairy')) {
    return {
      costAccount: 'Dairy Cost',
      inventoryAccount: 'Dairy Inventory',
      category1: 'FOOD',
      category2: 'DAIRY'
    };
  }
  if (lower.includes('grocery') || lower.includes('dry goods')) {
    return {
      costAccount: 'Grocery Cost',
      inventoryAccount: 'Grocery Inventory',
      category1: 'FOOD',
      category2: 'GROCERY'
    };
  }
  if (lower.includes('bakery') || lower.includes('bread')) {
    return {
      costAccount: 'Bakery Cost',
      inventoryAccount: 'Bakery Inventory',
      category1: 'FOOD',
      category2: 'BAKERY'
    };
  }
  if (lower.includes('beer')) {
    return {
      costAccount: 'Beer Cost',
      inventoryAccount: 'Beer Inventory',
      category1: 'BEV',
      category2: 'BEER'
    };
  }
  if (lower.includes('wine')) {
    return {
      costAccount: 'Wine Cost',
      inventoryAccount: 'Wine Inventory',
      category1: 'BEV',
      category2: 'WINE'
    };
  }
  if (lower.includes('liquor') || lower.includes('spirits')) {
    return {
      costAccount: 'Liquor Cost',
      inventoryAccount: 'Liquor Inventory',
      category1: 'BEV',
      category2: 'LIQUOR'
    };
  }

  // Default to Food
  return {
    costAccount: 'Food Cost',
    inventoryAccount: 'Food Inventory',
    category1: 'FOOD',
    category2: ''  // No subcategory for generic food
  };
}

// Process each row
const filledData = data.map((row: any) => {
  const itemName = row['ITEM      ']?.trim() || '';
  const sku = row['SKU      ']?.trim() || '';
  const packSize = row['PACK SIZE      ']?.trim() || '';
  const glCategory = row['CATEGORY      ']?.trim() || '';

  const uofm = extractUofM(packSize);
  const accounts = mapGLCategory(glCategory);

  return {
    'ITEM': itemName,
    'SKU': sku,
    'PACK_SIZE': packSize,
    'Item_Category_1': accounts.category1,  // FOOD or BEV
    'SUBCATEGORY': accounts.category2, // MEAT, SEAFOOD, etc (only when different from category1)
    'Measure_Type': 'Purchase',
    'Reporting_U_of_M': uofm,
    'Cost_Account': accounts.costAccount,
    'Inventory_Account': accounts.inventoryAccount,
    'Inventory_U_of_M': uofm,
    'Cost_Update_Method': 'LastReceipt',
    'Key_Item': 'False'
  };
});

// Create new worksheet
const newWorksheet = XLSX.utils.json_to_sheet(filledData);
const newWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Sheet1');

// Write to file
XLSX.writeFile(newWorkbook, outputPath);

console.log('\n✓ Excel file filled successfully!');
console.log('File updated:', outputPath);

// Show summary
console.log('\n=== SUMMARY ===');
const category1Counts: any = {};
const category2Counts: any = {};
const uofmCounts: any = {};
const accountCounts: any = {};

filledData.forEach(row => {
  const cat1 = row['Item_Category_1'];
  const cat2 = row['SUBCATEGORY'];
  const uofm = row['Reporting_U_of_M'];
  const account = row['Cost_Account'];

  if (cat1) category1Counts[cat1] = (category1Counts[cat1] || 0) + 1;
  if (cat2) category2Counts[cat2] = (category2Counts[cat2] || 0) + 1;
  if (uofm) uofmCounts[uofm] = (uofmCounts[uofm] || 0) + 1;
  if (account) accountCounts[account] = (accountCounts[account] || 0) + 1;
});

console.log('\nCategory 1 (Main):');
Object.entries(category1Counts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

console.log('\nCategory 2 (Subcategory - only when different):');
Object.entries(category2Counts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

console.log('\nTop Units of Measure:');
Object.entries(uofmCounts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .slice(0, 15)
  .forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

console.log('\nCost Accounts:');
Object.entries(accountCounts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

console.log(`\nTotal items: ${filledData.length}`);
console.log('\n✓ Ready for import! Columns match beverage import format.');
