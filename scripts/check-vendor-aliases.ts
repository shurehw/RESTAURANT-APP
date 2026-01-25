import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkVendorAliases() {
  const supabase = createAdminClient();

  // Get all vendors
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name, normalized_name')
    .order('name');

  if (!vendors) return;

  console.log('\n📋 ALL VENDORS:\n');
  
  // Group similar vendors
  const groups: Record<string, string[]> = {};
  
  vendors.forEach(v => {
    const baseName = v.name.toLowerCase()
      .replace(/\s+(llc|inc|company|co\.|midwest|north texas|dallas|tx)\s*/gi, '')
      .replace(/'/g, '')
      .trim();
    
    if (!groups[baseName]) {
      groups[baseName] = [];
    }
    groups[baseName].push(v.name);
  });

  // Show groups with multiple vendors
  console.log('🔍 POTENTIAL DUPLICATES:\n');
  Object.entries(groups)
    .filter(([_, names]) => names.length > 1)
    .forEach(([base, names]) => {
      console.log(`${base}:`);
      names.forEach(name => console.log(`  - ${name}`));
      console.log('');
    });

  // Show newly created vendors
  const newVendors = [
    'SYSCO North Texas',
    'MARCONI',
    'MARION',
    'Mt Greens',
    'MARBOOL',
    'Dalton Plumbing LLC',
    'Keith Foods',
    'OAK FARMS-DALLAS DFA DAIRY BRANDS'
  ];

  console.log('\n📝 NEWLY CREATED VENDORS:\n');
  newVendors.forEach(newName => {
    const similar = vendors.filter(v => 
      v.name !== newName && 
      (v.name.toLowerCase().includes(newName.toLowerCase().split(' ')[0]) ||
       newName.toLowerCase().includes(v.name.toLowerCase().split(' ')[0]))
    );
    
    if (similar.length > 0) {
      console.log(`⚠️  ${newName} - Similar to:`);
      similar.forEach(s => console.log(`     - ${s.name}`));
    } else {
      console.log(`✅ ${newName} - Unique`);
    }
  });
}

checkVendorAliases()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
