#!/usr/bin/env node
/**
 * Check how vendors are used across organizations
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

async function checkVendorUsage() {
  console.log('\n=== Checking Vendor Usage ===\n');

  // Check invoices by org
  const { data: invoices } = await supabase
    .from('invoices')
    .select('organization_id, vendor_id, vendors(name)')
    .limit(100);

  console.log('Sample invoices with vendor names:');
  invoices?.slice(0, 10).forEach(inv => {
    console.log(`  Org: ${inv.organization_id}, Vendor: ${(inv.vendors as any)?.name}`);
  });

  // Count unique vendors per org
  const vendorsByOrg = new Map<string, Set<string>>();
  invoices?.forEach(inv => {
    if (!vendorsByOrg.has(inv.organization_id)) {
      vendorsByOrg.set(inv.organization_id, new Set());
    }
    vendorsByOrg.get(inv.organization_id)!.add(inv.vendor_id);
  });

  console.log('\n=== Vendors per Organization ===');
  for (const [orgId, vendors] of vendorsByOrg) {
    console.log(`Org ${orgId}: ${vendors.size} unique vendors`);
  }

  // Check if invoices table has org_id
  const { data: sampleInvoice } = await supabase
    .from('invoices')
    .select('*')
    .limit(1)
    .single();

  console.log('\n=== Invoice Columns ===');
  console.log(Object.keys(sampleInvoice || {}));
}

checkVendorUsage().catch(console.error);
