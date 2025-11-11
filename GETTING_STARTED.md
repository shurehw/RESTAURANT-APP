# Getting Started with OpsOS

This guide will walk you through setting up OpsOS locally and deploying to production.

## Prerequisites

- **Node.js 18+** (recommend 20+)
- **npm** or **pnpm**
- **Docker Desktop** (for local Supabase)
- **Supabase CLI**: `npm install -g supabase`

## Local Development Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Start Supabase Locally

```bash
# Initialize Supabase (if not already done)
supabase init

# Start local Supabase instance
supabase start
```

**Important**: Save the output! You'll see:
- API URL (e.g., `http://localhost:54321`)
- Anon key
- Service role key
- Database URL

### Step 3: Apply Database Schema

```bash
# Reset database and apply all migrations
supabase db reset
```

This will:
- Drop existing tables
- Apply `supabase/migrations/001_initial_schema.sql`
- Seed sample data (2 venues, vendors, items, recipes)

### Step 4: Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# From supabase start output
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# POS Integration (optional for local dev)
TOAST_API_KEY=test_key
TOAST_RESTAURANT_GUID=test_guid
SQUARE_ACCESS_TOKEN=test_token
SQUARE_LOCATION_ID=test_location

# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 5: Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Verify Setup

### Check Database

```bash
# Connect to local Postgres
psql postgresql://postgres:postgres@localhost:54322/postgres

# List tables
\dt

# Query venues
SELECT * FROM venues;

# Check materialized views
SELECT * FROM v_item_latest_cost LIMIT 5;
SELECT * FROM v_recipe_cost_rollup LIMIT 5;
```

### Check Seeded Data

Navigate to:
- `/` - Dashboard (should show 2 venues)
- `/invoices` - No invoices yet (upload to create)
- `/items` - 10 items (espresso, milk, cups, etc.)
- `/budget` - Sample budgets for week starting 2025-11-03

## Production Deployment

### Option 1: Vercel + Supabase Cloud (Recommended)

#### A. Set up Supabase Project

