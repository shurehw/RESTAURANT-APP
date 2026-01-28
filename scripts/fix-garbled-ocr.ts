import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function isGarbled(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  
  // Multiple I's in a row
  if (/[I]{2,}/.test(t)) return true;
  
  // Single I between words
  if (/\b[A-Z]+ I [A-Z]+/.test(t)) return true;
  
  // 4+ consecutive all-caps words
  if (/\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b/.test(t)) return true;
  
  return false;
}

async function fixOCR(garbledText: string, vendor?: string): Promise<string> {
  const prompt = `Fix this garbled OCR text from a restaurant invoice. Return ONLY the corrected text, nothing else.

Garbled text: "${garbledText}"
${vendor ? `Vendor: ${vendor}` : ''}

Common OCR errors:
- "I" should be "l" or "1"
- "III" is often "ill" or "111"
- Random capital letters in middle of words
- Spaces in wrong places

Examples:
- "BINGKAI I ST SAUY WHITE III CAM Y I M" → "Biondi Santi Sauvignon Blanc Magnum"
- "DOM FAIVELEY MAZIS CHAMBERTIN" → "Domaine Faiveley Mazis-Chambertin"

Corrected text:`;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const textBlock = message.content.find(block => block.type === 'text');
  return textBlock ? (textBlock as any).text.trim() : garbledText;
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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (question: string): Promise<string> => {
    return new Promise(resolve => rl.question(question, resolve));
  };

  let fixed = 0;
  let skipped = 0;

  for (const [garbledDesc, items] of Array.from(grouped.entries()).slice(0, 20)) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 Garbled: "${garbledDesc}"`);
    console.log(`   Count: ${items.length} lines`);
    console.log(`   Vendor: ${items[0].invoice?.vendor?.name || 'Unknown'}`);

    // Get AI suggestion
    console.log('\n🤖 Getting AI correction...');
    const suggested = await fixOCR(garbledDesc, items[0].invoice?.vendor?.name);
    console.log(`✨ Suggested: "${suggested}"\n`);

    const answer = await ask('Apply this correction? (y/n/edit/skip): ');

    let finalCorrection = suggested;
    if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'skip') {
      console.log('⏭️  Skipped');
      skipped++;
      continue;
    } else if (answer.toLowerCase() === 'edit') {
      const custom = await ask('Enter corrected text: ');
      finalCorrection = custom.trim();
    }

    if (finalCorrection && finalCorrection !== garbledDesc) {
      const lineIds = items.map(i => i.id);
      const { error: updateError } = await supabase
        .from('invoice_lines')
        .update({ description: finalCorrection })
        .in('id', lineIds);

      if (updateError) {
        console.error('❌ Update failed:', updateError);
      } else {
        console.log(`✅ Updated ${lineIds.length} lines`);
        fixed++;
      }
    }
  }

  rl.close();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n✅ Complete! Fixed: ${fixed} | Skipped: ${skipped}`);
}

main().catch(console.error);
