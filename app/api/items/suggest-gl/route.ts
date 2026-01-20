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

    // Suggest category and subcategory based on description keywords
    let suggestedCategory = 'food';
    let suggestedSubcategory = '';

    // Liquor/Spirits detection
    if (desc.includes('tequila') || desc.includes('patron') || desc.includes('casamigos')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Tequila';
    } else if (desc.includes('mezcal') || desc.includes('conejos')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Mezcal';
    } else if (desc.includes('vodka') || desc.includes('grey goose') || desc.includes('titos')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Vodka';
    } else if (desc.includes('whiskey') || desc.includes('bourbon') || desc.includes('scotch') || desc.includes('rye')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = desc.includes('bourbon') ? 'Bourbon' : desc.includes('scotch') ? 'Scotch' : 'Whiskey';
    } else if (desc.includes('gin')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Gin';
    } else if (desc.includes('rum')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Rum';
    } else if (desc.includes('cognac') || desc.includes('brandy')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Cognac/Brandy';
    } else if (desc.includes('liqueur') || desc.includes('amaretto') || desc.includes('kahlua')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Liqueur';
    } else if (desc.includes('bitters') || desc.includes('angostura') || desc.includes('aperol') || desc.includes('campari')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Bitters/Aperitifs';
    }

    // Wine detection
    else if (desc.includes('wine') || desc.includes('cabernet') || desc.includes('chardonnay') || desc.includes('pinot') || desc.includes('merlot') || desc.includes('sauvignon')) {
      suggestedCategory = 'wine';
      if (desc.includes('red') || desc.includes('cabernet') || desc.includes('merlot') || desc.includes('pinot noir')) {
        suggestedSubcategory = 'Red Wine';
      } else if (desc.includes('white') || desc.includes('chardonnay') || desc.includes('sauvignon blanc') || desc.includes('pinot grigio')) {
        suggestedSubcategory = 'White Wine';
      } else if (desc.includes('sparkling') || desc.includes('champagne') || desc.includes('prosecco')) {
        suggestedSubcategory = 'Sparkling Wine';
      } else if (desc.includes('rose') || desc.includes('rosé')) {
        suggestedSubcategory = 'Rosé';
      }
    }

    // Beer detection
    else if (desc.includes('beer') || desc.includes('lager') || desc.includes('ipa') || desc.includes('ale') || desc.includes('stout')) {
      suggestedCategory = 'beer';
      if (desc.includes('ipa')) suggestedSubcategory = 'IPA';
      else if (desc.includes('lager')) suggestedSubcategory = 'Lager';
      else if (desc.includes('stout')) suggestedSubcategory = 'Stout';
      else if (desc.includes('ale')) suggestedSubcategory = 'Ale';
    }

    // Food categories
    else if (desc.includes('meat') || desc.includes('beef') || desc.includes('pork') || desc.includes('chicken')) {
      suggestedCategory = 'meat';
      if (desc.includes('beef')) suggestedSubcategory = 'Beef';
      else if (desc.includes('pork')) suggestedSubcategory = 'Pork';
      else if (desc.includes('chicken')) suggestedSubcategory = 'Chicken';
    } else if (desc.includes('seafood') || desc.includes('fish') || desc.includes('salmon') || desc.includes('shrimp')) {
      suggestedCategory = 'seafood';
    } else if (desc.includes('produce') || desc.includes('lettuce') || desc.includes('tomato') || desc.includes('onion')) {
      suggestedCategory = 'produce';
    } else if (desc.includes('dairy') || desc.includes('cheese') || desc.includes('milk') || desc.includes('cream')) {
      suggestedCategory = 'dairy';
    }

    // Supplies
    else if (desc.includes('packaging') || desc.includes('box') || desc.includes('bag') || desc.includes('container')) {
      suggestedCategory = 'packaging';
    } else if (desc.includes('disposable') || desc.includes('cup') || desc.includes('plate') || desc.includes('utensil')) {
      suggestedCategory = 'disposables';
    }

    return NextResponse.json({
      suggestions: scoredSuggestions.slice(0, 5),
      suggestedCategory,
      suggestedSubcategory,
    });
  });
}
