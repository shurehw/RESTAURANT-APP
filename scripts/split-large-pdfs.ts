import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { stat, mkdir } from 'fs/promises';
import { PDFDocument } from 'pdf-lib';

const INVOICE_DIR = process.env.INVOICE_DIR || process.argv[2];
const OUTPUT_DIR = process.env.OUTPUT_DIR || process.argv[3];

if (!INVOICE_DIR) {
  console.error('❌ Please provide INVOICE_DIR');
  console.error('Usage: INVOICE_DIR="path/to/invoices" OUTPUT_DIR="path/to/output" npx tsx scripts/split-large-pdfs.ts');
  process.exit(1);
}

if (!OUTPUT_DIR) {
  console.error('❌ Please provide OUTPUT_DIR');
  console.error('Usage: INVOICE_DIR="path/to/invoices" OUTPUT_DIR="path/to/output" npx tsx scripts/split-large-pdfs.ts');
  process.exit(1);
}

async function splitPDF(inputPath: string, outputDir: string, baseName: string) {
  try {
    // Read the PDF file
    const pdfBytes = await readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    console.log(`  📄 ${pageCount} pages found`);

    // Split each page into a separate PDF
    for (let i = 0; i < pageCount; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);

      const newPdfBytes = await newPdf.save();
      const outputPath = join(outputDir, `${baseName}_page_${String(i + 1).padStart(4, '0')}.pdf`);
      await writeFile(outputPath, newPdfBytes);
    }

    return pageCount;
  } catch (error) {
    console.error(`Error splitting ${inputPath}:`, error);
    return 0;
  }
}

async function main() {
  console.log('📄 PDF Splitter\n');
  console.log(`📁 Reading from: ${INVOICE_DIR}`);
  console.log(`📁 Output to: ${OUTPUT_DIR}\n`);

  // Create output directory if it doesn't exist
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  // Get all PDF files
  const files = await readdir(INVOICE_DIR);
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log(`Found ${pdfFiles.length} PDF files\n`);

  let successCount = 0;
  let failCount = 0;
  let totalPages = 0;

  for (const file of pdfFiles) {
    const fullPath = join(INVOICE_DIR, file);
    const stats = await stat(fullPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`📄 Processing: ${file} (${sizeMB} MB)`);

    // Only split files larger than 10MB
    if (stats.size > 10 * 1024 * 1024) {
      const baseName = file.replace('.pdf', '');
      const pageCount = await splitPDF(fullPath, OUTPUT_DIR, baseName);

      if (pageCount > 0) {
        console.log(`  ✅ Split into ${pageCount} pages\n`);
        successCount++;
        totalPages += pageCount;
      } else {
        console.log(`  ❌ Failed to split\n`);
        failCount++;
      }
    } else {
      console.log(`  ⏭️  Skipped (under 10MB)\n`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Summary:\n`);
  console.log(`✅ Split: ${successCount} files`);
  console.log(`📄 Total pages: ${totalPages}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`\n✨ Done!`);
}

main().catch(console.error);
