# Restaurant Proforma - Product Spin-Out Plan

**Date**: 2026-02-14
**Objective**: Extract proforma functionality from OpsOS into a standalone product
**Strategy**: Complete separation (new repo, new database, new brand, independent product)

---

## Phase 1: New Product Setup (Day 1)

### 1.1 Repository & Project Structure

**New Repository**: `restaurant-proforma` (or your chosen name)

```
restaurant-proforma/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/
│   │   ├── projects/              # Main project list
│   │   │   └── [id]/              # Project detail
│   │   └── settings/              # Org settings
│   ├── api/
│   │   ├── auth/
│   │   ├── projects/
│   │   ├── scenarios/
│   │   ├── assumptions/
│   │   ├── labor-positions/
│   │   ├── revenue-centers/
│   │   ├── calculate/
│   │   └── settings/
│   ├── layout.tsx
│   └── page.tsx                   # Landing/marketing page
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── ProformaLayout.tsx
│   ├── projects/
│   │   ├── ProjectCard.tsx
│   │   ├── CreateProjectDialog.tsx
│   │   └── ScenarioWizard.tsx
│   ├── assumptions/
│   │   ├── RevenueAssumptions.tsx
│   │   ├── CogsAssumptions.tsx
│   │   ├── LaborAssumptions.tsx
│   │   └── [12+ other assumption components]
│   └── settings/
│       └── ProformaSettingsClient.tsx
├── lib/
│   ├── auth/                      # Supabase auth client
│   ├── database/                  # Supabase queries
│   ├── proforma/
│   │   ├── constants.ts
│   │   └── calculations.ts
│   └── labor-rate-calculator.ts
├── supabase/
│   ├── migrations/                # 15 proforma migrations
│   └── seed.sql
├── public/
├── .env.local
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

### 1.2 New Supabase Project

**Project Name**: `restaurant-proforma-prod`

**Required Setup**:
1. Create new Supabase project via dashboard
2. Note credentials: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Enable Auth providers (email/password, Google SSO)
4. Configure RLS policies
5. Set up organizations/users schema

**Database Schema**:
- Copy all 15 proforma migrations from OpsOS
- Add auth schema: `organizations`, `organization_users`, `user_profiles`
- Run migrations in order
- Seed proforma categories

### 1.3 Branding & Domain

**Product Name Options**:
- Restaurant Proforma Pro
- ProForma (clean, simple)
- VenueModeler
- Hospitality Proforma
- RestaurantFP&A

**Domain Strategy**:
- Primary: `restaurantproforma.com` or `venuemodeler.com`
- Staging: `staging.restaurantproforma.com`
- Vercel deployment: `restaurant-proforma.vercel.app`

**Visual Identity**:
- New logo (financial/modeling theme vs OpsOS enforcement theme)
- Color palette: Professional blues/greens (vs OpsOS red/orange enforcement colors)
- Tagline: "Financial modeling for restaurant concepts" or "Build bulletproof restaurant proformas"

---

## Phase 2: Code Migration (Days 2-3)

### 2.1 Files to Copy from OpsOS

**Database Layer** (15 migrations):
```
supabase/migrations/064_create_proforma_categories.sql
supabase/migrations/066_create_proforma_projects_and_scenarios.sql
supabase/migrations/067_extend_revenue_dayparts_seasonality.sql
supabase/migrations/068_create_labor_salaried_roles.sql
supabase/migrations/077_harden_proforma_math.sql
supabase/migrations/081_create_proforma_settings.sql
supabase/migrations/102_create_proforma_presets.sql
supabase/migrations/103_add_pdr_fields_to_revenue_centers.sql
supabase/migrations/105_add_bar_revenue_fields.sql
supabase/migrations/107_complete_labor_model.sql
supabase/migrations/107_labor_position_templates.sql
supabase/migrations/108_labor_calculation_engine.sql
supabase/migrations/109_labor_position_mix_allocation.sql
supabase/migrations/110_labor_three_tier_classification.sql
supabase/migrations/110_scenario_labor_positions.sql
supabase/migrations/111_labor_wage_system.sql
supabase/migrations/112_labor_settings.sql
supabase/migrations/128_project_level_revenue_centers_service_periods.sql
```

**API Routes** (37 endpoints):
```
app/api/proforma/**/* → app/api/**/*
app/api/settings/proforma/**/* → app/api/settings/**/*
```

**UI Pages** (3 pages):
```
app/(dashboard)/proforma/page.tsx → app/(dashboard)/projects/page.tsx
app/(dashboard)/proforma/[id]/page.tsx → app/(dashboard)/projects/[id]/page.tsx
app/(dashboard)/settings/proforma/page.tsx → app/(dashboard)/settings/page.tsx
```

**Components** (24 components):
```
components/proforma/**/* → components/projects/**/*
components/settings/ProformaSettingsClient.tsx → components/settings/SettingsClient.tsx
components/settings/EnhancedProformaSettings.tsx → components/settings/EnhancedSettings.tsx
```

**Library Files**:
```
lib/proforma/constants.ts → lib/constants.ts
lib/labor-rate-calculator.ts → lib/labor-rate-calculator.ts
```

**Scripts**:
```
scripts/backfill-proforma-defaults.ts → scripts/backfill-defaults.ts
scripts/seed-proforma-categories.ts → scripts/seed-categories.ts
setup-proforma-settings.sql → setup-settings.sql
```

### 2.2 Code Adaptations Required

**Path Updates**:
- `/proforma` → `/projects`
- `/settings/proforma` → `/settings`
- `components/proforma/` → `components/projects/`

**Import Path Updates**:
- `@/lib/proforma/` → `@/lib/`
- All Supabase client imports point to new project credentials

**Remove OpsOS Dependencies**:
- Remove venue-specific logic if not needed
- Remove org-level RLS if using different multi-tenancy model
- Remove references to OpsOS-specific tables (e.g., `general_locations` if not migrated)

**Simplify Navigation**:
- New sidebar with only: Projects, Settings, Profile
- No 26-item mega-nav
- Clean, focused FP&A tool

### 2.3 Authentication Strategy

**Option A: Supabase Auth (Recommended)**
- Email/password signup
- Google SSO
- Magic link login
- Same patterns as OpsOS but independent user base

**Option B: Shared SSO with OpsOS**
- Single sign-on across both products
- Requires auth federation/JWT sharing
- More complex but better UX for customers who buy both

**Recommendation**: Start with Option A (independent auth), add Option B later if needed

---

## Phase 3: Data Migration (Day 3)

### 3.1 Export Existing Proforma Projects (if any)

**From OpsOS Supabase**:
```sql
-- Export all proforma projects and related data
COPY (
  SELECT * FROM proforma_projects WHERE org_id = 'your-org-id'
) TO '/tmp/proforma_projects.csv' CSV HEADER;

