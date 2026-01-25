/**
 * Test category and subcategory suggestions for various item descriptions
 */

// Sample invoice line descriptions to test
const testCases = [
  // Liquor - should be detected
  { desc: 'Don Julio Reposado Tequila 750ml', expected: 'liquor/Tequila' },
  { desc: 'Grey Goose Vodka', expected: 'liquor/Vodka' },
  { desc: 'Makers Mark Bourbon', expected: 'liquor/Bourbon' },
  { desc: 'Jameson Irish Whiskey', expected: 'liquor/Irish Whiskey' },
  { desc: 'Tanqueray Gin', expected: 'liquor/Gin' },
  { desc: 'Aperol Aperitif', expected: 'liquor/Bitters/Aperitifs' },
  { desc: 'Noilly Prat Vermouth', expected: 'liquor/Vermouth' },

  // Wine - should be detected with subtypes
  { desc: 'Cabernet Sauvignon Red Wine', expected: 'wine/Red Wine' },
  { desc: 'Chardonnay White Wine', expected: 'wine/White Wine' },
  { desc: 'Champagne Brut', expected: 'wine/Sparkling Wine' },
  { desc: 'Pinot Noir', expected: 'wine/Red Wine' },

  // Beer - should be detected
  { desc: 'Stella Artois Lager 12pk', expected: 'beer/Lager' },
  { desc: 'Goose Island IPA 6pk', expected: 'beer/IPA' },
  { desc: 'Coors Light', expected: 'beer/Lager' },

  // Non-alcoholic beverages
  { desc: 'Coca Cola Soda', expected: 'non_alcoholic_beverage/Soda' },
  { desc: 'Red Bull Energy Drink', expected: 'non_alcoholic_beverage/Energy Drink' },
  { desc: 'San Pellegrino Water', expected: 'non_alcoholic_beverage/Water' },
  { desc: 'Orange Juice', expected: 'non_alcoholic_beverage/Juice' },

  // Food
  { desc: 'Beef Tenderloin', expected: 'meat/Beef' },
  { desc: 'Atlantic Salmon Fillet', expected: 'seafood/Salmon' },
  { desc: 'Organic Lettuce', expected: 'produce/Produce' },
  { desc: 'Aged Cheddar Cheese', expected: 'dairy/Cheese' },
];

