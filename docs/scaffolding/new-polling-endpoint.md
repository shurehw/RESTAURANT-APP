# Scaffold: New Polling / Cron Endpoint

> Template for time-sensitive polling endpoints triggered by external schedulers.
> Use this pattern for anything that needs < 1 minute precision.

## Architecture

```
External Scheduler (QStash/cron-job.org)
    ↓ HTTP GET/POST
app/api/{domain}/poll/route.ts
    ↓ per-venue processing
lib/database/{domain}.ts queries
    ↓ results
Supabase tables
```

## File Location

```
app/api/{domain}/poll/route.ts
```

## Template

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

// Auth: external scheduler uses shared secret, not user session
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  return !!expected && authHeader === `Bearer ${expected}`;
}

// Business date: before 5 AM = previous day
function getBusinessDate(): string {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const businessDate = getBusinessDate();

  try {
    // Get active venues/targets for this poll
    const svc = getServiceClient();
    const { data: targets } = await (svc as any)
      .from('{target_table}')
      .select('*')
      .eq('is_active', true);

    if (!targets || targets.length === 0) {
      return NextResponse.json({ message: 'No active targets', date: businessDate });
    }

    // Process all venues in parallel (fault-tolerant)
    const results = await Promise.allSettled(
      targets.map(async (target: any) => {
        // TODO: per-target processing
        return { id: target.id, status: 'ok' };
      })
    );

    const summary = {
      date: businessDate,
      total: results.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    };

    console.log(`[{domain}/poll] ${JSON.stringify(summary)}`);
    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Poll failed';
    console.error('[{domain}/poll]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## Scheduler Configuration

Add to `vercel.json` crons (if Vercel cron acceptable for this frequency):
```json
{
  "path": "/api/{domain}/poll",
  "schedule": "*/5 15-23,0-4 * * *"
}
```

Or use external scheduler (QStash/cron-job.org) for sub-minute precision.

## Checklist

- [ ] Auth via `CRON_SECRET` bearer token (not user session)
- [ ] Business date logic (before 5 AM = previous day)
- [ ] `Promise.allSettled()` for per-venue processing (fault-tolerant)
- [ ] Service hours check (skip polling outside configured hours)
- [ ] Console log with structured summary
- [ ] No imports from `components/`
