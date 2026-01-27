/**
 * lib/ocr/claude.ts
 * Invoice OCR using Claude Sonnet vision API
 */

import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { RawOCRInvoice } from './normalize';
import dotenv from 'dotenv';

// Load environment variables for scripts
if (typeof window === 'undefined') {
  dotenv.config({ path: '.env.local' });
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const OCR_PROMPT = `You are an expert at extracting structured data from restaurant and construction invoices.

**IMPORTANT: This PDF may contain MULTIPLE separate invoices. If you detect multiple invoices (multiple invoice numbers, dates, or vendor letterheads), return an ARRAY of invoice objects.**

For a SINGLE invoice, return this format:
{
  "vendor": "Vendor company name",
  "invoiceNumber": "Invoice number",
  "invoiceDate": "Date in YYYY-MM-DD format",
  "dueDate": "Due date in YYYY-MM-DD format (if present)",
  "paymentTerms": "Payment terms (e.g., 'Net 30', 'Due on Receipt', 'COD', '2/10 Net 30')",
  "totalAmount": 0.00,
  "confidence": 0.95,
  "deliveryLocation": {
    "name": "Business/venue name if shown (e.g., 'Delilah LA', 'Nice Guy LA', 'The Henry')",
    "address": "Delivery address if shown",
    "confidence": 0.95
  },
  "lineItems": [
    {
      "itemCode": "Vendor's item/SKU code (if present)",
      "description": "Full item description",
      "qty": 0,
      "unitPrice": 0.00,
      "lineTotal": 0.00,
      "confidence": 0.95
    }
  ]
}

For MULTIPLE invoices, return this format:
{
  "invoices": [
    { /* invoice 1 object with all fields above */ },
    { /* invoice 2 object with all fields above */ },
    { /* etc */ }
  ]
}

CRITICAL EXTRACTION REQUIREMENTS:
1. VENDOR NAME (REQUIRED):
   - Look in the top left/center of the invoice for the company letterhead
   - Extract the EXACT vendor/company name as printed (e.g., "Spec's Wine, Spirits & Finer Foods")
   - If the vendor name is unclear or not visible, set vendor to "UNKNOWN" and confidence to 0.3
   - Common locations: top of page, "From:", "Sold By:", letterhead logo

2. PAYMENT TERMS:
   - Look for "Terms:", "Payment Terms:", "Net Days:", or similar labels
   - Common formats: "Net 30", "Net 15", "Due on Receipt", "COD", "2/10 Net 30"
   - If not found, set to null

3. DUE DATE:
   - Look for "Due Date:", "Payment Due:", or calculate from invoice date + payment terms
   - If "Net 30" terms, calculate due date as invoice date + 30 days
   - If not found and cannot calculate, set to null

4. QUANTITY EXTRACTION (CRITICAL):
   - Extract the ACTUAL ORDER QUANTITY from the dedicated quantity column
   - DO NOT confuse the quantity with pack sizes mentioned in the description
   - Pack size formats like "6/Cs", "12/Pk", "4/1 GAL" mean units PER case/pack, NOT the order quantity
   - Example: "3    818 Tequila Reposado 6/Cs    $45.00    $135.00" → qty: 3 (cases ordered), NOT 6
   - The quantity is usually in its own column, separate from the description
   - If uncertain, the line total ÷ unit price = actual quantity

5. BOTTLE/PACKAGE SIZE (CRITICAL FOR RECIPES):
   - ALWAYS include bottle sizes (750mL, 1L, 375mL, etc.) in the description if visible
   - Common bottle sizes: 750mL, 1L, 1.75L, 375mL, 50mL (mini)
   - For wine/spirits: bottle size is usually 750mL if not specified
   - Package sizes like "4/1 GAL", "6/750mL", "12/12oz" are critical - preserve exactly
   - Examples:
     * "Grey Goose Vodka 750mL 6/Cs" ✓ (has bottle size 750mL and pack 6/Cs)
     * "Grey Goose Vodka 6/Cs" ✗ (missing bottle size - add 750mL if wine/spirits)

6. LINE ITEMS:
   - Extract ALL line items from the invoice (food, beverage, construction materials, equipment, services, etc.)
   - Look for "Ship To:", "Deliver To:", "Location:", "Job Site:", "Project:", or similar fields to identify the delivery location
   - For each line item, extract the vendor's item code/SKU if visible (could be numeric "12345", alphanumeric "SYS-BEEF-001", or construction codes like "8104-CONCRETE")
   - Include the COMPLETE item description exactly as it appears on the invoice - don't truncate or summarize
   - For construction/pre-opening invoices: preserve categories like "General Requirements", "Finishes", "Electrical", etc. in the description
   - If no item code is visible, set itemCode to null

FORMATTING RULES:
- Dates must be in YYYY-MM-DD format
- All amounts should be numbers (not strings)
- Confidence should be 0.0-1.0 (1.0 = very confident, 0.0 = not confident)
- For each line item, include quantity, unit price, and line total
- If you cannot extract a field with confidence, set confidence < 0.7
- If no delivery location is found, set deliveryLocation to null
- Pay special attention to multi-page invoices - extract ALL pages

Return ONLY the JSON object, no other text.`;

export interface OCRResult {
  invoice?: RawOCRInvoice;
  invoices?: RawOCRInvoice[];
  rawResponse: string;
}

function isRequestTooLargeError(e: any): boolean {
  const msg = typeof e?.message === 'string' ? e.message : '';
  return (
    e?.status === 413 ||
    msg.includes('request_too_large') ||
    msg.includes('Request exceeds the maximum size')
  );
}

function stripJsonFromClaudeResponse(rawResponse: string): string {
  let jsonText = rawResponse.trim();

  // Handle multiple JSON code blocks - take the first one
  const jsonMatch = jsonText.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  } else if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  return jsonText.trim();
}