function testCategorySuggestion(description: string): { category: string; subcategory: string } {
  const desc = description.toLowerCase();
  let suggestedCategory = 'food';
  let suggestedSubcategory = '';

  // === LIQUOR/SPIRITS DETECTION ===
  if (desc.includes('liqueur') || desc.includes('amaretto') || desc.includes('kahlua') || desc.includes('baileys') || desc.includes('frangelico') || desc.includes('st germain') || desc.includes('cointreau') || desc.includes('grand marnier')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Liqueur';
  }
  else if (desc.includes('tequila') || desc.includes('patron') || desc.includes('casamigos') || desc.includes('don julio') || desc.includes('herradura') || desc.includes('espolon') || desc.includes('clase azul') || desc.includes('reposado') || desc.includes('añejo') || desc.includes('anejo')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Tequila';
  }
  else if (desc.includes('mezcal')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Mezcal';
  }
  else if (desc.includes('vodka') || desc.includes('grey goose') || desc.includes('titos') || desc.includes('belvedere') || desc.includes('absolut') || desc.includes('ketel one') || desc.includes('ciroc')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Vodka';
  }
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
  else if ((desc.includes('gin') && !desc.includes('ginger')) || desc.includes('tanqueray') || desc.includes('hendricks') || desc.includes('bombay')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Gin';
  }
  else if (desc.includes('rum') || desc.includes('bacardi') || desc.includes('captain morgan') || desc.includes('kraken') || desc.includes('goslings')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Rum';
  }
  else if (desc.includes('cognac') || desc.includes('brandy') || desc.includes('hennessy') || desc.includes('remy martin') || desc.includes('courvoisier')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Cognac/Brandy';
  }
  else if (desc.includes('bitters') || desc.includes('angostura') || desc.includes('aperol') || desc.includes('campari') || desc.includes('amaro') || desc.includes('fernet') || desc.includes('chartreuse') || desc.includes('peychaud')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Bitters/Aperitifs';
  }
  else if (desc.includes('vermouth') || desc.includes('dolin') || desc.includes('carpano') || desc.includes('noilly prat')) {
    suggestedCategory = 'liquor';
    suggestedSubcategory = 'Vermouth';
  }
  // === WINE DETECTION ===
  else if (desc.includes('wine') || desc.includes('cabernet') || desc.includes('chardonnay') || desc.includes('pinot') || desc.includes('merlot') || desc.includes('sauvignon') || desc.includes('zinfandel') || desc.includes('syrah') || desc.includes('shiraz') || desc.includes('malbec') || desc.includes('riesling') || desc.includes('chianti') || desc.includes('rioja') || desc.includes('bordeaux') || desc.includes('burgundy')) {
    suggestedCategory = 'wine';
    if (desc.includes('red') || desc.includes('cabernet') || desc.includes('merlot') || desc.includes('pinot noir') || desc.includes('zinfandel') || desc.includes('syrah') || desc.includes('shiraz') || desc.includes('malbec') || desc.includes('chianti') || desc.includes('rioja')) {
      suggestedSubcategory = 'Red Wine';
    } else if (desc.includes('white') || desc.includes('chardonnay') || desc.includes('sauvignon blanc') || desc.includes('pinot grigio') || desc.includes('pinot gris') || desc.includes('riesling') || desc.includes('moscato')) {
      suggestedSubcategory = 'White Wine';
    } else if (desc.includes('sparkling') || desc.includes('champagne') || desc.includes('prosecco') || desc.includes('cava') || desc.includes('brut')) {
      suggestedSubcategory = 'Sparkling Wine';
    } else if (desc.includes('rose') || desc.includes('rosé') || desc.includes('pink')) {
      suggestedSubcategory = 'Rosé';
    } else {
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
    else suggestedSubcategory = 'Lager';
  }
  // === NON-ALCOHOLIC BEVERAGES ===
  else if (desc.includes('soda') || desc.includes('coca cola') || desc.includes('coke') || desc.includes('pepsi') || desc.includes('sprite') || desc.includes('fanta') || desc.includes('dr pepper') || desc.includes('tonic') || desc.includes('ginger ale') || desc.includes('club soda') || desc.includes('seltzer')) {
    suggestedCategory = 'non_alcoholic_beverage';
    suggestedSubcategory = 'Soda';
  } else if (desc.includes('juice') || desc.includes('orange juice') || desc.includes('cranberry') || desc.includes('pineapple juice') || desc.includes('grapefruit juice')) {
    suggestedCategory = 'non_alcoholic_beverage';
    suggestedSubcategory = 'Juice';
  } else if (desc.includes('red bull') || desc.includes('monster') || desc.includes('energy drink')) {
    suggestedCategory = 'non_alcoholic_beverage';
    suggestedSubcategory = 'Energy Drink';
  } else if (desc.includes('water') || desc.includes('perrier') || desc.includes('pellegrino') || desc.includes('evian') || desc.includes('acqua panna')) {
    suggestedCategory = 'non_alcoholic_beverage';
    suggestedSubcategory = 'Water';
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
  }

  return { category: suggestedCategory, subcategory: suggestedSubcategory };
}

console.log('🧪 Testing Category & Subcategory Suggestions\n');

let passCount = 0;
let failCount = 0;

testCases.forEach(({ desc, expected }) => {
  const result = testCategorySuggestion(desc);
  const actual = `${result.category}/${result.subcategory}`;
  const pass = actual === expected;

  if (pass) {
    console.log(`✅ "${desc}"`);
    console.log(`   → ${actual}`);
    passCount++;
  } else {
    console.log(`❌ "${desc}"`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Got:      ${actual}`);
    failCount++;
  }
  console.log();
});

console.log('='.repeat(60));
console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`);
console.log(`✨ Success rate: ${Math.round((passCount / testCases.length) * 100)}%\n`);
