import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SOURCE_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food';
const OUTPUT_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Split';

// Anthropic API has ~32MB limit for PDF input
// We'll split into chunks of 10 pages or 10MB, whichever comes first
const MAX_PAGES_PER_CHUNK = 10;
const MAX_MB_PER_CHUNK = 10;

async function splitPDF(inputPath: string, fileName: string) {
  console.log(`\n📄 Processing: ${fileName}`);
  console.log('─'.repeat(70));

  try {
    const pdfBytes = await readFile(inputPath);
    const fileSizeMB = (pdfBytes.length / 1024 / 1024).toFixed(2);
    console.log(`  Size: ${fileSizeMB} MB`);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    console.log(`  Pages: ${totalPages}`);

    // If file is small enough, skip splitting
    if (parseFloat(fileSizeMB) < MAX_MB_PER_CHUNK && totalPages <= MAX_PAGES_PER_CHUNK) {
      console.log(`  ✅ File is already small enough, no splitting needed`);
      return { success: true, chunks: 0 };
    }

    // Create output directory for this file
    const baseName = fileName.replace('.pdf', '');
    const fileOutputDir = join(OUTPUT_FOLDER, baseName);
    await mkdir(fileOutputDir, { recursive: true });

    let chunkNum = 1;
    let currentPage = 0;

    while (currentPage < totalPages) {
      // Create new PDF for this chunk
      const chunkPdf = await PDFDocument.create();
      let chunkPages = 0;
      const startPage = currentPage;

      // Add pages to chunk until we hit limits
      while (currentPage < totalPages && chunkPages < MAX_PAGES_PER_CHUNK) {
        const [copiedPage] = await chunkPdf.copyPages(pdfDoc, [currentPage]);
        chunkPdf.addPage(copiedPage);
        currentPage++;
        chunkPages++;

        // Check size periodically
        if (chunkPages % 5 === 0) {
          const currentBytes = await chunkPdf.save();
          const currentMB = currentBytes.length / 1024 / 1024;
          if (currentMB > MAX_MB_PER_CHUNK) {
            break;
          }
        }
      }

      // Save chunk
      const chunkBytes = await chunkPdf.save();
      const chunkSizeMB = (chunkBytes.length / 1024 / 1024).toFixed(2);
      const chunkFileName = `${baseName}_part${chunkNum.toString().padStart(3, '0')}.pdf`;
      const chunkPath = join(fileOutputDir, chunkFileName);

      await writeFile(chunkPath, chunkBytes);
      console.log(`  ✅ Chunk ${chunkNum}: pages ${startPage + 1}-${currentPage} (${chunkPages} pages, ${chunkSizeMB} MB)`);

      chunkNum++;
    }

    console.log(`  ✅ Split into ${chunkNum - 1} chunks`);
    return { success: true, chunks: chunkNum - 1 };

  } catch (error) {
    console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, chunks: 0 };
  }
}

async function main() {
  console.log('✂️  Splitting Large Food PDFs');
  console.log('═'.repeat(70));
  console.log(`Source: ${SOURCE_FOLDER}`);
  console.log(`Output: ${OUTPUT_FOLDER}\n`);

  // Create output directory
  await mkdir(OUTPUT_FOLDER, { recursive: true });

  // Get all PDF files
  const files = await readdir(SOURCE_FOLDER);
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

  // Filter for large files only (Kitchen invoices, INVOICE 4, invoices 5)
  const largeFiles = pdfFiles.filter(f =>
    f.toLowerCase().includes('kitchen') ||
    f.toLowerCase().includes('invoice 4') ||
    f.toLowerCase().includes('invoices 5')
  );

  console.log(`Found ${largeFiles.length} large PDF files to split:\n`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalChunks = 0;

  for (const file of largeFiles) {
    const filePath = join(SOURCE_FOLDER, file);
    const result = await splitPDF(filePath, file);

    if (result.success) {
      totalSuccess++;
      totalChunks += result.chunks;
    } else {
      totalFailed++;
    }
  }

  console.log('\n\n📊 SPLITTING SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total files processed: ${largeFiles.length}`);
  console.log(`✅ Successfully split: ${totalSuccess}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📑 Total chunks created: ${totalChunks}`);

  console.log(`\n✅ Split PDFs saved to:`);
  console.log(`   ${OUTPUT_FOLDER}`);
  console.log(`\nNext step: Import these chunks using the bulk import script`);
}

main();
