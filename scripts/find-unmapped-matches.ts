import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Normalize text for fuzzy matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity score between two strings
function similarity(s1: string, s2: string): number {
  const n1 = normalize(s1);
  const n2 = normalize(s2);

  // Exact match
  if (n1 === n2) return 1.0;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;

  // Check word overlap
  const words1 = new Set(n1.split(' '));
  const words2 = new Set(n2.split(' '));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

async function main() {
  console.log('🔍 Finding potential matches for unmapped invoice lines...\n');

  // Get all unmapped invoice lines
  const { data: unmappedLines, error: linesError } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      invoice:invoices(
        id,
        invoice_number,
        vendor:vendors(name)
      )
    `)
    .is('item_id', null)
    .gt('qty', 0)
    .order('description');

  if (linesError) {
    console.error('❌ Error fetching unmapped lines:', linesError);
    return;
  }

  console.log(`Found ${unmappedLines?.length || 0} unmapped invoice lines\n`);

  // Get all items
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, name, category, subcategory')
    .eq('is_active', true);

  if (itemsError) {
    console.error('❌ Error fetching items:', itemsError);
    return;
  }

  console.log(`Searching against ${items?.length || 0} active items\n`);

  const SIMILARITY_THRESHOLD = 0.6; // 60% similarity minimum
  let matchCount = 0;
  const matches: Array<{
    lineId: string;
    lineDescription: string;
    invoiceNumber: string;
    vendor: string;
    itemId: string;
    itemName: string;
    score: number;
  }> = [];

  for (const line of unmappedLines || []) {
    // Find best matching item
    let bestMatch: any = null;
    let bestScore = 0;

    for (const item of items || []) {
      const score = similarity(line.description, item.name);
      if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch) {
      matchCount++;
      matches.push({
        lineId: line.id,
        lineDescription: line.description,
        invoiceNumber: line.invoice?.invoice_number || 'N/A',
        vendor: line.invoice?.vendor?.name || 'Unknown',
        itemId: bestMatch.id,
        itemName: bestMatch.name,
        score: bestScore,
      });
    }
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log(`✅ Found ${matchCount} potential matches!\n`);

  // Group by similarity score
  const highConfidence = matches.filter(m => m.score >= 0.8);
  const mediumConfidence = matches.filter(m => m.score >= 0.6 && m.score < 0.8);

  if (highConfidence.length > 0) {
    console.log(`\n🎯 HIGH CONFIDENCE MATCHES (${highConfidence.length}) - Score ≥ 80%:\n`);
    highConfidence.slice(0, 20).forEach(match => {
      console.log(`[${(match.score * 100).toFixed(0)}%] "${match.lineDescription}"`);
      console.log(`     → "${match.itemName}"`);
      console.log(`     Invoice: ${match.invoiceNumber} | Vendor: ${match.vendor}\n`);
    });
    if (highConfidence.length > 20) {
      console.log(`... and ${highConfidence.length - 20} more high confidence matches\n`);
    }
  }

  if (mediumConfidence.length > 0) {
    console.log(`\n📊 MEDIUM CONFIDENCE MATCHES (${mediumConfidence.length}) - Score 60-79%:\n`);
    mediumConfidence.slice(0, 10).forEach(match => {
      console.log(`[${(match.score * 100).toFixed(0)}%] "${match.lineDescription}"`);
      console.log(`     → "${match.itemName}"`);
      console.log(`     Invoice: ${match.invoiceNumber} | Vendor: ${match.vendor}\n`);
    });
    if (mediumConfidence.length > 10) {
      console.log(`... and ${mediumConfidence.length - 10} more medium confidence matches\n`);
    }
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Review high confidence matches and bulk-update if accurate`);
  console.log(`   2. Use bulk review UI to map these items efficiently`);
  console.log(`   3. Consider creating missing items for frequently appearing unmapped lines\n`);
}

main().catch(console.error);
