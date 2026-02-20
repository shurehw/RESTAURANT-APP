/**
 * Full extraction of Restaurant Activity Report leads
 * RLR leads are in response.PublicLeadReports (37,135 total)
 * ERL leads are in response.PublicCompaniesList
 */
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://leads.restaurantactivityreport.com/RARWebApi/api';
const EMAIL = process.env.RAR_EMAIL!;
const PASSWORD = process.env.RAR_PASSWORD!;

// Supabase config
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function authenticate() {
  console.log('Authenticating...');
  const response = await fetch(`${BASE_URL}/Account/AuthenticateUser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ UserName: EMAIL, Password: PASSWORD }).toString(),
  });
  if (!response.ok) { console.log('Auth failed:', response.status); return null; }
  const data = await response.json();
  console.log(`Authenticated: ${data.RoleName} (ID: ${data.AdminUserId})`);
  return data;
}

function authHeaders(token: string, contentType?: string) {
  const h: Record<string, string> = { 'Authorization': token };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

// ============ RLR EXTRACTION ============

async function fetchRLRPage(token: string, userId: number, role: string, regionIds: string, page: number) {
  const params = new URLSearchParams({
    UserId: String(userId),
    UserRole: role,
    MaxRow: '30',
    Page: String(page),
    Type: role === 'subscriber' ? '1' : '3',
    SearchText: '',
    RegionID: regionIds,
    AveragePurchase: '-1',
    LocationType: '-1',
    MenuType: '-1',
    LeadType: '-1',
    IncludeActivityLeads: 'true',
    IncludeRLRLeads: 'true',
  });

  const response = await fetch(`${BASE_URL}/Account/SearchLeads`, {
    method: 'POST',
    headers: authHeaders(token, 'application/x-www-form-urlencoded'),
    body: params.toString(),
  });

  if (!response.ok) return { leads: [], totalRows: 0, pageCount: 0 };

  const data = await response.json();
  return {
    leads: data.PublicLeadReports || [],
    totalRows: data.TotalRowCount || 0,
    pageCount: data.PageCount || 0,
  };
}

async function fetchAllRLR(token: string, userId: number, role: string, regionIds: string): Promise<any[]> {
  console.log('\n=== FETCHING RLR LEADS ===');

  // Get first page to know total
  const first = await fetchRLRPage(token, userId, role, regionIds, 1);
  console.log(`Total RLR leads: ${first.totalRows} across ${first.pageCount} pages`);

  if (first.leads.length === 0) {
    console.log('No RLR leads found');
    return [];
  }

  const allLeads = [...first.leads];
  console.log(`Page 1: ${first.leads.length} leads`);

  // Log sample lead
  if (first.leads.length > 0) {
    const sample = first.leads[0];
    console.log(`Sample RLR lead: ${sample.Company} - ${sample.City}, ${sample.State}`);
  }

  // Fetch remaining pages
  for (let page = 2; page <= first.pageCount; page++) {
    try {
      const result = await fetchRLRPage(token, userId, role, regionIds, page);
      if (result.leads.length === 0) break;
      allLeads.push(...result.leads);

      if (page % 50 === 0 || page === first.pageCount) {
        console.log(`Page ${page}/${first.pageCount}: ${allLeads.length} total leads`);
      }

      // Small delay to be respectful
      if (page % 10 === 0) await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`Error on page ${page}:`, err);
      // Save what we have so far
      break;
    }
  }

  return allLeads;
}

// ============ ERL EXTRACTION ============

async function fetchERLPage(token: string, userId: number, role: string, regionIds: string, page: number) {
  const params = new URLSearchParams({
    UserId: String(userId),
    UserRole: role,
    MaxRow: '30',
    Page: String(page),
    Type: role === 'subscriber' ? '1' : '3',
    SearchText: '',
    RegionID: regionIds,
    CompanyLocationType: '-1',
    MenuType: '-1',
    OpenStatus: '-1',
    ServiceType: '-1',
    PriceLevel: '-1',
    City: '',
    State: '',
    Zip: '',
  });

  const response = await fetch(`${BASE_URL}/Account/GetCompaniesSearch`, {
    method: 'POST',
    headers: authHeaders(token, 'application/x-www-form-urlencoded'),
    body: params.toString(),
  });

  if (!response.ok) return { companies: [], totalRows: 0, pageCount: 0 };

  const data = await response.json();
  return {
    companies: data.PublicCompaniesList || [],
    totalRows: data.TotalRowCount || 0,
    pageCount: data.PageCount || 0,
  };
}

async function fetchAllERL(token: string, userId: number, role: string, regionIds: string): Promise<any[]> {
  console.log('\n=== FETCHING ERL LEADS (Existing Restaurants) ===');

  const first = await fetchERLPage(token, userId, role, regionIds, 1);
  console.log(`Total ERL companies: ${first.totalRows} across ${first.pageCount} pages`);

  if (first.companies.length === 0) {
    console.log('No ERL companies found');
    return [];
  }

  const allCompanies = [...first.companies];
  console.log(`Page 1: ${first.companies.length} companies`);

  if (first.companies.length > 0) {
    const sample = first.companies[0];
    console.log(`Sample ERL: ${sample.CompanyName} - ${sample.City}, ${sample.State}`);
  }

  for (let page = 2; page <= first.pageCount; page++) {
    try {
      const result = await fetchERLPage(token, userId, role, regionIds, page);
      if (result.companies.length === 0) break;
      allCompanies.push(...result.companies);

      if (page % 50 === 0 || page === first.pageCount) {
        console.log(`Page ${page}/${first.pageCount}: ${allCompanies.length} total companies`);
      }

      if (page % 10 === 0) await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`Error on page ${page}:`, err);
      break;
    }
  }

  return allCompanies;
}

// ============ MAIN ============

async function main() {
  const auth = await authenticate();
  if (!auth) return;

  const token = auth.access_token;
  const userId = auth.AdminUserId;
  const role = auth.RoleName;

  // Get subscriber regions
  const regionsResp = await fetch(`${BASE_URL}/Account/GetSubscriberRegionList?SubscriberId=${userId}`, {
    headers: authHeaders(token),
  });
  const regions = regionsResp.ok ? await regionsResp.json() : [];
  const regionIds = regions.map((r: any) => r.RegionID).join(',');
  console.log(`Regions: ${regions.map((r: any) => `${r.RegionName} (${r.RegionID})`).join(', ')}`);

  // Fetch all RLR leads
  const rlrLeads = await fetchAllRLR(token, userId, role, regionIds);
  console.log(`\nRLR extraction complete: ${rlrLeads.length} leads`);

  // Save RLR to file (in case Supabase insert fails, we have the data)
  fs.writeFileSync('scripts/screenshots/rlr-leads.json', JSON.stringify(rlrLeads, null, 2));
  console.log('Saved RLR to rlr-leads.json');

  // Fetch all ERL companies
  const erlLeads = await fetchAllERL(token, userId, role, regionIds);
  console.log(`\nERL extraction complete: ${erlLeads.length} companies`);

  fs.writeFileSync('scripts/screenshots/erl-leads.json', JSON.stringify(erlLeads, null, 2));
  console.log('Saved ERL to erl-leads.json');

  // Summary
  console.log(`\n=== EXTRACTION SUMMARY ===`);
  console.log(`RLR (Pre-opening): ${rlrLeads.length} leads`);
  console.log(`ERL (Existing):    ${erlLeads.length} companies`);
  console.log(`Total:             ${rlrLeads.length + erlLeads.length} records`);

  if (rlrLeads.length > 0) {
    console.log('\nSample RLR lead fields:', Object.keys(rlrLeads[0]).filter(k => rlrLeads[0][k] !== null && rlrLeads[0][k] !== '' && rlrLeads[0][k] !== 0));
    console.log('Sample RLR:', JSON.stringify(rlrLeads[0], null, 2).substring(0, 800));
  }

  if (erlLeads.length > 0) {
    console.log('\nSample ERL fields:', Object.keys(erlLeads[0]).filter(k => erlLeads[0][k] !== null && erlLeads[0][k] !== '' && erlLeads[0][k] !== 0));
    console.log('Sample ERL:', JSON.stringify(erlLeads[0], null, 2).substring(0, 800));
  }

  console.log('\nDone! Run the import script next to load into Supabase.');
}

main().catch(console.error);
