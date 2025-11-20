import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables:");
  console.error("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "✗");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const preopeningCategories = [
  // CapEx Categories
  {
    code: "PREOP_CAPEX_CONSTRUCTION",
    name: "Construction / Hard Costs",
    type: "CAPEX",
    display_order: 10,
    is_summary: false,
  },
  {
    code: "PREOP_CAPEX_FFNE",
    name: "FF&E (Furniture, Fixtures, Equipment)",
    type: "CAPEX",
    display_order: 20,
    is_summary: false,
  },

  // Initial Inventory
  {
    code: "PREOP_COGS_FNB",
    name: "Initial Inventory - Food & Beverage",
    type: "OPEX",
    display_order: 30,
    is_summary: false,
  },
  {
    code: "PREOP_COGS_OTHER",
    name: "Initial Inventory - Other (Merch, Retail)",
    type: "OPEX",
    display_order: 40,
    is_summary: false,
  },

  // Preopening Labor
  {
    code: "PREOP_LABOR_FIXED",
    name: "Preopening Payroll - Fixed (Salaried)",
    type: "OPEX",
    display_order: 50,
    is_summary: false,
  },
  {
    code: "PREOP_LABOR_VARIABLE",
    name: "Preopening Payroll - Variable (Hourly)",
    type: "OPEX",
    display_order: 60,
    is_summary: false,
  },
  {
    code: "PREOP_LABOR_BURDEN",
    name: "Preopening Payroll Taxes & Benefits",
    type: "OPEX",
    display_order: 70,
    is_summary: false,
  },

  // Preopening OpEx
  {
    code: "PREOP_OPEX_OPERATING",
    name: "Preopening OpEx - Operating",
    type: "OPEX",
    display_order: 80,
    is_summary: false,
  },
  {
    code: "PREOP_OPEX_OCCUPANCY",
    name: "Preopening OpEx - Occupancy",
    type: "OPEX",
    display_order: 90,
    is_summary: false,
  },
  {
    code: "PREOP_OPEX_GNA",
    name: "Preopening OpEx - G&A",
    type: "OPEX",
    display_order: 100,
    is_summary: false,
  },

  // Marketing & Training
  {
    code: "PREOP_MARKETING",
    name: "Preopening Marketing & F&F Party",
    type: "OPEX",
    display_order: 110,
    is_summary: false,
  },
  {
    code: "PREOP_TRAINING",
    name: "Training & Uniforms",
    type: "OPEX",
    display_order: 120,
    is_summary: false,
  },

  // Opening Supplies
  {
    code: "PREOP_OPENING_ORDER",
    name: "Opening Order (Paper, Decorations)",
    type: "OPEX",
    display_order: 130,
    is_summary: false,
  },
  {
    code: "PREOP_KITCHEN_BAR",
    name: "Kitchen & Bar Supplies",
    type: "OPEX",
    display_order: 140,
    is_summary: false,
  },

  // Reserves
  {
    code: "PREOP_WORKING_CAPITAL",
    name: "Working Capital",
    type: "WORKING_CAPITAL",
    display_order: 150,
    is_summary: false,
  },
  {
    code: "PREOP_CONTINGENCY",
    name: "Contingency",
    type: "WORKING_CAPITAL",
    display_order: 160,
    is_summary: false,
  },
  {
    code: "PREOP_MGMT_FEES",
    name: "Preopening Management Fees",
    type: "OPEX",
    display_order: 170,
    is_summary: false,
  },
];

async function seedPreopeningCategories() {
  console.log("Starting preopening categories seed...");

  // Get all organizations
  const { data: organizations, error: orgError } = await supabase
    .from("organizations")
    .select("id, name");

  if (orgError) {
    console.error("Error fetching organizations:", orgError);
    return;
  }

  console.log(`Found ${organizations?.length || 0} organizations`);

  for (const org of organizations || []) {
    console.log(`\nSeeding preopening categories for: ${org.name}`);

    // Check if categories already exist
    const { data: existing } = await supabase
      .from("proforma_preopening_categories")
      .select("id")
      .eq("org_id", org.id)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  ✓ Categories already exist, skipping`);
      continue;
    }

    // Insert categories
    const categoriesToInsert = preopeningCategories.map((cat) => ({
      ...cat,
      org_id: org.id,
    }));

    const { error: insertError } = await supabase
      .from("proforma_preopening_categories")
      .insert(categoriesToInsert);

    if (insertError) {
      console.error(`  ✗ Error inserting categories:`, insertError);
    } else {
      console.log(`  ✓ Inserted ${categoriesToInsert.length} categories`);
    }
  }

  console.log("\n✅ Preopening categories seed complete!");
}

seedPreopeningCategories();
