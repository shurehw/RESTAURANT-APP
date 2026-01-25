#!/usr/bin/env node
/**
 * Check why OCR vendor names are showing as N/A
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

async function checkOCRExtraction() {
  console.log('\n=== Checking OCR Vendor Name Extraction ===\n');

  const { data: recentInvoices } = await supabase
    .from('invoices')
    .select('id, vendor_id, vendors(name), ocr_raw_json, created_at')
    .not('ocr_raw_json', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Recent invoices with OCR data:\n');

  recentInvoices?.forEach((inv, idx) => {
    const ocrData = inv.ocr_raw_json as any;
    const vendorName = (inv.vendors as any)?.name;

    console.log(`${idx + 1}. Invoice ${inv.id.slice(0, 8)}... (${new Date(inv.created_at).toLocaleDateString()})`);
    console.log(`   Vendor in DB: "${vendorName}"`);
    console.log(`   OCR Raw Keys: ${Object.keys(ocrData || {}).join(', ')}`);

    // Check different possible keys for vendor name
    const possibleVendor = ocrData?.vendor || ocrData?.vendorName || ocrData?.Vendor || ocrData?.supplier || 'NOT FOUND';
    console.log(`   OCR Vendor: "${possibleVendor}"`);

    // Show first 200 chars of raw JSON to see structure
    const rawStr = JSON.stringify(ocrData).slice(0, 200);
    console.log(`   Raw OCR preview: ${rawStr}...`);
    console.log('');
  });

  // Also check vendor_name in one invoice
  if (recentInvoices && recentInvoices.length > 0) {
    const sample = recentInvoices[0];
    console.log('\n=== Full OCR Structure (first invoice) ===\n');
    console.log(JSON.stringify(sample.ocr_raw_json, null, 2).slice(0, 1000));
  }
}

checkOCRExtraction().catch(console.error);
