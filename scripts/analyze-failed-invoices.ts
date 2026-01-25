import { readFile } from 'fs/promises';
import { join } from 'path';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SPLIT_FOLDER = 'C:\\Users\\JacobShure\\Downloads\\delilah_dallas_invoices__food_1_split';

// Failed files from retry log
const FAILED_FILES = [
  { file: 'New4_page2.pdf', reason: 'OCR JSON parse error' },
  { file: 'New4_page7.pdf', reason: 'OCR JSON parse error' },
  { file: 'New4_page21.pdf', reason: 'lines_create_failed' },
  { file: 'New4_page22.pdf', reason: 'invoice_create_failed' },
  { file: 'New4_page8.pdf', reason: 'no_valid_lines' },
  { file: 'New4_page9.pdf', reason: 'no_valid_lines' },
  { file: 'New6_page24.pdf', reason: 'invoice_create_failed' },
  { file: 'New6_page4.pdf', reason: 'no_valid_lines' },
  { file: 'New6_page5.pdf', reason: 'no_valid_lines' },
  { file: 'New6_page6.pdf', reason: 'no_valid_lines' },
  { file: 'New7_page12.pdf', reason: 'no_valid_lines' },
  { file: 'New7_page13.pdf', reason: 'no_valid_lines' },
  { file: 'New7_page14.pdf', reason: 'OCR error' },
  { file: 'New7_page18.pdf', reason: 'OCR JSON parse error' },
  { file: 'New7_page2.pdf', reason: 'no_valid_lines' },
  { file: 'New7_page3.pdf', reason: 'no_valid_lines' },
  { file: 'New7_page5.pdf', reason: 'no_valid_lines' }
];

async function analyzeFailures() {
  console.log('📋 ANALYZING FAILED INVOICES');
  console.log('═'.repeat(70));
  console.log(`Total failed: ${FAILED_FILES.length}\n`);

  const byReason = new Map<string, number>();
  FAILED_FILES.forEach(f => {
    byReason.set(f.reason, (byReason.get(f.reason) || 0) + 1);
  });

  console.log('FAILURE BREAKDOWN:');
  console.log('─'.repeat(70));
  Array.from(byReason.entries()).forEach(([reason, count]) => {
    console.log(`${reason}: ${count}`);
  });

  console.log('\n\nDETAILED ANALYSIS:');
  console.log('─'.repeat(70));

  const recoverable: string[] = [];
  const unrecoverable: string[] = [];

  for (const { file, reason } of FAILED_FILES) {
    const filePath = join(SPLIT_FOLDER, file);

    try {
      const fileData = await readFile(filePath);
      const fileSizeMB = fileData.length / 1024 / 1024;

      console.log(`\n📄 ${file} (${fileSizeMB.toFixed(2)}MB) - ${reason}`);

      if (reason === 'no_valid_lines') {
        console.log('  ⚠️  Likely blank page or unreadable OCR');
        unrecoverable.push(file);
      } else if (reason.includes('OCR') || reason.includes('parse')) {
        console.log('  🔄 Could retry with better error handling');
        recoverable.push(file);
      } else if (reason.includes('create_failed')) {
        console.log('  🔄 Database constraint issue - could investigate');
        recoverable.push(file);
      } else {
        console.log('  ⚠️  Unknown error');
        unrecoverable.push(file);
      }
    } catch (error) {
      console.log(`  ❌ Could not read file: ${error}`);
    }
  }

  console.log('\n\n📊 RECOVERY SUMMARY');
  console.log('═'.repeat(70));
  console.log(`🔄 Potentially recoverable: ${recoverable.length}`);
  console.log(`⚠️  Unrecoverable (blank/bad pages): ${unrecoverable.length}`);

  if (recoverable.length > 0) {
    console.log('\n🔄 RECOVERABLE FILES:');
    recoverable.forEach(f => console.log(`  - ${f}`));
  }

  if (unrecoverable.length > 0) {
    console.log('\n⚠️  UNRECOVERABLE FILES (likely blank pages):');
    unrecoverable.forEach(f => console.log(`  - ${f}`));
  }
}

analyzeFailures();
