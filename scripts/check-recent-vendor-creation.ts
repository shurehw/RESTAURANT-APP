#!/usr/bin/env node
/**
 * Check recent vendor creation from OCR
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

async function checkRecentVendors() {
  console.log('\n=== Recent Vendor Creation ===\n');

  // Get vendors created in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentVendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${recentVendors?.length || 0} vendors created in last 7 days:\n`);

  recentVendors?.forEach((v, idx) => {
    const date = new Date(v.created_at).toLocaleString();
    console.log(`${idx + 1}. "${v.name}"`);
    console.log(`   Normalized: "${v.normalized_name}"`);
    console.log(`   Created: ${date}`);
    console.log('');
  });

  // Also check recent invoices and their vendor names from OCR
  const { data: recentInvoices } = await supabase
    .from('invoices')
    .select('id, ocr_raw_json, vendor_id, vendors(name), created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('\n=== Recent Invoice OCR Vendor Names ===\n');

  recentInvoices?.forEach((inv, idx) => {
    const ocrData = inv.ocr_raw_json as any;
    const ocrVendor = ocrData?.vendor || 'N/A';
    const mappedVendor = (inv.vendors as any)?.name || 'N/A';

    console.log(`${idx + 1}. OCR: "${ocrVendor}" → Mapped to: "${mappedVendor}"`);
  });
}

checkRecentVendors().catch(console.error);
