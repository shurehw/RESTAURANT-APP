#!/usr/bin/env node
/**
 * Check invoice storage paths
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

async function checkInvoiceStorage() {
  console.log('\n=== Checking Invoice Storage Paths ===\n');

  // Get recent invoices
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, vendor_id, invoice_date, storage_path')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching invoices:', error);
    return;
  }

  console.log(`Found ${invoices?.length || 0} recent invoices:\n`);

  for (const invoice of invoices || []) {
    console.log(`Invoice ${invoice.id}:`);
    console.log(`  Storage Path: ${invoice.storage_path || 'NULL'}`);

    if (invoice.storage_path) {
      // Try to access the file
      const { data: fileData, error: fileError } = await supabase
        .storage
        .from('opsos-invoices')
        .list(invoice.storage_path.split('/').slice(0, -1).join('/'));

      if (fileError) {
        console.log(`  ❌ Error accessing path: ${fileError.message}`);
      } else {
        const fileName = invoice.storage_path.split('/').pop();
        const fileExists = fileData?.some(f => f.name === fileName);
        console.log(`  ${fileExists ? '✓' : '❌'} File exists: ${fileExists}`);
      }
    }
    console.log('');
  }
}

checkInvoiceStorage().catch(console.error);