COPY (
  SELECT * FROM proforma_scenarios WHERE project_id IN (
    SELECT id FROM proforma_projects WHERE org_id = 'your-org-id'
  )
) TO '/tmp/proforma_scenarios.csv' CSV HEADER;

-- Repeat for all 20+ tables
```

**Import to New Proforma Supabase**:
```sql
COPY proforma_projects FROM '/tmp/proforma_projects.csv' CSV HEADER;
COPY proforma_scenarios FROM '/tmp/proforma_scenarios.csv' CSV HEADER;
-- Repeat for all tables
```

### 3.2 User/Org Migration

**Option A: Fresh Start**
- New users sign up independently
- No migration needed
- Simplest

**Option B: User Migration**
- Export OpsOS users who have proforma projects
- Create accounts in new system
- Send invitation emails with migration notice

**Recommendation**: Option A for MVP, Option B if you have paying customers with existing proforma data

---

## Phase 4: OpsOS Cleanup (Day 4)

### 4.1 Remove Proforma Code from OpsOS

**Delete Files** (~84 files):
```bash
# UI Pages
rm -rf app/(dashboard)/proforma
rm -rf app/(dashboard)/settings/proforma

# API Routes
rm -rf app/api/proforma
rm -rf app/api/settings/proforma

# Components
rm -rf components/proforma
rm components/settings/ProformaSettingsClient.tsx
rm components/settings/EnhancedProformaSettings.tsx
rm components/proforma/WageCalculationBreakdown.tsx

# Lib
rm -rf lib/proforma
rm lib/labor-rate-calculator.ts

# Scripts
rm scripts/backfill-proforma-defaults.ts
rm scripts/seed-proforma-categories.ts
rm setup-proforma-settings.sql
```

**Update Navigation**:
```typescript
// components/layout/Sidebar.tsx
// Remove these items:
- { href: '/proforma', label: 'Proforma Builder', icon: FileText }
- { href: '/settings/proforma', label: 'Proforma Settings', icon: Settings }
```

**Clean Database** (OPTIONAL - keep for historical data):
```sql
-- WARNING: Only run if you're sure you don't need the data
DROP TABLE IF EXISTS proforma_calc_runs CASCADE;
DROP TABLE IF EXISTS proforma_labor_positions CASCADE;
DROP TABLE IF EXISTS proforma_revenue_service_periods CASCADE;
-- Drop all 20+ proforma tables
```

**Recommendation**: Keep proforma tables in OpsOS database but remove all UI/API code. Tables are harmless if unused.

### 4.2 Update Documentation

**Remove from OpsOS Docs**:
- Any mention of proforma in README
- Remove proforma screenshots/references from audit docs

**Add Migration Notice**:
```markdown
## Proforma Module (Deprecated)

The Restaurant Proforma module has been spun out as a separate product.

