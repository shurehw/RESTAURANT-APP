# TipSee Cache System

High-performance caching layer for TipSee nightly reports. Syncs data from TipSee (Azure PostgreSQL) to Supabase nightly for sub-second report load times.

## Problem

Live TipSee queries were taking **60+ seconds**:
- 10 parallel queries to external Azure PostgreSQL database
- High network latency (cross-cloud data transfer)
- Connection pool contention

## Solution

**Nightly cron sync** that caches TipSee data in local Supabase:

```
┌─────────────┐     3am Daily Sync     ┌──────────────┐
│   TipSee    │ ──────────────────────> │   Supabase   │
│   (Azure)   │   Slow (10-60s)        │   (Cache)    │
└─────────────┘                         └──────────────┘
                                              │
                                              │ <1s
                                              ▼
                                        ┌──────────┐
                                        │   User   │
                                        └──────────┘
```

## Performance Improvement

| Metric | Before (Live) | After (Cached) | Improvement |
|--------|--------------|----------------|-------------|
| Load Time | 60+ seconds | <1 second | **60x faster** |
| Database Queries | 10 to TipSee | 1 to Supabase | 90% fewer queries |
| User Experience | Painful wait | Instant | ✅ Production-ready |

---

## Architecture

### 1. Database Schema (`212_tipsee_cache.sql`)

**`tipsee_nightly_cache`** - Cached daily reports
```sql
venue_id + business_date → report_data (JSONB)
```

**`tipsee_sync_log`** - Sync job audit trail
```sql
Tracks: success/failure, duration, venues synced
```

### 2. Cron Job (`/api/cron/sync-tipsee`)

Runs daily at **3am** via Vercel Cron:
1. Fetches all active venue mappings
2. Queries TipSee for yesterday's data
3. Caches reports in Supabase
4. Logs sync status

**Protected by:** `CRON_SECRET` environment variable

### 3. Updated API (`/api/nightly`)

Cache-first strategy:
```typescript
1. Check Supabase cache
2. If hit: Return immediately (<1s)
3. If miss: Fetch from TipSee (60s fallback)
```

---

## Setup

### 1. Run Migration

```bash
# Deploy cache tables
supabase db push
```

Or run `212_tipsee_cache.sql` in Supabase SQL Editor.

### 2. Set Environment Variable

Add `CRON_SECRET` to Vercel environment:

```bash
# Generate a secure random secret
openssl rand -base64 32

# Add to Vercel:
# Settings → Environment Variables → Add
# Name: CRON_SECRET
# Value: <your-generated-secret>
```

### 3. Deploy Vercel Cron

Push to production:

```bash
git push
```

Vercel automatically registers the cron job from `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-tipsee",
      "schedule": "0 3 * * *"
    }
  ]
}
```

### 4. Verify Cron is Running

Check Vercel Dashboard:
- Project → Settings → Cron Jobs
- Should show: `/api/cron/sync-tipsee` running at `0 3 * * *`

### 5. Backfill Historical Data (Optional)

Populate cache with past reports:

```bash
# Last 7 days
node scripts/backfill-tipsee-cache.mjs 7

# Last 30 days
node scripts/backfill-tipsee-cache.mjs 30

# Last 90 days (recommended)
node scripts/backfill-tipsee-cache.mjs 90
```

---

## Monitoring

### Check Sync Status

**SQL Query:**
```sql
SELECT * FROM get_latest_tipsee_sync();
```

**Expected Output:**
```
sync_date   | status    | venues_synced | duration_seconds
2026-02-08  | completed | 5             | 45.2
```

### View Sync History

```sql
SELECT
  sync_date,
  status,
  venues_synced,
  venues_failed,
  ROUND((total_duration_ms / 1000.0)::numeric, 2) as duration_sec,
  error_message
FROM tipsee_sync_log
ORDER BY started_at DESC
LIMIT 10;
```

