import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const INVOICE_DIR = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Small';
const API_URL = 'http://localhost:3000/api/invoices/upload';
const VENUE_ID = '79c33e6a-eb21-419f-9606-7494d1a9584c'; // Delilah Dallas

async function bulkUpload() {
  // Get all PDF files
  const files = fs.readdirSync(INVOICE_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort();

  console.log(`\n📁 Found ${files.length} PDF files to upload\n`);

  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(INVOICE_DIR, filename);

    console.log(`[${i + 1}/${files.length}] Uploading ${filename}...`);

    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('venueId', VENUE_ID);

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`  ✅ Success - Invoice #${result.invoice?.invoice_number || 'unknown'}`);
        uploaded++;
      } else {
        const error = await response.text();
        console.log(`  ❌ Failed - ${response.status}: ${error.substring(0, 100)}`);
        failed++;
      }

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      failed++;
    }

    // Rate limit - wait 2s between uploads
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n📊 UPLOAD SUMMARY:`);
  console.log(`  ✅ Uploaded: ${uploaded}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📋 Total: ${files.length}`);
}

bulkUpload()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
