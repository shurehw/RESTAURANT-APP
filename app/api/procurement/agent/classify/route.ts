/**
 * Manual Item Classification Endpoint
 *
 * POST /api/procurement/agent/classify — Trigger AI classification
 *
 * Classifies unclassified items for an org into Binyan entity codes.
 * Can also reclassify specific items.
 *
 * Auth: resolveContext() (user session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import {
  getUnclassifiedItems,
  upsertItemClassifications,
  getItemClassifications,
} from '@/lib/database/procurement-agent';
import { classifyItems } from '@/lib/ai/procurement-classifier';

export async function POST(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const itemIds: string[] | undefined = body.item_ids;
    const forceReclassify: boolean = body.force_reclassify || false;

    let itemsToClassify: Array<{ id: string; name: string; category: string }>;

    if (itemIds && itemIds.length > 0) {
      // Classify specific items
      const { getServiceClient } = await import('@/lib/supabase/service');
      const supabase = getServiceClient();
      const { data: items } = await (supabase as any)
        .from('items')
        .select('id, name, category')
        .in('id', itemIds)
        .eq('organization_id', ctx.orgId);

      itemsToClassify = items || [];
    } else if (forceReclassify) {
      // Reclassify all items
      const { getServiceClient } = await import('@/lib/supabase/service');
      const supabase = getServiceClient();
      const { data: items } = await (supabase as any)
        .from('items')
        .select('id, name, category')
        .eq('organization_id', ctx.orgId)
        .eq('is_active', true);

      itemsToClassify = items || [];
    } else {
      // Only unclassified items
      itemsToClassify = await getUnclassifiedItems(ctx.orgId);
    }

    if (itemsToClassify.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No items to classify',
        classified: 0,
      });
    }

    // Run classification
    const classifications = await classifyItems(
      itemsToClassify.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
      }))
    );

    // Store results — add classification_source since classifyItems returns raw results
    const { count, error } = await upsertItemClassifications(
      ctx.orgId,
      classifications.map((c) => ({
        ...c,
        classification_source: 'ai' as const,
      }))
    );

    if (error) {
      return NextResponse.json(
        { error: `Classification stored failed: ${error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      classified: count,
      classifications: classifications.map((c) => ({
        item_id: c.item_id,
        entity_code: c.entity_code,
        confidence: c.confidence,
        reason: c.reason,
      })),
    });
  } catch (error: any) {
    console.error('[procurement-classify] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Classification failed' },
      { status: 500 }
    );
  }
}

/**
 * GET — View current classifications for the org
 */
export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const classifications = await getItemClassifications(ctx.orgId);

    // Group by entity code for summary
    const summary: Record<string, number> = {};
    for (const c of classifications) {
      summary[c.entity_code] = (summary[c.entity_code] || 0) + 1;
    }

    return NextResponse.json({
      total: classifications.length,
      by_entity: summary,
      classifications,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch classifications' },
      { status: 500 }
    );
  }
}
