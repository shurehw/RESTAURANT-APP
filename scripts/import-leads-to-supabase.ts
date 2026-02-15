/**
 * Import extracted RAR leads into Supabase
 * Reads from rlr-leads.json and erl-leads.json
 * Upserts into rar_leads_preopening and rar_leads_existing tables
 */
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function parseDate(dateStr: string | null): string | null {
  if (!dateStr || dateStr === '0001-01-01T00:00:00' || dateStr === '0001-01-01T00:00:00Z') return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function mapRLRLead(lead: any) {
  return {
    source_id: lead.DataId,
    company: lead.Company || null,
    first_name: lead.FirstName || null,
    last_name: lead.LastName || null,
    title: lead.Title || null,
    email: lead.EmailAddress || lead.Email || null,
    alt_email: lead.AltEmail || null,
    phone: lead.PhoneNumber || null,
    cell_phone: lead.CellPhone || null,
    extension: lead.Extension || null,
    other_contact: lead.OtherContact || null,
    other_contact_phone: lead.OtherContactPhone || null,
    website: lead.Website || null,
    facebook: lead.Facebook || null,
    instagram: lead.Instagram || null,
    linkedin: lead.LinkedIn || null,
    pinterest: lead.Pinterest || null,
    address1: lead.Address1 || null,
    address2: lead.Address2 || null,
    suite_num: lead.SuiteNum || null,
    city: lead.City || null,
    state: lead.State || null,
    zip: lead.Zip || null,
    county: lead.County || null,
    region_name: lead.RegionName || lead.Region || null,
    region_id: lead.RegionID || null,
    general_area: lead.GeneralArea || null,
    estimated_open_date: lead.EstimatedOpenDate || null,
    open_month: lead.OpenMonth || null,
    open_day: lead.OpenDay || null,
    open_year: lead.OpenYear || null,
    publication_date: parseDate(lead.PublicationDate),
    summary: lead.Summary || null,
    lead_type: lead.LeadType || null,
    lead_type_id: lead.LeadTypeId || null,
    location_type: lead.LocationType || null,
    location_type_id: lead.LocationTypeId || null,
    average_check: lead.AverageCheck || null,
    menu_type: lead.MenuType || null,
    cuisine: lead.Cuisine || null,
    meal_period: lead.MealPeriod || null,
    square_feet: lead.SquareFeet || null,
    num_seats: lead.NumSeats || null,
    liquor_license: lead.LiquorLicense || null,
    owner_name: lead.OwnerName || null,
    owner_status: lead.OwnerStatus || null,
    former_site: lead.FormerSite || null,
    source: lead.Source || null,
    google_maps_url: lead.GoogleMapsURL || null,
    lat: lead.lat || null,
    lng: lead.lng || null,
    notes: lead.Notes1 || null,
    editorial_notes: lead.EditorialNotes || null,
    phone_interview: lead.PhoneInterview || null,
    phone_notes: lead.PhoneNotes || null,
    data_type: lead.DataType || null,
    new_report: lead.NewReport || null,
    created_on: parseDate(lead.CreatedOn),
  };
}

function mapERLLead(company: any) {
  return {
    source_id: company.CompanyID,
    company_unique_id: company.CompanyUniqueId || null,
    company_name: company.CompanyName || null,
    company_phone: company.CompanyPhone || null,
    company_website: company.CompanyWebsite || null,
    facebook_url: company.FacebookUrl || null,
    instagram_url: company.InstagramUrl || null,
    linkedin_url: company.LinkedInUrl || null,
    twitter_url: company.TwitterUrl || null,
    google_map_url: company.GoogleMapUrl || null,
    street_address: company.StreetAddress || null,
    city: company.City || null,
    state: company.State || null,
    state_name: company.StateName || null,
    zip: company.Zip || null,
    county: company.County || null,
    country: company.Country || null,
    timezone: company.Timezone || null,
    latitude: company.Latitude || null,
    longitude: company.Longitude || null,
    mailing_address: company.MailingAddress || null,
    mailing_city: company.MailingCity || null,
    mailing_state: company.MailingState || null,
    mailing_zip: company.MailingZip || null,
    location_type: company.LocationType || null,
    location_type_id: company.LocationTypeID || null,
    menu_type: company.MenuType || null,
    menu_id: company.MenuID || null,
    average_purchase: company.AveragePurchase || null,
    average_purchase_id: company.AveragePurchaseID || null,
    service_type: company.ServiceType || null,
    service_type_id: company.ServiceTypeID || null,
    price_level: company.PriceLevel || null,
    price_level_id: company.PriceLevelID || null,
    open_status: company.OpenStatus || null,
    open_status_id: company.OpenStatusID || null,
    consumer_rating: company.ConsumerRating || null,
    employee_estimate: company.EmployeeEstimate || null,
    sales_estimate_revenue: company.SalesEstimateRevenue || company.SalesEstimatesRevenue || null,
    total_units: company.TotalUnits || null,
    trade_names: company.TradeNames || null,
    sic_codes: company.SICCodes || null,
    sic_descriptions: company.SICDescriptions || null,
    naics_codes: company.NAICSCodes || null,
    naics_descriptions: company.NAICSDescriptions || null,
    pos_hardware: company.POSHardware || null,
    pos_software: company.POSSoftware || null,
    pos_prediction: company.POSPrediction || null,
    pos_prediction_description: company.POSPredictionDescription || null,
    dun: company.DUN || null,
    ein: company.EIN || null,
    contact_first_name: company.FirstName || null,
    contact_last_name: company.LastName || null,
    contact_title: company.Title || null,
    contact_email: company.Email || null,
    contact_phone: company.ContactPhone || null,
    entry_date: parseDate(company.EntryDate),
    date_updated: parseDate(company.DateUpdated),
    is_active: company.IsActive ?? null,
    notes: company.Notes || null,
  };
}

async function importBatch(table: string, records: any[], batchSize: number = 500) {
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: 'source_id', ignoreDuplicates: false });

    if (error) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
      errors += batch.length;

      // Try inserting one at a time to find bad records
      for (const record of batch) {
        const { error: singleError } = await supabase
          .from(table)
          .upsert(record, { onConflict: 'source_id', ignoreDuplicates: false });
        if (singleError) {
          console.error(`  Record source_id=${record.source_id}: ${singleError.message}`);
          errors++;
        } else {
          imported++;
          errors--; // We counted this as an error already
        }
      }
    } else {
      imported += batch.length;
    }

    if ((i + batchSize) % 5000 < batchSize || i + batchSize >= records.length) {
      console.log(`  ${table}: ${imported}/${records.length} imported (${errors} errors)`);
    }
  }

  return { imported, errors };
}

