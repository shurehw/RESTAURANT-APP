import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

interface StatementLine {
  id: string;
  line_date: string;
  invoice_number: string | null;
  description: string;
  amount: number;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  order_date: string;
  total: number;
  items: string[];
  received_at: string | null;
  receipt_total: number | null;
}

/**
 * AI-assisted matching for vendor statement lines that couldn't be matched by rules
 * Uses Claude to intelligently match based on description, date proximity, and item overlap
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':ai-match-statement');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { statement_line_id } = body;

    if (!statement_line_id) {
      throw { status: 400, code: 'NO_LINE_ID', message: 'statement_line_id is required' };
    }

    const supabase = await createClient();

    // Get the statement line
    const { data: line, error: lineError } = await supabase
      .from('vendor_statement_lines')
      .select(`
        id,
        line_date,
        invoice_number,
        description,
        amount,
        vendor_statement_id,
        vendor_statements!inner (
          vendor_id,
          venue_id
        )
      `)
      .eq('id', statement_line_id)
      .single();

    if (lineError || !line) {
      throw { status: 404, code: 'LINE_NOT_FOUND', message: 'Statement line not found' };
    }

    const venueId = (line.vendor_statements as any).venue_id;
    const vendorId = (line.vendor_statements as any).vendor_id;

    assertVenueAccess(venueId, venueIds);

    // Get unmatched POs from this vendor (within ±30 days of line date)
    const lineDate = new Date(line.line_date);
    const startDate = new Date(lineDate);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(lineDate);
    endDate.setDate(endDate.getDate() + 30);

    const { data: unmatchedPOs, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        order_number,
        order_date,
        total_amount,
        purchase_order_items (
          item_id,
          items (
            item_name
          )
        ),
        receipts (
          received_at,
          total_amount
        )
      `)
      .eq('vendor_id', vendorId)
      .eq('venue_id', venueId)
      .gte('order_date', startDate.toISOString().split('T')[0])
      .lte('order_date', endDate.toISOString().split('T')[0])
      .order('order_date', { ascending: false })
      .limit(10);

    if (poError) throw poError;

    if (!unmatchedPOs || unmatchedPOs.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No purchase orders found within matching window',
        matched: false,
      });
    }

    // Format POs for AI
    const formattedPOs = unmatchedPOs.map((po: any) => {
      const receipt = po.receipts?.[0];
      const items = po.purchase_order_items?.map((item: any) => item.items?.item_name).filter(Boolean) || [];

      return {
        id: po.id,
        po_number: po.order_number,
        order_date: po.order_date,
        total: po.total_amount,
        items,
        received_at: receipt?.received_at || null,
        receipt_total: receipt?.total_amount || null,
      };
    });

    // AI matching prompt
    const prompt = `You are an expert at matching vendor invoice lines to purchase orders.

**Statement Line to Match:**
- Date: ${line.line_date}
- Invoice #: ${line.invoice_number || 'N/A'}
- Description: ${line.description}
- Amount: $${line.amount}

**Candidate Purchase Orders (within ±30 days):**
${formattedPOs.map((po, idx) => `
${idx + 1}. PO #${po.po_number}
   - Order Date: ${po.order_date}
   - PO Total: $${po.total}
   ${po.received_at ? `- Received: ${po.received_at}` : '- Not yet received'}
   ${po.receipt_total ? `- Receipt Total: $${po.receipt_total}` : ''}
   - Items: ${po.items.length > 0 ? po.items.join(', ') : 'No items listed'}
`).join('\n')}

**Task:**
Analyze the statement line description and determine which PO (if any) it matches.

**Consider:**
1. Date proximity (closer is better)
2. Amount similarity (±10% tolerance is acceptable)
3. Item/description overlap (does the description mention items from the PO?)
4. Invoice number patterns

**Response Format (JSON only):**
{
  "matched": true or false,
  "po_id": "UUID of matched PO" or null,
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why this match was chosen"
}

**Guidelines:**
- confidence >= 0.85: Very confident match
- confidence 0.70-0.84: Probable match, should review
- confidence < 0.70: Low confidence, manual review required
- If no good match exists, set matched: false

Return ONLY the JSON object.`;

    // Call Claude for AI matching
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    let jsonText = textContent.text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const aiResult = JSON.parse(jsonText);

    // If AI found a match, update the statement line
    if (aiResult.matched && aiResult.po_id) {
      const { error: updateError } = await supabase
        .from('vendor_statement_lines')
        .update({
          matched_po_id: aiResult.po_id,
          matched: true,
          match_method: 'ai_suggested',
          match_confidence: aiResult.confidence,
          requires_review: aiResult.confidence < 0.85,
          notes: aiResult.reasoning,
        })
        .eq('id', statement_line_id);

      if (updateError) throw updateError;

      // Calculate variance
      await supabase.rpc('calculate_statement_variance', { p_statement_line_id: statement_line_id });

      const matchedPO = formattedPOs.find(po => po.id === aiResult.po_id);

      return NextResponse.json({
        success: true,
        matched: true,
        po_id: aiResult.po_id,
        po_number: matchedPO?.po_number,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
        requires_review: aiResult.confidence < 0.85,
      });
    }

    // No match found
    return NextResponse.json({
      success: true,
      matched: false,
      confidence: aiResult.confidence || 0,
      reasoning: aiResult.reasoning || 'No suitable match found',
    });
  });
}
