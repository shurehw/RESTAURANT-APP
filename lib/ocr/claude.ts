/**
 * lib/ocr/claude.ts
 * Invoice OCR using Claude Sonnet vision API
 */

import Anthropic from '@anthropic-ai/sdk';
import { RawOCRInvoice } from './normalize';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const OCR_PROMPT = `You are an expert at extracting structured data from restaurant and construction invoices.

Analyze this invoice image and extract the following information in JSON format:

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
  invoice: RawOCRInvoice;
  rawResponse: string;
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

  // Extract JSON from response (handle markdown code blocks and multiple JSON objects)
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

  // Validate JSON is not empty
  if (!jsonText || jsonText.length === 0) {
    console.error('[OCR Error] Claude returned empty response for PDF');
    console.error('Raw response:', rawResponse);
    throw new Error('Claude returned empty response. Please try uploading the invoice again.');
  }

  let invoice: RawOCRInvoice;
  try {
    invoice = JSON.parse(jsonText);
  } catch (parseError) {
    console.error('[OCR Error] Failed to parse Claude PDF response as JSON');
    console.error('JSON text:', jsonText);
    console.error('Raw response:', rawResponse.substring(0, 1000));
    console.error('Parse error:', parseError);
    throw new Error('Failed to parse invoice data from Claude. The response may be malformed. Please try again.');
  }

  return {
    invoice,
    rawResponse,
  };
}
