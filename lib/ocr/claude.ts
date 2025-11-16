/**
 * lib/ocr/claude.ts
 * Invoice OCR using Claude Sonnet vision API
 */

import Anthropic from '@anthropic-ai/sdk';
import { RawOCRInvoice } from './normalize';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const OCR_PROMPT = `You are an expert at extracting structured data from restaurant invoices.

Analyze this invoice image and extract the following information in JSON format:

{
  "vendor": "Vendor company name",
  "invoiceNumber": "Invoice number",
  "invoiceDate": "Date in YYYY-MM-DD format",
  "dueDate": "Due date in YYYY-MM-DD format (if present)",
  "totalAmount": 0.00,
  "confidence": 0.95,
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

IMPORTANT:
- Extract ALL line items from the invoice
- For each line item, extract the vendor's item code/SKU if visible (usually a number like "12345" or code like "SYS-BEEF-001")
- Include the complete item description as it appears on the invoice
- Use exact vendor name as printed on the invoice
- Dates must be in YYYY-MM-DD format
- All amounts should be numbers (not strings)
- Confidence should be 0.0-1.0 (1.0 = very confident, 0.0 = not confident)
- For each line item, include quantity, unit price, and line total
- If you cannot extract a field with confidence, set confidence < 0.7
- If no item code is visible, set itemCode to null

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

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
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

  const invoice: RawOCRInvoice = JSON.parse(jsonText);

  return {
    invoice,
    rawResponse,
  };
}

/**
 * Extracts invoice data from a PDF using Claude vision API
 */
export async function extractInvoiceFromPDF(
  pdfData: Buffer
): Promise<OCRResult> {
  // For PDFs, we need to convert to images first
  // This is a placeholder - in production you'd use pdf2image or similar
  throw new Error('PDF extraction not yet implemented. Please convert PDF to image first.');
}