async function main() {
  // Read extracted data
  const rlrPath = 'scripts/screenshots/rlr-leads.json';
  const erlPath = 'scripts/screenshots/erl-leads.json';

  // Import RLR leads
  if (fs.existsSync(rlrPath)) {
    console.log('Loading RLR leads...');
    const rlrRaw = JSON.parse(fs.readFileSync(rlrPath, 'utf-8'));
    console.log(`Read ${rlrRaw.length} RLR leads from file`);

    // Filter out leads with no source_id
    const rlrMapped = rlrRaw
      .filter((l: any) => l.DataId && l.DataId > 0)
      .map(mapRLRLead);
    console.log(`Mapped ${rlrMapped.length} valid RLR leads`);

    console.log('Importing RLR leads to rar_leads_preopening...');
    const rlrResult = await importBatch('rar_leads_preopening', rlrMapped);
    console.log(`RLR import complete: ${rlrResult.imported} imported, ${rlrResult.errors} errors\n`);
  } else {
    console.log(`No RLR file found at ${rlrPath}`);
  }

  // Import ERL leads
  if (fs.existsSync(erlPath)) {
    console.log('Loading ERL companies...');
    const erlRaw = JSON.parse(fs.readFileSync(erlPath, 'utf-8'));
    console.log(`Read ${erlRaw.length} ERL companies from file`);

    const erlMapped = erlRaw
      .filter((c: any) => c.CompanyID && c.CompanyID > 0)
      .map(mapERLLead);
    console.log(`Mapped ${erlMapped.length} valid ERL companies`);

    console.log('Importing ERL companies to rar_leads_existing...');
    const erlResult = await importBatch('rar_leads_existing', erlMapped);
    console.log(`ERL import complete: ${erlResult.imported} imported, ${erlResult.errors} errors\n`);
  } else {
    console.log(`No ERL file found at ${erlPath}`);
  }

  console.log('Import complete!');
}

main().catch(console.error);
