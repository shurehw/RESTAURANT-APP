import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SOURCE_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food';
const OUTPUT_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Small';

// Target: 2 pages max, 5MB max
const MAX_PAGES_PER_CHUNK = 2;
const MAX_MB_PER_CHUNK = 5;

async function splitPDF(inputPath: string, fileName: string) {
  console.log(`\n📄 ${fileName}`);

  try {
    const pdfBytes = await readFile(inputPath);
    const fileSizeMB = (pdfBytes.length / 1024 / 1024).toFixed(2);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    // Create output directory
    const baseName = fileName.replace('.pdf', '');
    const fileOutputDir = join(OUTPUT_FOLDER, baseName);
    await mkdir(fileOutputDir, { recursive: true });

    let chunkNum = 1;
    let currentPage = 0;

    while (currentPage < totalPages) {
      const chunkPdf = await PDFDocument.create();
      let chunkPages = 0;
      const startPage = currentPage;

      // Add pages (max 2)
      while (currentPage < totalPages && chunkPages < MAX_PAGES_PER_CHUNK) {
        const [copiedPage] = await chunkPdf.copyPages(pdfDoc, [currentPage]);
        chunkPdf.addPage(copiedPage);
        currentPage++;
        chunkPages++;

        // Check size
        const currentBytes = await chunkPdf.save();
        const currentMB = currentBytes.length / 1024 / 1024;
        if (currentMB > MAX_MB_PER_CHUNK) {
          // Remove last page if too big
          if (chunkPages > 1) {
            currentPage--;
            chunkPages--;
          }
          break;
        }
      }

      // Save chunk
      const chunkBytes = await chunkPdf.save();
      const chunkSizeMB = (chunkBytes.length / 1024 / 1024).toFixed(2);
      const chunkFileName = `${baseName}_pg${startPage + 1}-${currentPage}.pdf`;
      const chunkPath = join(fileOutputDir, chunkFileName);

      await writeFile(chunkPath, chunkBytes);
      console.log(`  ✅ ${chunkFileName} (${chunkPages}pg, ${chunkSizeMB}MB)`);

      chunkNum++;
    }

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return { success: false };
  }
}

async function main() {
  console.log('✂️  Re-splitting into smaller chunks (2 pages max, 5MB max)');
  console.log('═'.repeat(70));

  await mkdir(OUTPUT_FOLDER, { recursive: true });

  const files = await readdir(SOURCE_FOLDER);
  const largeFiles = files.filter(f =>
    f.toLowerCase().endsWith('.pdf') &&
    (f.toLowerCase().includes('kitchen') ||
     f.toLowerCase().includes('invoice 4') ||
     f.toLowerCase().includes('invoices 5'))
  );

  console.log(`Processing ${largeFiles.length} files\n`);

  for (const file of largeFiles) {
    await splitPDF(join(SOURCE_FOLDER, file), file);
  }

  console.log('\n✅ Done! Chunks saved to:');
  console.log(`   ${OUTPUT_FOLDER}`);
}

main();