### Check Cache Coverage

```sql
-- How many days cached per venue?
SELECT
  v.name as venue_name,
  COUNT(*) as days_cached,
  MIN(tnc.business_date) as oldest_date,
  MAX(tnc.business_date) as newest_date
FROM tipsee_nightly_cache tnc
INNER JOIN venues v ON v.id = tnc.venue_id
GROUP BY v.name
ORDER BY days_cached DESC;
```

---

## Testing

### 1. Manual Trigger (Development)

Test the cron job locally:

```bash
curl -X POST http://localhost:3000/api/cron/sync-tipsee \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 2. Force Live Query (Bypass Cache)

Test TipSee fallback:

```
/api/nightly?date=2026-02-08&location=abc123&force_live=true
```

### 3. Check Cache Hit/Miss

Look for console logs:
```
[nightly] Cache HIT for abc12345 2026-02-08   ← Fast (<1s)
[nightly] Cache MISS for abc12345 2026-02-08  ← Slow (60s)
```

---

## Troubleshooting

### Cron Not Running

**Check Vercel Dashboard:**
- Project → Deployments → Functions
- Look for `/api/cron/sync-tipsee` executions

**Check Logs:**
```bash
vercel logs --follow
```

**Common Issues:**
- `CRON_SECRET` not set → 401 Unauthorized
- No venue mappings → Completes with 0 venues synced
- TipSee timeout → Some venues fail, check `tipsee_sync_log.error_message`

### Reports Still Slow

**1. Check if cron ran:**
```sql
SELECT * FROM get_latest_tipsee_sync();
```

**2. Check if data is cached:**
```sql
SELECT COUNT(*) FROM tipsee_nightly_cache
WHERE business_date = '2026-02-08';
```

**3. Check venue mapping:**
```sql
SELECT * FROM venue_tipsee_mappings
WHERE tipsee_location_uuid = 'YOUR_LOCATION_UUID';
```

### Backfill Fails

**Missing TipSee credentials:**
```bash
# Check .env.local has these variables:
TIPSEE_DB_HOST
TIPSEE_DB_USER
TIPSEE_DB_PASSWORD
TIPSEE_DB_NAME
```

**TipSee connection timeout:**
- Increase pool timeout in script
- Run backfill in smaller batches (fewer days)

---

## Maintenance

### Clear Old Cache (Retention Policy)

Keep last 90 days only:

```sql
DELETE FROM tipsee_nightly_cache
WHERE business_date < CURRENT_DATE - INTERVAL '90 days';
```

**Recommendation:** Add a monthly cron job to clean old data.

### Re-sync Specific Date

If sync failed or data was corrected:

```sql
DELETE FROM tipsee_nightly_cache
WHERE business_date = '2026-02-08';

-- Then manually trigger cron or wait for next sync
```

---

## Future Enhancements

- [ ] **WTD/PTD Pre-aggregation** - Cache week/period totals for period view
- [ ] **Real-time Sync** - Webhook from TipSee when day closes
- [ ] **Selective Sync** - Only sync venues with recent activity
- [ ] **Compression** - Use PostgreSQL compression for report_data JSONB
- [ ] **CDN Caching** - Add Vercel Edge caching for GET requests

---

## Related Files

| File | Purpose |
|------|---------|
| `supabase/migrations/212_tipsee_cache.sql` | Database schema |
| `app/api/cron/sync-tipsee/route.ts` | Sync cron job |
| `app/api/nightly/route.ts` | Cache-first API |
| `scripts/backfill-tipsee-cache.mjs` | Historical data backfill |
| `vercel.json` | Cron schedule config |
| `lib/database/tipsee.ts` | TipSee query functions |

---

## Support

Questions? Check:
1. Vercel Dashboard → Cron Jobs
2. Supabase → SQL Editor → `SELECT * FROM tipsee_sync_log`
3. Application logs → `vercel logs --follow`
