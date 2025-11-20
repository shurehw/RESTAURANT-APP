/**
 * Seed proforma categories for an organization
 *
 * Usage:
 * ORG_ID=<uuid> npx tsx scripts/seed-proforma-categories.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORG_ID = process.env.ORG_ID!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!ORG_ID) {
  console.error("Missing ORG_ID environment variable");
  console.log("Usage: ORG_ID=<uuid> npx tsx scripts/seed-proforma-categories.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const categories = [
  { code: "SALES_FOOD",             name: "Food Sales",                                         section: "SALES",          display_order: 10,  is_summary: false },
  { code: "SALES_BEV",              name: "Beverage Sales",                                     section: "SALES",          display_order: 20,  is_summary: false },
  { code: "SALES_OTHER",            name: "Other / Service Charge / Entertainment Sales",       section: "SALES",          display_order: 30,  is_summary: false },
  { code: "SALES_COMPS",            name: "Comps & Discounts / Employee Meals",                 section: "SALES",          display_order: 40,  is_summary: false },
  { code: "SALES_NET",              name: "Net Sales",                                          section: "SUMMARY",        display_order: 50,  is_summary: true  },

  { code: "COGS_FOOD",              name: "Food Cost of Goods Sold",                            section: "COGS",           display_order: 60,  is_summary: false },
  { code: "COGS_BEV",               name: "Beverage Cost of Goods Sold",                        section: "COGS",           display_order: 70,  is_summary: false },
  { code: "COGS_OTHER",             name: "Other Cost of Goods Sold",                           section: "COGS",           display_order: 80,  is_summary: false },
  { code: "COGS_TOTAL",             name: "Total Cost of Goods Sold",                           section: "SUMMARY",        display_order: 90,  is_summary: true  },
  { code: "GROSS_PROFIT",           name: "Gross Profit",                                       section: "SUMMARY",        display_order: 100, is_summary: true  },

  { code: "LABOR_FOH_VARIABLE",     name: "FOH Variable Labor",                                 section: "LABOR",          display_order: 110, is_summary: false },
  { code: "LABOR_BOH_VARIABLE",     name: "BOH Variable Labor",                                 section: "LABOR",          display_order: 120, is_summary: false },
  { code: "LABOR_MANAGEMENT",       name: "Management / Fixed Labor",                           section: "LABOR",          display_order: 130, is_summary: false },
  { code: "LABOR_TAX_BENEFITS",     name: "Payroll Taxes & Benefits (PTEB)",                    section: "LABOR",          display_order: 140, is_summary: false },
  { code: "LABOR_OTHER_OVERHEAD",   name: "Other Labor Overhead (bonuses, commissions, recruiting, outsourced)", section: "LABOR", display_order: 150, is_summary: false },
  { code: "LABOR_TOTAL",            name: "Total Labor",                                        section: "SUMMARY",        display_order: 160, is_summary: true  },
  { code: "PRIME_COST",             name: "Prime Cost (COGS + Labor)",                          section: "SUMMARY",        display_order: 170, is_summary: true  },

  { code: "OPEX_DIRECT_OPERATING",  name: "Direct Operating Expenses",                          section: "OPEX",           display_order: 180, is_summary: false },
  { code: "OPEX_MARKETING",         name: "Marketing & Promotions",                             section: "OPEX",           display_order: 190, is_summary: false },
  { code: "OPEX_MUSIC_ENT",         name: "Music & Entertainment / AV",                         section: "OPEX",           display_order: 200, is_summary: false },
  { code: "OPEX_REPAIRS_MAINT",     name: "Repairs & Maintenance / Landscaping & Florals",      section: "OPEX",           display_order: 210, is_summary: false },
  { code: "OPEX_UTILITIES",         name: "Utilities & Related / Telephone",                    section: "OPEX",           display_order: 220, is_summary: false },
  { code: "OPEX_OCCUPANCY",         name: "Occupancy Costs (Rent, CAM, Property Taxes)",        section: "OPEX",           display_order: 230, is_summary: false },
  { code: "OPEX_GNA",               name: "General & Administrative",                           section: "OPEX",           display_order: 240, is_summary: false },
  { code: "OPEX_CORPORATE_OVERHEAD", name: "Corporate Overhead / Non-Recurring",                section: "OPEX",           display_order: 250, is_summary: false },
  { code: "OPEX_TOTAL",             name: "Total Operating Expenses",                           section: "SUMMARY",        display_order: 260, is_summary: true  },

  { code: "EBITDA",                 name: "EBITDA",                                             section: "SUMMARY",        display_order: 270, is_summary: true  },
  { code: "OTHER_INCOME_EXPENSE",   name: "Other Income / (Expense)",                           section: "BELOW_THE_LINE", display_order: 280, is_summary: false },
  { code: "INTEREST_EXPENSE",       name: "Interest Expense / Income",                          section: "BELOW_THE_LINE", display_order: 290, is_summary: false },
  { code: "TAXES",                  name: "Taxes",                                              section: "BELOW_THE_LINE", display_order: 300, is_summary: false },
  { code: "NET_INCOME",             name: "Net Income",                                         section: "SUMMARY",        display_order: 310, is_summary: true  },
];

async function run() {
  console.log(`Seeding proforma categories for organization ${ORG_ID}...`);

  for (const c of categories) {
    const { error } = await supabase
      .from("proforma_categories")
      .upsert(
        {
          org_id: ORG_ID,
          code: c.code,
          name: c.name,
          section: c.section,
          display_order: c.display_order,
          is_summary: c.is_summary,
        },
        { onConflict: "org_id,code" }
      );

    if (error) {
      console.error(`Failed seeding category ${c.code}:`, error.message);
      process.exit(1);
    } else {
      console.log(`✓ Seeded category ${c.code}`);
    }
  }

  console.log("\n✅ Done seeding proforma_categories");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
