#!/usr/bin/env node
/**
 * List files in Supabase storage
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

async function listStorageFiles() {
  console.log('\n=== Listing Storage Files ===\n');

  // List files in uploads folder
  const { data: uploadFiles, error: uploadError } = await supabase
    .storage
    .from('opsos-invoices')
    .list('uploads', {
      limit: 20,
      sortBy: { column: 'created_at', order: 'desc' }
    });

  if (uploadError) {
    console.error('Error listing uploads:', uploadError);
  } else {
    console.log(`Found ${uploadFiles?.length || 0} files in uploads/:\n`);
    uploadFiles?.forEach(file => {
      console.log(`  - ${file.name} (${Math.round(file.metadata.size / 1024)}KB)`);
    });
  }

  // Also check root level
  console.log('\n=== Root Level Files ===\n');
  const { data: rootFiles, error: rootError } = await supabase
    .storage
    .from('opsos-invoices')
    .list('', {
      limit: 20,
      sortBy: { column: 'created_at', order: 'desc' }
    });

  if (rootError) {
    console.error('Error listing root:', rootError);
  } else {
    console.log(`Found ${rootFiles?.length || 0} items in root:\n`);
    rootFiles?.forEach(file => {
      const type = file.id ? 'file' : 'folder';
      const size = file.metadata?.size ? `(${Math.round(file.metadata.size / 1024)}KB)` : '';
      console.log(`  ${type === 'folder' ? '📁' : '📄'} ${file.name} ${size}`);
    });
  }
}

listStorageFiles().catch(console.error);
