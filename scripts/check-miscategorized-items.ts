import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMiscategorized() {
  console.log('🔍 Checking for miscategorized items\n');

  // Get Hwood Group org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', 'Hwood Group')
    .single();

  if (!org) {
    console.error('Org not found');
    return;
  }

  // Find beverages marked as food
  const { data: wrongCategory } = await supabase
    .from('items')
    .select('name, category, subcategory')
    .eq('org_id', org.id)
    .eq('category', 'food')
    .ilike('name', '%wine%')
    .limit(20);

  console.log('🍷 Wine items marked as "food":');
  wrongCategory?.forEach(item => {
    console.log(`  - ${item.name} (${item.category}, ${item.subcategory || 'NO SUBCATEGORY'})`);
  });

  // Find liquor marked as food
  const { data: liquorAsFood } = await supabase
    .from('items')
    .select('name, category, subcategory')
    .eq('org_id', org.id)
    .eq('category', 'food')
    .or('name.ilike.%vodka%,name.ilike.%whiskey%,name.ilike.%tequila%,name.ilike.%rum%,name.ilike.%gin%')
    .limit(20);

  console.log('\n🥃 Liquor items marked as "food":');
  liquorAsFood?.forEach(item => {
    console.log(`  - ${item.name} (${item.category}, ${item.subcategory || 'NO SUBCATEGORY'})`);
  });

  // Items with no subcategory
  const { data: noSubcat } = await supabase
    .from('items')
    .select('name, category, subcategory')
    .eq('org_id', org.id)
    .in('category', ['wine', 'liquor', 'beer'])
    .is('subcategory', null)
    .limit(20);

  console.log('\n❌ Beverage items with NO subcategory:');
  noSubcat?.forEach(item => {
    console.log(`  - ${item.name} (${item.category}, ${item.subcategory || 'NO SUBCATEGORY'})`);
  });

  console.log('\n✨ Done');
}

checkMiscategorized().catch(console.error);
