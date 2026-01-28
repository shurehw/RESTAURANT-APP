import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

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
  if (/[I]{2,}/.test(t)) return true;
  if (/\b[A-Z]+ I [A-Z]+/.test(t)) return true;
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

Examples:
- "BINGKAI I ST SAUY WHITE III CAM Y I M" → "Biondi Santi Sauvignon Blanc Magnum"
- "DOM FAIVELEY MAZIS CHAMBERTIN" → "Domaine Faiveley Mazis-Chambertin"

Corrected text:`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    const textBlock = message.content.find(block => block.type === 'text');
    return textBlock ? (textBlock as any).text.trim() : garbledText;
  } catch (error) {
    console.error(`Error fixing OCR for "${garbledText}":`, error);
    return garbledText; // Return original if error
  }
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
  console.log('🤖 Auto-fixing all with AI...\n');

  let fixed = 0;
  let failed = 0;
  const entries = Array.from(grouped.entries());

  for (let i = 0; i < entries.length; i++) {
    const [garbledDesc, items] = entries[i];
    const vendor = items[0].invoice?.vendor?.name;
    
    console.log(`[${i + 1}/${entries.length}] "${garbledDesc.substring(0, 60)}${garbledDesc.length > 60 ? '...' : ''}"`);
    
    const corrected = await fixOCR(garbledDesc, vendor);
    
    if (corrected && corrected !== garbledDesc) {
      console.log(`   ✨ "${corrected.substring(0, 60)}${corrected.length > 60 ? '...' : ''}"`);
      
      const lineIds = items.map(i => i.id);
      const { error: updateError } = await supabase
        .from('invoice_lines')
        .update({ description: corrected })
        .in('id', lineIds);

      if (updateError) {
        console.log(`   ❌ Update failed`);
        failed++;
      } else {
        console.log(`   ✅ Updated ${lineIds.length} lines`);
        fixed++;
      }
    } else {
      console.log(`   ⏭️  No change`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ Complete! Fixed: ${fixed} | Failed: ${failed} | Total: ${entries.length}`);
}

main().catch(console.error);
