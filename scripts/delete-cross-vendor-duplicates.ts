/**
 * Delete cross-vendor duplicates that are blocking vendor merges
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// IDs from the cross-vendor duplicates script
const DELETE_IDS = [
  // Chefs Warehouse duplicates (11 invoices)
  '708030cc-b2e6-4857-848e-e4c33df0b9ea', // 70761327 - The Chefs Warehouse
  '15bbfb2d-d0bf-4b9d-be5a-2b1555ce5bd0', // 70777359 - Midwest
  '85a35c65-ba97-47e7-bd98-41f50fe9f83b', // 70789722 - Midwest
  '49829cf6-4816-4d06-899f-c7b99ed6b8d8', // 70805899 - The Chefs Warehouse
  '446ed704-0b0c-4c33-b25e-cfd4dfd2a97e', // 70833430 - Midwest
  '7bd15598-ea2c-4cc4-a89d-80aa73abf30d', // 70846878 - The Chefs Warehouse
  '22a113b7-c8e6-42eb-bd8e-d1b2b9c7f99c', // 70859984 - Midwest
  'e1e2e78d-cb58-45fa-9e70-e9be12f8e831', // 70923428 - Midwest
  '745b9e0b-3e0c-4e08-98e4-3ec7e7f2b02d', // 70967410 - The Chefs Warehouse
  '4eb250e6-1d59-4673-887c-79bcc9c4cd74', // 70990569 - The Chefs Warehouse
  'd79b6ce9-3c22-4f8c-9d53-f9bf73e8a0c9', // 70998415 - The Chefs Warehouse

  // Dairyland duplicate (1 invoice)
  'd94e9c63-6dc7-45e2-81bf-8d3b08cded02', // 06785216 - with DBA
];

async function deleteDuplicates() {
  console.log('🗑️  Deleting cross-vendor duplicates...\n');
  console.log(`Found ${DELETE_IDS.length} invoices to delete\n`);

  // Delete invoice lines first
  console.log('Deleting invoice lines...');
  const { error: linesError } = await supabase
    .from('invoice_lines')
    .delete()
    .in('invoice_id', DELETE_IDS);

  if (linesError) {
    console.error('❌ Failed to delete lines:', linesError);
    throw linesError;
  }

  console.log('✅ Deleted invoice lines');

  // Delete invoices
  console.log('Deleting invoices...');
  const { error: invoicesError } = await supabase
    .from('invoices')
    .delete()
    .in('id', DELETE_IDS);

  if (invoicesError) {
    console.error('❌ Failed to delete invoices:', invoicesError);
    throw invoicesError;
  }

  console.log(`✅ Successfully deleted ${DELETE_IDS.length} duplicate invoices!\n`);
  console.log('✨ Ready to retry vendor merges\n');
}

deleteDuplicates().catch(console.error);
