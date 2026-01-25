#!/usr/bin/env node
/**
 * Analyze suspicious vendor variations to determine if OCR errors
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Suspicious pairs to investigate
const SUSPICIOUS_PAIRS = [
  ['Mr. Greens', 'Mt Greens'],
  ['MARION', 'MARKON'],
  ['MARION', 'MARMON'],
  ['MARION', 'MARCONI'],
  ['MARKOL', 'MARKON'],
  ['MARKON', 'MARMON'],
  ['MARCONI', 'MARONI'],
  ['Texas Roadhouse Steaks', 'Texas Steakhouse Steaks'],
  ['BILL TO Customer', 'BTI To Customer'],
];

async function analyzeVendor(vendorName: string) {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, name, created_at')
    .ilike('name', vendorName)
    .single();

  if (!vendor) {
    console.log(`  ⚠️  Vendor "${vendorName}" not found`);
    return null;
  }

  // Count invoices using this vendor
  const { count: invoiceCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendor.id);

  // Get sample invoice to see OCR data
  const { data: sampleInvoice } = await supabase
    .from('invoices')
    .select('id, ocr_raw_json, created_at')
    .eq('vendor_id', vendor.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const ocrVendorName = (sampleInvoice?.ocr_raw_json as any)?.vendor || 'N/A';

  return {
    id: vendor.id,
    name: vendor.name,
    created: new Date(vendor.created_at).toLocaleDateString(),
    invoiceCount: invoiceCount || 0,
    ocrSample: ocrVendorName,
    sampleDate: sampleInvoice?.created_at ? new Date(sampleInvoice.created_at).toLocaleDateString() : 'N/A',
  };
}

async function analyzeSuspiciousPairs() {
  console.log('\n=== Analyzing Suspicious Vendor Pairs ===\n');
  console.log('Checking if these are OCR errors or legitimate different vendors...\n');

  for (const [name1, name2] of SUSPICIOUS_PAIRS) {
    console.log(`\n━━━ "${name1}" vs "${name2}" ━━━`);

    const vendor1 = await analyzeVendor(name1);
    const vendor2 = await analyzeVendor(name2);

    if (!vendor1 || !vendor2) {
      console.log('  ⚠️  One or both vendors not found\n');
      continue;
    }

    console.log(`\n  📊 "${vendor1.name}"`);
    console.log(`     ID: ${vendor1.id}`);
    console.log(`     Created: ${vendor1.created}`);
    console.log(`     Invoices: ${vendor1.invoiceCount}`);
    console.log(`     OCR Sample: "${vendor1.ocrSample}" (${vendor1.sampleDate})`);

    console.log(`\n  📊 "${vendor2.name}"`);
    console.log(`     ID: ${vendor2.id}`);
    console.log(`     Created: ${vendor2.created}`);
    console.log(`     Invoices: ${vendor2.invoiceCount}`);
    console.log(`     OCR Sample: "${vendor2.ocrSample}" (${vendor2.sampleDate})`);

    // Determine recommendation
    let recommendation = '';

    if (vendor1.invoiceCount === 0 && vendor2.invoiceCount === 0) {
      recommendation = '🗑️  BOTH UNUSED - DELETE BOTH';
    } else if (vendor1.invoiceCount === 0) {
      recommendation = `🗑️  DELETE "${vendor1.name}" (unused) - Keep "${vendor2.name}"`;
    } else if (vendor2.invoiceCount === 0) {
      recommendation = `🗑️  DELETE "${vendor2.name}" (unused) - Keep "${vendor1.name}"`;
    } else if (
      vendor1.ocrSample.toLowerCase().includes(vendor2.name.toLowerCase()) ||
      vendor2.ocrSample.toLowerCase().includes(vendor1.name.toLowerCase())
    ) {
      recommendation = '⚠️  LIKELY OCR ERROR - Consider merging';
    } else {
      recommendation = '✅ LIKELY DIFFERENT VENDORS - Keep both';
    }

    console.log(`\n  ${recommendation}\n`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

analyzeSuspiciousPairs().catch(console.error);