function parseClaudeInvoiceJson(jsonText: string, rawResponseForLogs: string): {
  invoice?: RawOCRInvoice;
  invoices?: RawOCRInvoice[];
} {
  if (!jsonText || jsonText.length === 0) {
    console.error('[OCR Error] Claude returned empty response');
    console.error('Raw response:', rawResponseForLogs);
    throw new Error('Claude returned empty response. Please try uploading the invoice again.');
  }

  let parsedData: any;
  try {
    parsedData = JSON.parse(jsonText);
  } catch (parseError) {
    console.error('[OCR Error] Failed to parse Claude response as JSON');
    console.error('JSON text:', jsonText);
    console.error('Raw response:', rawResponseForLogs.substring(0, 2000));
    console.error('Parse error:', parseError);
    throw new Error('Failed to parse invoice data from Claude. The response may be malformed. Please try again.');
  }

  if (parsedData?.invoices && Array.isArray(parsedData.invoices)) {
    return { invoices: parsedData.invoices as RawOCRInvoice[] };
  }
  return { invoice: parsedData as RawOCRInvoice };
}

function mergeInvoicesAcrossChunks(invoices: RawOCRInvoice[]): RawOCRInvoice[] {
  const byKey = new Map<string, RawOCRInvoice>();

  const norm = (s: any) => String(s ?? '').trim().toLowerCase();
  const invoiceKey = (inv: RawOCRInvoice, fallbackIndex: number) => {
    const vendor = norm((inv as any).vendor);
    const invoiceNumber = norm((inv as any).invoiceNumber);
    if (!vendor || !invoiceNumber) return `unknown:${fallbackIndex}`;
    return `${vendor}::${invoiceNumber}`;
  };

  invoices.forEach((inv, idx) => {
    const key = invoiceKey(inv, idx);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...(inv as any),
        lineItems: Array.isArray((inv as any).lineItems) ? (inv as any).lineItems : [],
      } as any);
      return;
    }

    // Merge header fields (prefer existing unless missing)
    const merged: any = existing;
    const src: any = inv;

    merged.vendor = merged.vendor || src.vendor;
    merged.invoiceNumber = merged.invoiceNumber || src.invoiceNumber;
    merged.invoiceDate = merged.invoiceDate || src.invoiceDate;
    merged.dueDate = merged.dueDate || src.dueDate;
    merged.paymentTerms = merged.paymentTerms || src.paymentTerms;
    merged.totalAmount = merged.totalAmount ?? src.totalAmount;

    // Prefer higher confidence if present
    if (typeof src.confidence === 'number') {
      merged.confidence = Math.max(Number(merged.confidence || 0), src.confidence);
    }

    // Delivery location: prefer higher confidence if both exist
    if (src.deliveryLocation && !merged.deliveryLocation) {
      merged.deliveryLocation = src.deliveryLocation;
    } else if (src.deliveryLocation && merged.deliveryLocation) {
      const a = Number(merged.deliveryLocation.confidence || 0);
      const b = Number(src.deliveryLocation.confidence || 0);
      if (b > a) merged.deliveryLocation = src.deliveryLocation;
    }

    // Merge line items
    const aItems = Array.isArray(merged.lineItems) ? merged.lineItems : [];
    const bItems = Array.isArray(src.lineItems) ? src.lineItems : [];
    merged.lineItems = [...aItems, ...bItems];

    byKey.set(key, merged as any);
  });

  return Array.from(byKey.values());
}

/**
 * Extracts invoice data from an image using Claude Sonnet vision API
 */
