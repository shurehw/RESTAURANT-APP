import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Mapping {
  original: string;
  corrected: string;
  count: number;
  vendor: string;
}

function parseCSV(csvContent: string): Mapping[] {
  const lines = csvContent.split('\n');
  const mappings: Mapping[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parser that handles quoted fields
    const matches = line.match(/"([^"]*)","([^"]*)","?(\d+)"?,"([^"]*)"/);
    if (!matches) {
      console.warn(`⚠️  Skipping malformed line ${i + 1}: ${line.substring(0, 50)}...`);
      continue;
    }

    const [, original, corrected, count, vendor] = matches;

    // Only include if corrected value is provided
    if (corrected.trim()) {
      mappings.push({
        original,
        corrected: corrected.trim(),
        count: parseInt(count),
        vendor,
      });
    }
  }

  return mappings;
}

async function main() {
  const filename = 'garbled-ocr-mappings.csv';

  if (!fs.existsSync(filename)) {
    console.error(`❌ File not found: ${filename}`);
    console.log('Run export-garbled-ocr.ts first to generate the CSV file.');
    return;
  }

  console.log('📖 Reading mappings from', filename);
  const csvContent = fs.readFileSync(filename, 'utf-8');
  const mappings = parseCSV(csvContent);

  if (mappings.length === 0) {
    console.log('⚠️  No corrections found in CSV file.');
    console.log('Edit the "corrected" column in the CSV file and run this script again.');
    return;
  }

  console.log(`Found ${mappings.length} corrections to apply\n`);

  let applied = 0;
  let failed = 0;

  for (const mapping of mappings) {
    console.log(`Updating: "${mapping.original.substring(0, 60)}${mapping.original.length > 60 ? '...' : ''}"`);
    console.log(`      → "${mapping.corrected.substring(0, 60)}${mapping.corrected.length > 60 ? '...' : ''}" (${mapping.count} lines)`);

    const { error } = await supabase
      .from('invoice_lines')
      .update({ description: mapping.corrected })
      .eq('description', mapping.original);

    if (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      failed++;
    } else {
      console.log(`   ✅ Updated ${mapping.count} lines`);
      applied++;
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ Complete! Applied: ${applied} | Failed: ${failed} | Total: ${mappings.length}`);
}

main().catch(console.error);
