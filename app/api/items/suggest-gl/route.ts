import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

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

    // Get user ID from cookie (our custom auth) or Supabase session
    const cookieStore = await cookies();
    let userId: string | null = null;

    // Try Supabase session first
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      // Fallback to custom user_id cookie
      const userIdCookie = cookieStore.get('user_id');
      userId = userIdCookie?.value || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient();

    // Get user's organization
    const { data: orgUsers } = await adminClient
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    // Use first organization if user belongs to multiple
    const orgUser = orgUsers[0];

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

    // Query GL accounts with keyword matching using admin client
    const { data: suggestions, error } = await adminClient
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

      // === BEVERAGE GL MATCHING ===
      // Wine - expanded patterns for Spanish/Italian wines
      if (desc.includes('wine') || desc.includes('cabernet') || desc.includes('chardonnay') || desc.includes('pinot') || desc.includes('merlot') || desc.includes('sauvignon') || desc.includes('champagne') || desc.includes('prosecco') || desc.includes('ribera') || desc.includes('rioja') || desc.includes('chianti') || desc.includes('barolo') || desc.includes('brunello') || desc.includes('bordeaux') || desc.includes('burgundy') || desc.includes('cava') || desc.includes('tempranillo') || desc.includes('sangiovese') || desc.includes('nebbiolo')) {
        if (glName.includes('wine')) score += 15;
        else if (glName.includes('bev') || glName.includes('liquor')) score += 8;
        if (glSection === 'COGS') score += 5;
      }

      // Liquor/Spirits
      else if (desc.includes('vodka') || desc.includes('whiskey') || desc.includes('whisky') || desc.includes('tequila') || desc.includes('gin') || desc.includes('rum') || desc.includes('bourbon') || desc.includes('scotch') || desc.includes('cognac') || desc.includes('brandy')) {
        if (glName.includes('liquor') || glName.includes('spirit')) score += 15;
        else if (glName.includes('bev')) score += 8;
        if (glSection === 'COGS') score += 5;
      }

      // Beer
      else if (desc.includes('beer') || desc.includes('lager') || desc.includes('ipa') || desc.includes('stout') || desc.includes('ale')) {
        if (glName.includes('beer')) score += 15;
        else if (glName.includes('bev') || glName.includes('liquor')) score += 8;
        if (glSection === 'COGS') score += 5;
      }

      // Non-alcoholic beverages
      else if (desc.includes('soda') || desc.includes('juice') || desc.includes('water') || desc.includes('red bull') || desc.includes('coffee') || desc.includes('tea')) {
        if (glName.includes('non') || glName.includes('na bev') || glName.includes('soft drink')) score += 15;
        else if (glName.includes('bev')) score += 10;
        if (glSection === 'COGS') score += 5;
      }

      // === FOOD GL MATCHING ===
      // Meat
      else if (desc.includes('meat') || desc.includes('beef') || desc.includes('pork') || desc.includes('chicken') || desc.includes('lamb')) {
        if (glName.includes('meat') || glName.includes('protein')) score += 15;
        else if (glName.includes('food')) score += 8;
        if (glSection === 'COGS') score += 5;
      }

      // Seafood
      else if (desc.includes('seafood') || desc.includes('fish') || desc.includes('salmon') || desc.includes('shrimp') || desc.includes('lobster')) {
        if (glName.includes('seafood') || glName.includes('fish')) score += 15;
        else if (glName.includes('food') || glName.includes('protein')) score += 8;
        if (glSection === 'COGS') score += 5;
      }

      // Produce
      else if (desc.includes('produce') || desc.includes('vegetable') || desc.includes('fruit') || desc.includes('lettuce') || desc.includes('tomato')) {
        if (glName.includes('produce') || glName.includes('vegetable')) score += 15;
        else if (glName.includes('food')) score += 8;
        if (glSection === 'COGS') score += 5;
      }

      // Dairy
      else if (desc.includes('dairy') || desc.includes('cheese') || desc.includes('milk') || desc.includes('cream') || desc.includes('butter')) {
        if (glName.includes('dairy')) score += 15;
        else if (glName.includes('food')) score += 8;
        if (glSection === 'COGS') score += 5;
      }

      // General food
      else if (desc.includes('food') || desc.includes('bread') || desc.includes('pasta')) {
        if (glName.includes('food') || glName.includes('kitchen')) score += 10;
        if (glSection === 'COGS') score += 5;
      }

      // === SUPPLIES GL MATCHING ===
      else if (desc.includes('packaging') || desc.includes('supplies') || desc.includes('box') || desc.includes('bag') || desc.includes('disposable')) {
        if (glName.includes('supplies') || glName.includes('packaging') || glName.includes('operat')) score += 10;
        if (glSection === 'Opex') score += 5;
      }

      // Default COGS boost for unmatched items (likely food/beverage)
      if (score === 0 && glSection === 'COGS') score += 2;

      return {
        ...gl,
        confidence: score >= 15 ? 'high' : score >= 8 ? 'medium' : 'low',
        score,
      };
    });

    // Sort by score descending
    scoredSuggestions.sort((a, b) => b.score - a.score);

    // Suggest category and subcategory based on description keywords
    let suggestedCategory = 'food';
    let suggestedSubcategory = '';

    // === LIQUOR/SPIRITS DETECTION ===
    // Check liqueur FIRST before ale to avoid false positive from "RoyALE"
    if (desc.includes('liqueur') || desc.includes('amaretto') || desc.includes('kahlua') || desc.includes('baileys') || desc.includes('frangelico') || desc.includes('st germain') || desc.includes('cointreau') || desc.includes('grand marnier')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Liqueur';
    }
    // Tequila
    else if (desc.includes('tequila') || desc.includes('patron') || desc.includes('casamigos') || desc.includes('don julio') || desc.includes('herradura') || desc.includes('espolon') || desc.includes('clase azul') || desc.includes('reposado') || desc.includes('añejo') || desc.includes('anejo')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Tequila';
    }
    // Mezcal
    else if (desc.includes('mezcal') || desc.includes('conejos')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Mezcal';
    }
    // Vodka
    else if (desc.includes('vodka') || desc.includes('grey goose') || desc.includes('titos') || desc.includes('belvedere') || desc.includes('absolut') || desc.includes('ketel one') || desc.includes('ciroc')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Vodka';
    }
    // Whiskey/Bourbon/Scotch
    else if (desc.includes('whiskey') || desc.includes('whisky') || desc.includes('bourbon') || desc.includes('scotch') || desc.includes('rye') || desc.includes('jameson') || desc.includes('jack daniel') || desc.includes('makers mark') || desc.includes('glenfiddich') || desc.includes('glenlivet') || desc.includes('macallan') || desc.includes('johnnie walker')) {
      suggestedCategory = 'liquor';
      if (desc.includes('bourbon') || desc.includes('makers mark') || desc.includes('buffalo trace') || desc.includes('woodford')) {
        suggestedSubcategory = 'Bourbon';
      } else if (desc.includes('scotch') || desc.includes('glenfiddich') || desc.includes('glenlivet') || desc.includes('macallan') || desc.includes('johnnie walker')) {
        suggestedSubcategory = 'Scotch';
      } else if (desc.includes('rye')) {
        suggestedSubcategory = 'Rye Whiskey';
      } else if (desc.includes('jameson') || desc.includes('irish')) {
        suggestedSubcategory = 'Irish Whiskey';
      } else {
        suggestedSubcategory = 'Whiskey';
      }
    }
    // Gin
    else if ((desc.includes('gin') && !desc.includes('ginger')) || desc.includes('tanqueray') || desc.includes('hendricks') || desc.includes('bombay')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Gin';
    }
    // Rum
    else if (desc.includes('rum') || desc.includes('bacardi') || desc.includes('captain morgan') || desc.includes('kraken') || desc.includes('goslings')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Rum';
    }
    // Cognac/Brandy
    else if (desc.includes('cognac') || desc.includes('brandy') || desc.includes('hennessy') || desc.includes('remy martin') || desc.includes('courvoisier')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Cognac/Brandy';
    }
    // Bitters/Aperitifs/Amaro
    else if (desc.includes('bitters') || desc.includes('angostura') || desc.includes('aperol') || desc.includes('campari') || desc.includes('amaro') || desc.includes('fernet') || desc.includes('chartreuse') || desc.includes('peychaud')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Bitters/Aperitifs';
    }
    // Vermouth
    else if (desc.includes('vermouth') || desc.includes('dolin') || desc.includes('carpano') || desc.includes('noilly prat')) {
      suggestedCategory = 'liquor';
      suggestedSubcategory = 'Vermouth';
    }

    // === WINE DETECTION ===
    else if (desc.includes('wine') || desc.includes('champagne') || desc.includes('cabernet') || desc.includes('chardonnay') || desc.includes('pinot') || desc.includes('merlot') || desc.includes('sauvignon') || desc.includes('zinfandel') || desc.includes('syrah') || desc.includes('shiraz') || desc.includes('malbec') || desc.includes('riesling') || desc.includes('chianti') || desc.includes('rioja') || desc.includes('bordeaux') || desc.includes('burgundy') || desc.includes('prosecco') || desc.includes('ribera') || desc.includes('barolo') || desc.includes('brunello') || desc.includes('cava') || desc.includes('tempranillo') || desc.includes('sangiovese') || desc.includes('nebbiolo') || desc.includes('grenache') || desc.includes('petite sirah')) {
      suggestedCategory = 'wine';
      // Red wine
      if (desc.includes('red') || desc.includes('cabernet') || desc.includes('merlot') || desc.includes('pinot noir') || desc.includes('zinfandel') || desc.includes('syrah') || desc.includes('shiraz') || desc.includes('malbec') || desc.includes('chianti') || desc.includes('rioja') || desc.includes('ribera') || desc.includes('tempranillo') || desc.includes('sangiovese') || desc.includes('nebbiolo') || desc.includes('grenache') || desc.includes('petite sirah')) {
        suggestedSubcategory = 'Red Wine';
      }
      // White wine
      else if (desc.includes('white') || desc.includes('chardonnay') || desc.includes('sauvignon blanc') || desc.includes('pinot grigio') || desc.includes('pinot gris') || desc.includes('riesling') || desc.includes('moscato')) {
        suggestedSubcategory = 'White Wine';
      }
      // Sparkling
      else if (desc.includes('sparkling') || desc.includes('champagne') || desc.includes('prosecco') || desc.includes('cava') || desc.includes('brut')) {
        suggestedSubcategory = 'Sparkling Wine';
      }
      // Rosé
      else if (desc.includes('rose') || desc.includes('rosé') || desc.includes('pink')) {
        suggestedSubcategory = 'Rosé';
      }
      // Default to Red if no subtype found (most common)
      else {
        suggestedSubcategory = 'Red Wine';
      }
    }

    // === BEER DETECTION ===
    else if (desc.includes('beer') || desc.includes('lager') || desc.includes('ipa') || desc.includes('stout') || desc.includes('pilsner') || desc.includes('porter') || /\bale\b/i.test(description) || desc.includes('bud light') || desc.includes('coors') || desc.includes('stella') || desc.includes('corona') || desc.includes('heineken') || desc.includes('modelo')) {
      suggestedCategory = 'beer';
      if (desc.includes('ipa')) suggestedSubcategory = 'IPA';
      else if (desc.includes('lager') || desc.includes('pilsner')) suggestedSubcategory = 'Lager';
      else if (desc.includes('stout')) suggestedSubcategory = 'Stout';
      else if (desc.includes('porter')) suggestedSubcategory = 'Porter';
      else if (/\bale\b/i.test(description)) suggestedSubcategory = 'Ale';
      else suggestedSubcategory = 'Lager'; // Default to lager for light beers
    }

    // === NON-ALCOHOLIC BEVERAGES ===
    else if (desc.includes('soda') || desc.includes('coca cola') || desc.includes('coke') || desc.includes('pepsi') || desc.includes('sprite') || desc.includes('fanta') || desc.includes('dr pepper') || desc.includes('tonic') || desc.includes('ginger ale') || desc.includes('club soda') || desc.includes('seltzer')) {
      suggestedCategory = 'non_alcoholic_beverage';
      suggestedSubcategory = 'Soda';
    } else if (desc.includes('juice') || desc.includes('orange juice') || desc.includes('cranberry') || desc.includes('pineapple juice') || desc.includes('grapefruit juice')) {
      suggestedCategory = 'non_alcoholic_beverage';
      suggestedSubcategory = 'Juice';
    } else if (desc.includes('coffee') || desc.includes('espresso') || desc.includes('latte') || desc.includes('cappuccino')) {
      suggestedCategory = 'non_alcoholic_beverage';
      suggestedSubcategory = 'Coffee';
    } else if (desc.includes('tea') && !desc.includes('tequila')) {
      suggestedCategory = 'non_alcoholic_beverage';
      suggestedSubcategory = 'Tea';
    } else if (desc.includes('water') || desc.includes('perrier') || desc.includes('pellegrino') || desc.includes('evian') || desc.includes('acqua panna')) {
      suggestedCategory = 'non_alcoholic_beverage';
      suggestedSubcategory = 'Water';
    } else if (desc.includes('red bull') || desc.includes('monster') || desc.includes('energy drink')) {
      suggestedCategory = 'non_alcoholic_beverage';
      suggestedSubcategory = 'Energy Drink';
    }

    // === FOOD CATEGORIES ===
    else if (desc.includes('meat') || desc.includes('beef') || desc.includes('pork') || desc.includes('chicken') || desc.includes('lamb') || desc.includes('veal') || desc.includes('duck')) {
      suggestedCategory = 'meat';
      if (desc.includes('beef') || desc.includes('steak')) suggestedSubcategory = 'Beef';
      else if (desc.includes('pork')) suggestedSubcategory = 'Pork';
      else if (desc.includes('chicken') || desc.includes('poultry')) suggestedSubcategory = 'Chicken';
      else if (desc.includes('lamb')) suggestedSubcategory = 'Lamb';
      else if (desc.includes('duck')) suggestedSubcategory = 'Duck';
      else suggestedSubcategory = 'Meat';
    } else if (desc.includes('seafood') || desc.includes('fish') || desc.includes('salmon') || desc.includes('shrimp') || desc.includes('lobster') || desc.includes('crab') || desc.includes('tuna') || desc.includes('halibut') || desc.includes('scallop')) {
      suggestedCategory = 'seafood';
      if (desc.includes('salmon')) suggestedSubcategory = 'Salmon';
      else if (desc.includes('tuna')) suggestedSubcategory = 'Tuna';
      else if (desc.includes('shrimp')) suggestedSubcategory = 'Shrimp';
      else if (desc.includes('lobster')) suggestedSubcategory = 'Lobster';
      else suggestedSubcategory = 'Seafood';
    } else if (desc.includes('produce') || desc.includes('lettuce') || desc.includes('tomato') || desc.includes('onion') || desc.includes('vegetable') || desc.includes('fruit')) {
      suggestedCategory = 'produce';
      suggestedSubcategory = 'Produce';
    } else if (desc.includes('dairy') || desc.includes('cheese') || desc.includes('milk') || desc.includes('cream') || desc.includes('butter') || desc.includes('yogurt')) {
      suggestedCategory = 'dairy';
      if (desc.includes('cheese')) suggestedSubcategory = 'Cheese';
      else if (desc.includes('milk')) suggestedSubcategory = 'Milk';
      else if (desc.includes('cream')) suggestedSubcategory = 'Cream';
      else suggestedSubcategory = 'Dairy';
    } else if (desc.includes('bread') || desc.includes('baguette') || desc.includes('roll') || desc.includes('bun') || desc.includes('croissant')) {
      suggestedCategory = 'dry_goods';
      suggestedSubcategory = 'Bread';
    }

    // === SUPPLIES ===
    else if (desc.includes('packaging') || desc.includes('box') || desc.includes('bag') || desc.includes('container') || desc.includes('wrap')) {
      suggestedCategory = 'packaging';
      suggestedSubcategory = 'Packaging';
    } else if (desc.includes('disposable') || desc.includes('cup') || desc.includes('plate') || desc.includes('utensil') || desc.includes('napkin') || desc.includes('straw')) {
      suggestedCategory = 'disposables';
      suggestedSubcategory = 'Disposables';
    } else if (desc.includes('cleaning') || desc.includes('sanitizer') || desc.includes('detergent') || desc.includes('bleach')) {
      suggestedCategory = 'chemicals';
      suggestedSubcategory = 'Cleaning';
    }

    return NextResponse.json({
      suggestions: scoredSuggestions.slice(0, 5),
      suggestedCategory,
      suggestedSubcategory,
    });
  });
}
