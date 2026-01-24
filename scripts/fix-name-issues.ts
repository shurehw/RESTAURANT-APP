import { createClient } from '@supabase/supabase-js';

async function fixNameIssues() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  console.log('Finding items with name formatting issues...\n');

  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(10000);

  const nameFixes: any[] = [];

  items?.forEach(item => {
    let newName = item.name;
    const issues: string[] = [];

    // Fix leading numbers (e.g., "1Goma" -> "Goma")
    if (/^[0-9]+([A-Z])/.test(item.name)) {
      newName = item.name.replace(/^[0-9]+/, '');
      issues.push('Removed leading number');
    }

    // Fix doubled words (e.g., "Cara Cara" is OK, but "3L 3L" is not)
    // Only fix if it's a unit duplication
    if (/\b(\d+[a-zA-Z]+)\s+\1\b/.test(item.name)) {
      newName = newName.replace(/\b(\d+[a-zA-Z]+)\s+\1\b/, '$1');
      issues.push('Removed duplicated unit');
    }

    // Fix multiple spaces
    if (/\s{2,}/.test(newName)) {
      newName = newName.replace(/\s{2,}/g, ' ');
      issues.push('Removed extra spaces');
    }

    if (newName !== item.name) {
      nameFixes.push({
        id: item.id,
        sku: item.sku,
        oldName: item.name,
        newName: newName.trim(),
        issues
      });
    }
  });

  console.log(`Found ${nameFixes.length} items to fix:\n`);

  nameFixes.forEach((fix, i) => {
    console.log(`${i + 1}. ${fix.sku}`);
    console.log(`   OLD: "${fix.oldName}"`);
    console.log(`   NEW: "${fix.newName}"`);
    console.log(`   Changes: ${fix.issues.join(', ')}\n`);
  });

  if (nameFixes.length === 0) {
    console.log('✅ No name fixes needed!');
    return;
  }

  console.log('Applying fixes...\n');

  let fixedCount = 0;

  for (const fix of nameFixes) {
    const { error } = await supabase
      .from('items')
      .update({ name: fix.newName })
      .eq('id', fix.id);

    if (error) {
      console.error(`Error fixing ${fix.sku}:`, error);
    } else {
      fixedCount++;
    }
  }

  console.log(`✅ Successfully fixed ${fixedCount}/${nameFixes.length} item names`);
}

fixNameIssues();
