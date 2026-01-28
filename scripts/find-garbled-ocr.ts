import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function isGarbled(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  
  // Multiple I's in a row (OCR often confuses l, 1, I)
  if (/[I]{2,}/.test(t)) return true;
  
  // Single I between words (should be "in" or other word)
  if (/\b[A-Z]+ I [A-Z]+/.test(t)) return true;
  
  // 4+ consecutive all-caps words (probably garbled)
  if (/\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b/.test(t)) return true;
  
  // Lots of special characters
  if ((t.match(/[^\w\s\/.\-×]/g) || []).length >= 5) return true;
  
  return false;
}

async function findGarbledOCR() {
  console.log('🔍 Finding garbled OCR invoice lines...\n');

  const { data: lines, error } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      line_total,
      item_id,
      ocr_confidence,
      invoice:invoices(id, invoice_number, invoice_date, vendor:vendors(name))
    `)
    .is('item_id', null) // Only unmapped lines
    .order('description');

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  const garbled = lines?.filter(line => isGarbled(line.description)) || [];
  
  console.log(`Found ${garbled.length} garbled lines out of ${lines?.length || 0} unmapped lines:\n`);

  const grouped = new Map<string, any[]>();
  garbled.forEach(line => {
    const key = line.description;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(line);
  });

  let totalLines = 0;
  const entries = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);
  
  entries.forEach(([description, items]) => {
    const avgConfidence = items.reduce((sum: number, i: any) => sum + (i.ocr_confidence || 0), 0) / items.length;
    console.log(`📝 "${description}"`);
    console.log(`   Count: ${items.length} lines`);
    console.log(`   Avg OCR confidence: ${avgConfidence.toFixed(2)}`);
    console.log(`   Vendors: ${[...new Set(items.map((i: any) => i.invoice?.vendor?.name))].join(', ')}`);
    console.log(`   Line IDs: ${items.slice(0, 3).map((i: any) => i.id).join(', ')}${items.length > 3 ? '...' : ''}`);
    console.log('');
    totalLines += items.length;
  });

  console.log(`\n✅ Total: ${grouped.size} unique garbled descriptions (${totalLines} total lines)`);
  console.log(`\n💡 To fix these, create a script that updates invoice_lines.description`);
}

findGarbledOCR().catch(console.error);
