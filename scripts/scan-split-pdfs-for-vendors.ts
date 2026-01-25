import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SPLIT_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Split';

async function getOrgId(): Promise<string> {
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%hwood%')
    .single();

  if (!orgs) throw new Error('Hwood Group organization not found');
  return orgs.id;
}

function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\.']/g, '')
    .replace(/\b(llc|inc|corp|ltd|company|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scanVendors() {
  console.log('🔍 Scanning split PDFs for vendors...');
  console.log('═'.repeat(70));

  const orgId = await getOrgId();
  console.log(`Organization: Hwood Group (${orgId})\n`);

  const { data: existingVendors } = await supabase
    .from('vendors')
    .select('id, name, normalized_name');

  const existingVendorNames = new Set(existingVendors?.map(v => v.normalized_name) || []);

  const folders = await readdir(SPLIT_FOLDER);
  const vendorsFound = new Map<string, { originalName: string; normalized: string; count: number }>();

  console.log(`Scanning ${folders.length} PDF folders...\n`);

  for (const folder of folders.slice(0, 5)) {  // Test first 5 folders
    try {
      const folderPath = join(SPLIT_FOLDER, folder);
      const files = await readdir(folderPath);
      const firstPDF = files.find(f => f.toLowerCase().endsWith('.pdf'));

      if (!firstPDF) continue;

      console.log(`📁 ${folder}/${firstPDF}...`);
      const pdfPath = join(folderPath, firstPDF);
      const pdfData = await readFile(pdfPath);

      const { invoice } = await extractInvoiceFromPDF(pdfData);
      const vendorName = invoice.vendor;
      const normalized = normalizeVendorName(vendorName);

      if (vendorsFound.has(normalized)) {
        vendorsFound.get(normalized)!.count++;
      } else {
        vendorsFound.set(normalized, {
          originalName: vendorName,
          normalized,
          count: 1
        });
      }

      console.log(`  ✅ Vendor: ${vendorName}\n`);

    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}\n`);
    }
  }

  console.log('\n📊 VENDOR ANALYSIS');
  console.log('═'.repeat(70));

  const vendorsToCreate: Array<{ name: string; normalized: string }> = [];

  for (const [normalized, info] of vendorsFound.entries()) {
    const exists = existingVendorNames.has(normalized);

    if (exists) {
      console.log(`✅ ${info.originalName} - Already exists`);
    } else {
      console.log(`❌ ${info.originalName} - NEEDS CREATION`);
      vendorsToCreate.push({
        name: info.originalName,
        normalized
      });
    }
  }

  if (vendorsToCreate.length === 0) {
    console.log('\n✅ All vendors already exist!');
    return;
  }

  console.log('\n\n🏭 CREATING MISSING VENDORS');
  console.log('═'.repeat(70));

  for (const vendor of vendorsToCreate) {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({
          name: vendor.name,
          normalized_name: vendor.normalized,
          is_active: true,
          payment_terms_days: 30
        })
        .select()
        .single();

      if (error) {
        console.log(`❌ Failed: ${vendor.name} - ${error.message}`);
      } else {
        console.log(`✅ Created: ${vendor.name} (ID: ${data.id})`);
      }
    } catch (error) {
      console.log(`❌ Error: ${vendor.name} - ${error}`);
    }
  }

  console.log('\n✅ Vendor setup complete!');
}

scanVendors();
