import { PDFDocument } from 'pdf-lib';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

const FOLDER = 'C:\\Users\\JacobShure\\Downloads\\delilah_dallas_invoices__food_1';

async function checkPages() {
  const files = (await readdir(FOLDER)).filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log('PDF Page Counts:');
  console.log('═'.repeat(50));

  let totalPages = 0;

  for (const file of files) {
    const filePath = join(FOLDER, file);
    const data = await readFile(filePath);
    const pdf = await PDFDocument.load(data);
    const pages = pdf.getPageCount();
    totalPages += pages;
    console.log(`${file}: ${pages} pages`);
  }

  console.log('═'.repeat(50));
  console.log(`Total: ${files.length} files, ${totalPages} pages`);

  if (totalPages > files.length) {
    console.log('\n⚠️  Multiple invoices per PDF detected!');
    console.log('Each page may be a separate invoice that needs splitting.');
  }
}

checkPages();
