import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Counts
  const { count: rlrCount } = await sb.from('rar_leads_preopening').select('*', { count: 'exact', head: true });
  const { count: erlCount } = await sb.from('rar_leads_existing').select('*', { count: 'exact', head: true });
  console.log(`RLR rows: ${rlrCount}`);
  console.log(`ERL rows: ${erlCount}`);

  // Sample RLR
  const { data: rlrSample } = await sb.from('rar_leads_preopening')
    .select('*')
    .not('email', 'is', null)
    .not('phone', 'is', null)
    .not('summary', 'is', null)
    .limit(2);

  console.log('\n=== SAMPLE RLR LEADS ===');
  for (const r of rlrSample || []) {
    const populated = Object.entries(r).filter(([, v]) => v !== null && v !== '' && v !== 0).length;
    console.log(`${r.company} - ${r.city}, ${r.state}`);
    console.log(`  Fields: ${populated}/${Object.keys(r).length}`);
    console.log(`  Contact: ${r.first_name} ${r.last_name} | ${r.email} | ${r.phone}`);
    console.log(`  Address: ${r.address1}, ${r.city}, ${r.state} ${r.zip}`);
    console.log(`  Open: ${r.estimated_open_date}`);
    console.log(`  Summary: ${(r.summary || '').substring(0, 200)}...`);
    console.log();
  }

  // Sample ERL
  const { data: erlSample } = await sb.from('rar_leads_existing')
    .select('*')
    .not('contact_email', 'is', null)
    .not('company_phone', 'is', null)
    .gt('consumer_rating', 0)
    .limit(2);

  console.log('=== SAMPLE ERL LEADS ===');
  for (const r of erlSample || []) {
    const populated = Object.entries(r).filter(([, v]) => v !== null && v !== '' && v !== 0).length;
    console.log(`${r.company_name} - ${r.city}, ${r.state}`);
    console.log(`  Fields: ${populated}/${Object.keys(r).length}`);
    console.log(`  Phone: ${r.company_phone} | Web: ${r.company_website}`);
    console.log(`  Contact: ${r.contact_first_name} ${r.contact_last_name} | ${r.contact_email}`);
    console.log(`  Address: ${r.street_address}, ${r.city}, ${r.state} ${r.zip}`);
    console.log(`  Rating: ${r.consumer_rating} | Employees: ${r.employee_estimate} | Revenue: ${r.sales_estimate_revenue}`);
    console.log(`  Type: ${r.location_type} | Menu: ${r.menu_type} | Service: ${r.service_type}`);
    console.log();
  }

  // Field coverage for RLR
  const { data: rlrAll } = await sb.from('rar_leads_preopening')
    .select('email,phone,website,summary,lat,lng,facebook,owner_name')
    .limit(5000);
  const n = rlrAll?.length || 0;
  console.log(`=== RLR FIELD COVERAGE (sample of ${n}) ===`);
  const fields = ['email', 'phone', 'website', 'summary', 'lat', 'facebook', 'owner_name'] as const;
  for (const f of fields) {
    const count = rlrAll?.filter((r: any) => r[f]).length || 0;
    console.log(`  ${f}: ${count}/${n} (${Math.round(count / n * 100)}%)`);
  }

  // Field coverage for ERL
  const { data: erlAll } = await sb.from('rar_leads_existing')
    .select('company_phone,company_website,contact_email,latitude,consumer_rating,employee_estimate,sales_estimate_revenue,pos_software')
    .limit(5000);
  const m = erlAll?.length || 0;
  console.log(`\n=== ERL FIELD COVERAGE (sample of ${m}) ===`);
  const erlFields = ['company_phone', 'company_website', 'contact_email', 'latitude', 'consumer_rating', 'employee_estimate', 'sales_estimate_revenue', 'pos_software'] as const;
  for (const f of erlFields) {
    const count = erlAll?.filter((r: any) => r[f]).length || 0;
    console.log(`  ${f}: ${count}/${m} (${Math.round(count / m * 100)}%)`);
  }
}

main().catch(console.error);
