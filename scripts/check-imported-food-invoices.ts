import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FOLDER_PATH = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food';

async function checkImported() {
  // Get files in folder
  const files = fs.readdirSync(FOLDER_PATH).filter(f =>
    f.toLowerCase().endsWith('.pdf') ||
    f.toLowerCase().endsWith('.jpeg') ||
    f.toLowerCase().endsWith('.jpg') ||
    f.toLowerCase().endsWith('.png')
  );

  console.log('\n📁 MULTIPLE FOOD FOLDER ANALYSIS');
  console.log('═'.repeat(70));
  console.log(`Files found: ${files.length}\n`);

  // Get all invoices from database
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, storage_path, created_at, status')
    .order('created_at', { ascending: false });

  // Extract filenames from storage paths
  const importedFiles = new Set(
    allInvoices
      ?.map(inv => {
        if (!inv.storage_path) return null;
        const filename = inv.storage_path.split('/').pop();
        return filename;
      })
      .filter(Boolean) || []
  );

  console.log('📊 Import Status:\n');

  let imported = 0;
  let notImported = 0;

  files.forEach(file => {
    // Check for exact match or partial match
    const isImported = Array.from(importedFiles).some(imported =>
      imported?.toLowerCase().includes(file.toLowerCase()) ||
      file.toLowerCase().includes(imported?.toLowerCase() || '')
    );

    if (isImported) {
      imported++;
      console.log(`✅ ${file}`);
    } else {
      notImported++;
      console.log(`❌ ${file} - NOT IMPORTED`);
    }
  });

  console.log('\n\n📈 SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total files: ${files.length}`);
  console.log(`✅ Imported: ${imported}`);
  console.log(`❌ Not imported: ${notImported}`);

  if (notImported > 0) {
    console.log('\n💡 To import the missing files, use the bulk upload feature:');
    console.log('   1. Go to the invoice upload page');
    console.log('   2. Select "Multiple Food" folder files');
    console.log('   3. Run bulk import');
  }

  // Check food vendors
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name, normalized_name')
    .or('category.eq.food,category.eq.produce,category.eq.grocery');

  console.log('\n\n🥘 FOOD VENDORS IN SYSTEM:');
  console.log('═'.repeat(70));
  vendors?.forEach(v => {
    console.log(`  - ${v.name}`);
  });
}

checkImported();
