import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

/**
 * POST /api/items/suggest-gl
 * AI-powered GL account suggestions based on item description
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();
    const body = await request.json();
    const { description, category } = body;

    if (!description) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    // Get user's organization
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: orgUser } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.user.id)
      .eq('is_active', true)
      .single();

    if (!orgUser?.organization_id) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    // Get GL account suggestions based on description and category
    // We'll use a simplified matching logic here since we don't have an item_id yet
    const desc = description.toLowerCase();

    // Determine likely GL section based on keywords
    let section = 'COGS'; // Default for restaurant items
    let categoryMatch = category?.toLowerCase() || '';

    // Build keyword-based query
    const keywords = [
      desc.includes('wine') || desc.includes('beer') || desc.includes('liquor') || desc.includes('spirit'),
      desc.includes('food') || desc.includes('meat') || desc.includes('produce') || desc.includes('cheese'),
      desc.includes('supplies') || desc.includes('packaging') || desc.includes('box') || desc.includes('bag'),
      desc.includes('labor') || desc.includes('wage') || desc.includes('salary'),
    ];

    // Query GL accounts with keyword matching
    const { data: suggestions, error } = await supabase
      .from('gl_accounts')
      .select('id, external_code, name, section')
      .eq('org_id', orgUser.organization_id)
      .eq('is_active', true)
      .eq('is_summary', false)
      .or(`section.eq.COGS,section.eq.Opex`)
      .order('display_order')
      .limit(10);

    if (error) {
      console.error('Error fetching GL accounts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GL accounts', details: error.message },
        { status: 500 }
      );
    }

    // Score and rank suggestions
    const scoredSuggestions = (suggestions || []).map((gl) => {
      let score = 0;
      const glName = gl.name.toLowerCase();
      const glSection = gl.section;

      // Keyword matching in GL account name
      if (desc.includes('wine') || desc.includes('spirit') || desc.includes('liquor')) {
        if (glName.includes('bev') || glName.includes('liquor') || glName.includes('wine')) score += 10;
        if (glSection === 'COGS') score += 5;
      }

      if (desc.includes('food') || desc.includes('meat') || desc.includes('produce')) {
        if (glName.includes('food') || glName.includes('produce') || glName.includes('meat')) score += 10;
        if (glSection === 'COGS') score += 5;
      }

      if (desc.includes('packaging') || desc.includes('supplies') || desc.includes('box')) {
        if (glName.includes('supplies') || glName.includes('packaging') || glName.includes('operat')) score += 10;
        if (glSection === 'Opex') score += 5;
      }

      // Default COGS boost for food/beverage items
      if (glSection === 'COGS') score += 2;

      return {
        ...gl,
        confidence: score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low',
        score,
      };
    });

    // Sort by score descending
    scoredSuggestions.sort((a, b) => b.score - a.score);

    // Suggest category based on GL section of top suggestion
    const suggestedCategory = scoredSuggestions[0]?.section || 'COGS';

    return NextResponse.json({
      suggestions: scoredSuggestions.slice(0, 5),
      suggestedCategory,
    });
  });
}
