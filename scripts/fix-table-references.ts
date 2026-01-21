import * as fs from 'fs';
import * as path from 'path';

const files = [
  'components/products/ProductsTable.tsx',
  'components/products/EditProductModal.tsx',
  'app/api/items/[id]/route.ts',
  'app/api/items/bulk-import/route.ts',
  'app/(dashboard)/products/items/page.tsx',
  'components/items/ItemsTable.tsx',
  'app/api/items/learn-pack-config/route.ts',
];

for (const file of files) {
  const filePath = path.join(process.cwd(), file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace table name
  const beforeTable = content;
  content = content.replace(/item_pack_configs/g, 'item_pack_configurations');

  // Replace vendor_sku with vendor_item_code
  const beforeVendor = content;
  content = content.replace(/vendor_sku/g, 'vendor_item_code');

  if (content !== beforeTable || content !== beforeVendor) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Updated ${file}`);
  } else {
    console.log(`✓  No changes needed for ${file}`);
  }
}

console.log('\n✅ All files updated!');