**New Product**: [Restaurant Proforma Pro](https://restaurantproforma.com)

If you have existing proforma projects, contact support@opsos.com for migration assistance.
```

---

## Phase 5: New Product Launch Prep (Day 5)

### 5.1 Landing Page

**New Homepage** (`app/page.tsx`):
- Hero: "Build bulletproof restaurant proformas"
- Features: Revenue modeling, labor planning, P&L scenarios, sensitivity analysis
- Pricing table (if commercial)
- CTA: "Start Free Trial" or "Request Demo"

**Key Differentiators vs Spreadsheets**:
- Multi-scenario modeling (base/upside/downside)
- Built-in benchmarks (concept-specific seating, wages, etc.)
- Revenue center participation matrix
- Labor position templates with productivity tracking
- Pre-opening cost modeling
- Sensitivity analysis
- Audit trail for changes

### 5.2 Pricing Strategy

**Option A: SaaS Subscription**
- Starter: $99/mo (3 projects, 5 scenarios each)
- Professional: $299/mo (unlimited projects/scenarios)
- Enterprise: Custom (white-label, API access)

**Option B: Per-Project Licensing**
- $499 per proforma project (one-time)
- Includes unlimited scenarios and revisions
- Good for consultants/brokers who build one-off proformas

**Option C: Freemium**
- Free: 1 project, 3 scenarios
- Pro: $149/mo (unlimited)

### 5.3 Documentation

**New Docs Site** (or `/docs` route):
- Getting Started guide
- Video tutorials: "Build your first proforma in 10 minutes"
- Concept type benchmarks (SF/seat, labor productivity, COGS %)
- Labor wage calculation methodology
- Revenue center participation logic
- API documentation (if exposing APIs)

---

## Phase 6: Deployment (Day 6-7)

### 6.1 Vercel Deployment

**Production Setup**:
1. Connect GitHub repo to Vercel
2. Configure environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
3. Set up custom domain: `restaurantproforma.com`
4. Enable Vercel Analytics
5. Set up staging environment

**Vercel Edge Config** (for feature flags):
- Beta access control
- Feature toggles during launch

### 6.2 Monitoring & Analytics

**Vercel Analytics**: Page load times, user flows
**PostHog or Mixpanel**: Product analytics (project creation, scenario modeling)
**Sentry**: Error tracking
**LogSnag**: User activity notifications

### 6.3 Security Checklist

- [ ] Supabase RLS policies enabled on all tables
- [ ] Rate limiting on API routes (Vercel KV + Upstash)
- [ ] Input validation on all forms
- [ ] CSRF protection
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS protection (React auto-escaping + CSP headers)
- [ ] Secrets in environment variables (not committed)

---

## Decision Points for You

Before I start execution, confirm these choices:

### 1. Product Name
- [ ] Restaurant Proforma Pro
- [ ] ProForma
- [ ] VenueModeler
- [ ] Hospitality Proforma
- [ ] Other: _______________

### 2. Repository Location
- [ ] Create new GitHub repo under your account
- [ ] Create new GitHub org for the product
- [ ] Keep in same repo as OpsOS but separate app folder (monorepo)

### 3. Data Migration
- [ ] Fresh start (no data migration needed)
- [ ] Export and migrate existing proforma projects from OpsOS
- [ ] Keep proforma data in OpsOS database but allow new product to query it (shared DB)

### 4. Authentication
- [ ] Independent auth (new users sign up separately)
- [ ] Shared SSO with OpsOS (single sign-on)
- [ ] Both (independent by default, SSO for enterprise customers)

### 5. Pricing Model
- [ ] SaaS subscription ($99-299/mo)
- [ ] Per-project licensing ($499/project)
- [ ] Freemium (free tier + paid)
- [ ] Free/open-source (monetize via consulting or enterprise hosting)
- [ ] TBD (launch as private beta first)

### 6. Timeline
- [ ] Execute migration this week (7 days)
- [ ] Plan now, execute later (just prepare migration plan)
- [ ] Phased approach (move code first, launch marketing later)

### 7. OpsOS Database Cleanup
- [ ] Delete all proforma tables from OpsOS (clean slate)
- [ ] Keep proforma tables but remove UI/API (preserve historical data)
- [ ] Archive to separate schema (e.g., `proforma_archive.*`)

---

## Estimated Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1**: New project setup | 0.5 day | New repo, Supabase project, domain config |
| **Phase 2**: Code migration | 1.5 days | All components/APIs/migrations copied and adapted |
| **Phase 3**: Data migration (if needed) | 0.5 day | User/project data exported and imported |
| **Phase 4**: OpsOS cleanup | 0.5 day | All proforma code removed, nav updated |
| **Phase 5**: New product launch prep | 1 day | Landing page, docs, pricing page |
| **Phase 6**: Deployment | 0.5 day | Vercel config, DNS, monitoring |
| **Phase 7**: Testing & QA | 1 day | End-to-end testing, security review |
| **TOTAL** | **5-7 days** | Production-ready independent product |

---

## Next Steps

Once you confirm the decision points above, I will:

1. **Create new repository structure** with Next.js boilerplate
2. **Set up new Supabase project** and run migrations
3. **Copy and adapt all 84 files** from OpsOS to new product
4. **Build landing page and auth flows**
5. **Configure Vercel deployment**
6. **Remove all proforma code from OpsOS**
7. **Update OpsOS sidebar and documentation**
8. **Provide testing checklist and launch plan**

Ready to execute when you give the word.
