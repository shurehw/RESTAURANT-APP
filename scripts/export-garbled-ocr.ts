import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function isGarbled(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (/[I]{2,}/.test(t)) return true;
  if (/\b[A-Z]+ I [A-Z]+/.test(t)) return true;
  if (/\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b/.test(t)) return true;
  return false;
}

async function main() {
  console.log('🔍 Finding garbled OCR lines...\n');

  const { data: lines, error } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      item_id,
      invoice:invoices(id, vendor:vendors(name))
    `)
    .is('item_id', null)
    .order('description');

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  const garbled = lines?.filter(line => isGarbled(line.description)) || [];

  // Group by description
  const grouped = new Map<string, any[]>();
  garbled.forEach(line => {
    const key = line.description;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(line);
  });

  console.log(`Found ${grouped.size} unique garbled descriptions\n`);

  // Sort by count (most common first)
  const entries = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);

  // Create CSV content
  const csvLines = ['original,corrected,count,vendor'];

  entries.forEach(([garbledDesc, items]) => {
    const count = items.length;
    const vendor = items[0].invoice?.vendor?.name || 'Unknown';
    // Escape quotes and commas for CSV
    const escaped = garbledDesc.replace(/"/g, '""');
    csvLines.push(`"${escaped}","",${count},"${vendor}"`);
  });

  const csv = csvLines.join('\n');
  const filename = 'garbled-ocr-mappings.csv';

  fs.writeFileSync(filename, csv, 'utf-8');

  console.log(`✅ Exported ${entries.length} garbled lines to ${filename}`);
  console.log(`\nTop 10 most common garbled lines:`);
  entries.slice(0, 10).forEach(([desc, items], i) => {
    console.log(`${i + 1}. [${items.length}x] "${desc.substring(0, 60)}${desc.length > 60 ? '...' : ''}"`);
  });
  console.log(`\n📝 Edit ${filename} to add corrections, then run apply-ocr-corrections.ts`);
}

main().catch(console.error);
