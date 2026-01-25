import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const CHUNKS_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Small';
const MAX_MB = 10;

async function listLargeFiles() {
  console.log('📄 Files over 10MB (need web UI upload):');
  console.log('═'.repeat(70));

  const folders = await readdir(CHUNKS_FOLDER);
  const largeFiles: Array<{ path: string; size: number }> = [];

  for (const folder of folders) {
    const folderPath = join(CHUNKS_FOLDER, folder);
    const folderStat = await stat(folderPath);

    if (!folderStat.isDirectory()) continue;

    const files = (await readdir(folderPath)).filter(f => f.toLowerCase().endsWith('.pdf'));

    for (const file of files) {
      const filePath = join(folderPath, file);
      const fileStat = await stat(filePath);
      const sizeMB = fileStat.size / 1024 / 1024;

      if (sizeMB > MAX_MB) {
        largeFiles.push({ path: `${folder}/${file}`, size: sizeMB });
      }
    }
  }

  largeFiles.sort((a, b) => b.size - a.size);

  largeFiles.forEach((file, i) => {
    console.log(`${i + 1}. ${file.path} (${file.size.toFixed(2)}MB)`);
  });

  console.log(`\nTotal: ${largeFiles.length} files`);
  console.log(`\nThese are single-page PDFs that are too large for Anthropic API.`);
  console.log(`Options:`);
  console.log(`1. Upload via web UI at http://localhost:3000`);
  console.log(`2. Convert to compressed images and re-OCR`);
  console.log(`3. Skip (if not critical)`);
}

listLargeFiles();
