import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { extractInvoiceFromPDF, extractInvoiceWithClaude } from '../lib/ocr/claude';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FOOD_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food';

// Get organization ID (Hwood Group)
async function getOrgId(): Promise<string> {
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%hwood%')
    .single();

  if (!orgs) {
    throw new Error('Hwood Group organization not found');
  }

  return orgs.id;
}

// Normalize vendor name for matching
function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\.']/g, '')
    .replace(/\b(llc|inc|corp|ltd|company|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scanAndCreateVendors() {
  console.log('🔍 Scanning food invoices for vendors...');
  console.log('═'.repeat(70));

  const orgId = await getOrgId();
  console.log(`Organization: Hwood Group (${orgId})\n`);

  // Get all existing vendors
  const { data: existingVendors } = await supabase
    .from('vendors')
    .select('id, name, normalized_name')
    .eq('org_id', orgId);

  const existingVendorNames = new Set(existingVendors?.map(v => v.normalized_name) || []);

  // Scan all files
  const files = await readdir(FOOD_FOLDER);
  const pdfFiles = files.filter(f =>
    f.toLowerCase().endsWith('.pdf') ||
    f.toLowerCase().endsWith('.jpeg') ||
    f.toLowerCase().endsWith('.jpg')
  );

  console.log(`Found ${pdfFiles.length} invoice files\n`);

  const vendorsFound = new Map<string, { originalName: string; normalized: string; count: number }>();

  // Scan each file for vendor
  for (const file of pdfFiles.slice(0, 5)) { // Test first 5 files
    try {
      console.log(`📄 Scanning: ${file}...`);
      const filePath = join(FOOD_FOLDER, file);
      const fileData = await readFile(filePath);

      let vendorName = '';

      if (file.toLowerCase().endsWith('.pdf')) {
        const { invoice } = await extractInvoiceFromPDF(fileData);
        vendorName = invoice.vendor;
      } else {
        const mimeType = file.toLowerCase().endsWith('.jpeg') || file.toLowerCase().endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/png';
        const { invoice } = await extractInvoiceWithClaude(fileData, mimeType);
        vendorName = invoice.vendor;
      }

      const normalized = normalizeVendorName(vendorName);

      if (vendorsFound.has(normalized)) {
        const existing = vendorsFound.get(normalized)!;
        existing.count++;
      } else {
        vendorsFound.set(normalized, {
          originalName: vendorName,
          normalized,
          count: 1
        });
      }

      console.log(`  ✅ Found vendor: ${vendorName}\n`);

    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
  }

  console.log('\n\n📊 VENDOR ANALYSIS');
  console.log('═'.repeat(70));

  const vendorsToCreate: Array<{ name: string; normalized: string }> = [];

  for (const [normalized, info] of vendorsFound.entries()) {
    const exists = existingVendorNames.has(normalized);

    if (exists) {
      console.log(`✅ ${info.originalName} - Already in system (${info.count} invoices)`);
    } else {
      console.log(`❌ ${info.originalName} - NEEDS CREATION (${info.count} invoices)`);
      vendorsToCreate.push({
        name: info.originalName,
        normalized
      });
    }
  }

  if (vendorsToCreate.length === 0) {
    console.log('\n✅ All vendors already exist in the system!');
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
        console.log(`❌ Failed to create ${vendor.name}: ${error.message}`);
      } else {
        console.log(`✅ Created: ${vendor.name} (ID: ${data.id})`);
      }
    } catch (error) {
      console.log(`❌ Error creating ${vendor.name}: ${error}`);
    }
  }

  console.log('\n\n✅ Vendor setup complete!');
  console.log('You can now run the bulk import script.');
}

scanAndCreateVendors();