1. Go to [supabase.com](https://supabase.com) → Create new project
2. Wait for project to initialize (~2 minutes)
3. Go to **SQL Editor** → New query
4. Copy/paste contents of `supabase/migrations/001_initial_schema.sql`
5. Run query (this may take 30-60 seconds)
6. Go to **Database** → **Extensions** → Enable `pg_cron`
7. Go to **Storage** → Create buckets:
   - `opsos-invoices` (Private, 100MB max file size)
   - `opsos-exports` (Private, 10MB max file size)

8. **Configure Storage Policies** (under Storage → Policies):

```sql
-- Allow Finance/Owner to read/write all files
CREATE POLICY "Finance can upload invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'opsos-invoices');

CREATE POLICY "Finance can read invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'opsos-invoices');
```

#### B. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Link project
vercel link

# Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Enter your Supabase project URL: https://xxxxx.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Enter your Supabase anon key (from Settings → API)

vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Enter your Supabase service_role key (from Settings → API)

# Add POS credentials
vercel env add TOAST_API_KEY production
vercel env add TOAST_RESTAURANT_GUID production
vercel env add SQUARE_ACCESS_TOKEN production
vercel env add SQUARE_LOCATION_ID production

# Deploy
vercel --prod
```

#### C. Verify Production

1. Visit your Vercel deployment URL
2. Check Supabase Dashboard → **Database** → **Cron Jobs**:
   - `refresh-cost-views-nightly` should be listed
   - `cost-spike-alerts-nightly` should be listed

### Option 2: Self-Hosted

**Requirements**:
- PostgreSQL 15+ with `pg_cron` extension
- Node.js server (PM2 recommended)
- Nginx/Caddy for reverse proxy
- S3-compatible storage for invoices/exports

**Setup**:

1. Apply schema to your Postgres instance:
   ```bash
   psql -h your-postgres-host -U postgres -d opsos < supabase/migrations/001_initial_schema.sql
   ```

2. Build Next.js app:
   ```bash
   npm run build
   ```

3. Run with PM2:
   ```bash
   pm2 start npm --name opsos -- start
   pm2 save
   pm2 startup
   ```

## Authentication Setup (TODO)

OpsOS currently uses Supabase RLS policies but requires JWT claims for proper role-based access.

### Configure Supabase Auth

1. Go to Supabase Dashboard → **Authentication** → **Providers**
2. Enable Email provider (or OAuth providers)
3. Go to **Authentication** → **Hooks** → Create custom access token hook:

```typescript
// Custom claims hook
export const handler = async (event, context) => {
  const { user } = event;

  // Fetch user role from your users table or metadata
  const role = user.user_metadata?.app_role || 'readonly';
  const venueId = user.user_metadata?.venue_id;

  return {
    claims: {
      app_role: role,
      venue_id: venueId,
    },
  };
};
```

4. Update RLS policies in schema to check JWT claims

## Data Population

### Importing Real Data

#### Vendors

```sql
-- CSV import example
COPY vendors (name, normalized_name, contact_email, payment_terms_days, r365_vendor_id)
FROM '/path/to/vendors.csv'
DELIMITER ','
CSV HEADER;
```

#### Items

```sql
COPY items (sku, name, category, base_uom)
FROM '/path/to/items.csv'
DELIMITER ','
CSV HEADER;
```

#### Recipes

Use the UI at `/recipes` or bulk import via SQL.

### POS Data Sync

#### Toast

```bash
# Create a scheduled task (cron or Vercel Cron Jobs)
# Run daily at 2am:
0 2 * * * curl -X POST https://your-app.vercel.app/api/pos/sync-toast
```

Implement `/api/pos/sync-toast/route.ts`:

```typescript
import { syncToastSales } from '@/lib/integrations/toast';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const businessDate = yesterday.toISOString().split('T')[0];

  await syncToastSales(
    '11111111-1111-1111-1111-111111111111', // Delilah LA
    businessDate,
    supabase
  );

  return new Response('OK', { status: 200 });
}
```

## Troubleshooting

### Issue: "relation does not exist"

**Solution**: Schema not applied. Run:
```bash
supabase db reset
```

### Issue: RLS policy denies access

**Solution**:
1. Check JWT claims include `app_role` and `venue_id`
2. For development, use service_role key instead of anon key
3. Verify RLS policies in Supabase Dashboard → Database → Tables → [table] → Policies

### Issue: Materialized views are stale

**Solution**:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY v_item_latest_cost;
REFRESH MATERIALIZED VIEW CONCURRENTLY v_recipe_cost_rollup;
```

Or call the function:
```sql
SELECT refresh_cost_views();
```

### Issue: pg_cron jobs not running

**Solution**:
1. Verify `pg_cron` extension is enabled
2. Check job schedule in Supabase Dashboard → Database → Cron Jobs
3. Manually trigger: `SELECT cron.schedule(...)`

### Issue: POS integration fails

**Solution**:
1. Check API credentials in environment variables
2. Verify API endpoint URLs (Toast/Square may change)
3. Check rate limits and quotas
4. Review API logs in Toast/Square dashboards

## Next Steps

1. **Implement Authentication**: Add Supabase Auth UI and custom claims
2. **Create Missing Pages**: Items, Inventory, Recipes, Alerts
3. **Add OCR Integration**: Implement `/invoices/upload` with Document AI/Textract
4. **Configure Alerts**: Set up email/Slack notifications for cost spikes
5. **Load Real Data**: Import your vendors, items, and recipes
6. **Set Up POS Sync**: Schedule daily Toast/Square sync jobs
7. **Configure R365**: Test CSV export format with R365 team

## Support

- **Documentation**: [README.md](README.md)
- **Issues**: Create GitHub issue
- **Emergency**: Contact Finance lead or Ops lead (see README)

---

**You're ready to start building! 🚀**