export async function extractInvoiceWithClaude(
  imageData: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<OCRResult> {
  const base64Image = imageData.toString('base64');

  // Normalize MIME type: image/jpg -> image/jpeg
  const normalizedMimeType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16384, // Maximum for large invoices (100+ line items)
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: normalizedMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: OCR_PROMPT,
          },
        ],
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const rawResponse = textContent.text;

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = rawResponse.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  // Validate JSON is not empty
  if (!jsonText || jsonText.length === 0) {
    console.error('[OCR Error] Claude returned empty response');
    console.error('Raw response:', rawResponse);
    throw new Error('Claude returned empty response. Please try uploading the invoice again.');
  }

  let invoice: RawOCRInvoice;
  try {
    invoice = JSON.parse(jsonText);
  } catch (parseError) {
    console.error('[OCR Error] Failed to parse Claude response as JSON');
    console.error('JSON text:', jsonText);
    console.error('Raw response:', rawResponse);
    console.error('Parse error:', parseError);
    throw new Error('Failed to parse invoice data from Claude. The response may be malformed. Please try again.');
  }

  return {
    invoice,
    rawResponse,
  };
}

/**
 * Extracts invoice data from a PDF using Claude document API
 */
export async function extractInvoiceFromPDF(
  pdfData: Buffer
): Promise<OCRResult> {
  try {
    return await extractInvoiceFromPDFSingle(pdfData, '');
  } catch (e: any) {
    if (!isRequestTooLargeError(e)) throw e;
    console.warn('[OCR] Claude request too large for PDF; chunking by pages', {
      bytes: pdfData.length,
    });
    return await extractInvoiceFromPDFChunked(pdfData);
  }
}

async function extractInvoiceFromPDFSingle(pdfData: Buffer, contextNote: string): Promise<OCRResult> {
  const base64PDF = pdfData.toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16384, // Maximum for large invoices (100+ line items)
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64PDF,
            },
          },
          {
            type: 'text',
            text: contextNote
              ? `${contextNote}\n\n${OCR_PROMPT}`
              : OCR_PROMPT,
          },
        ],
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const rawResponse = textContent.text;
  const jsonText = stripJsonFromClaudeResponse(rawResponse);
  const parsed = parseClaudeInvoiceJson(jsonText, rawResponse);

  return {
    ...parsed,
    rawResponse,
  };
}

async function extractInvoiceFromPDFChunked(pdfData: Buffer): Promise<OCRResult> {
  const src = await PDFDocument.load(pdfData);
  const totalPages = src.getPageCount();

  // Start optimistic; reduce if Claude rejects with 413.
  let pagesPerChunk = 10;
  const allInvoices: RawOCRInvoice[] = [];
  const responses: string[] = [];

  let start = 0;
  while (start < totalPages) {
    let end = Math.min(start + pagesPerChunk, totalPages);

    while (true) {
      const chunkBytes = await buildPdfChunk(src, start, end);
      const context = `NOTE: This is pages ${start + 1}-${end} of ${totalPages} of the same PDF. Extract invoices from ONLY these pages. If an invoice continues across pages, keep the SAME invoiceNumber and include any additional line items you see on these pages. Return JSON only.`;

      try {
        const chunkRes = await extractInvoiceFromPDFSingle(Buffer.from(chunkBytes), context);
        responses.push(chunkRes.rawResponse);

        const chunkInvoices = chunkRes.invoices
          ? chunkRes.invoices
          : chunkRes.invoice
            ? [chunkRes.invoice]
            : [];

        allInvoices.push(...chunkInvoices);
        break;
      } catch (e: any) {
        if (!isRequestTooLargeError(e)) throw e;

        const span = end - start;
        if (span <= 1) throw e;

        // Reduce chunk size and retry from same start.
        const newSpan = Math.max(1, Math.floor(span / 2));
        end = start + newSpan;
        console.warn('[OCR] Reducing PDF chunk size after 413', {
          startPage: start + 1,
          attemptedEndPage: start + span,
          newEndPage: end,
        });
      }
    }

    start = end;
  }

  const merged = mergeInvoicesAcrossChunks(allInvoices);
  const rawResponse = responses.slice(0, 3).join('\n\n---\n\n') + (responses.length > 3 ? `\n\n---\n\n[${responses.length - 3} more chunk responses truncated]` : '');

  if (merged.length > 1) return { invoices: merged, rawResponse };
  return { invoice: merged[0], rawResponse };
}

async function buildPdfChunk(src: PDFDocument, start: number, endExclusive: number): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pageIndices = Array.from({ length: endExclusive - start }, (_, i) => start + i);
  const pages = await out.copyPages(src, pageIndices);
  pages.forEach((p) => out.addPage(p));
  return await out.save();
}
