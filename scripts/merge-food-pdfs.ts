/**
 * Merge Food Invoice PDFs
 * Combines all 140 PDFs from Multiple Food Split folder into one file
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const SOURCE_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food Split';
const OUTPUT_FILE = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\MERGED_FOOD_INVOICES.pdf';

async function mergePDFs() {
  console.log('📄 Merging Food Invoice PDFs\n');
  console.log('═'.repeat(60));

  // Get all PDF files
  if (!fs.existsSync(SOURCE_FOLDER)) {
    console.error(`❌ Folder not found: ${SOURCE_FOLDER}`);
    return;
  }

  const files = fs.readdirSync(SOURCE_FOLDER)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort()
    .map(f => path.join(SOURCE_FOLDER, f));

  console.log(`\n📁 Found ${files.length} PDF files\n`);

  // Create a text file with list of PDFs for pdftk
  const listFile = path.join(SOURCE_FOLDER, 'merge-list.txt');
  fs.writeFileSync(listFile, files.join('\n'));

  console.log('🔄 Merging PDFs using pdftk...\n');
  console.log(`   Source: ${SOURCE_FOLDER}`);
  console.log(`   Output: ${OUTPUT_FILE}\n`);

  try {
    // Use pdftk to merge (if installed)
    // Alternative: gs (Ghostscript)
    const command = `pdftk ${files.map(f => `"${f}"`).join(' ')} cat output "${OUTPUT_FILE}"`;

    console.log('Running merge command...\n');
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 100 // 100MB buffer
    });

    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);

    if (fs.existsSync(OUTPUT_FILE)) {
      const stats = fs.statSync(OUTPUT_FILE);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

      console.log('✅ Merge complete!\n');
      console.log(`📄 Output: ${OUTPUT_FILE}`);
      console.log(`📊 Size: ${fileSizeMB} MB`);
      console.log(`📑 Pages: ${files.length} invoices\n`);
      console.log('═'.repeat(60));
      console.log('\n✅ Ready to upload through UI!');
    } else {
      console.log('❌ Output file not created');
    }

  } catch (error) {
    console.log('⚠️  pdftk not found. Trying Ghostscript...\n');

    try {
      // Try Ghostscript instead
      const gsCommand = `gswin64c -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -sOutputFile="${OUTPUT_FILE}" ${files.map(f => `"${f}"`).join(' ')}`;

      const { stdout, stderr } = await execAsync(gsCommand, {
        maxBuffer: 1024 * 1024 * 100
      });

      if (stdout) console.log(stdout);
      if (stderr) console.log(stderr);

      if (fs.existsSync(OUTPUT_FILE)) {
        const stats = fs.statSync(OUTPUT_FILE);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

        console.log('✅ Merge complete!\n');
        console.log(`📄 Output: ${OUTPUT_FILE}`);
        console.log(`📊 Size: ${fileSizeMB} MB`);
        console.log(`📑 Pages: ${files.length} invoices\n`);
        console.log('═'.repeat(60));
        console.log('\n✅ Ready to upload through UI!');
      }

    } catch (gsError) {
      console.log('❌ Ghostscript also not found.\n');
      console.log('Please install one of:');
      console.log('  - PDFtk: https://www.pdflabs.com/tools/pdftk-the-pdf-toolkit/');
      console.log('  - Ghostscript: https://www.ghostscript.com/download/gsdnld.html\n');
      console.log('Or manually merge the PDFs using:');
      console.log('  - Adobe Acrobat');
      console.log('  - Online tool: https://www.ilovepdf.com/merge_pdf');
      console.log(`\n📁 Source folder: ${SOURCE_FOLDER}`);
    }
  }
}

mergePDFs();
