# Sentry Setup Guide

## Overview

Sentry has been configured for error tracking and performance monitoring in your restaurant management app. This guide covers completing the setup and using Sentry effectively.

## ⚠️ Important: Next.js Version Note

You're using Next.js 16.1.6, but Sentry's current stable release officially supports up to Next.js 15. We've installed Sentry with `--legacy-peer-deps` flag. This should work fine as Sentry typically supports newer Next.js versions before official announcements. Monitor the [Sentry changelog](https://github.com/getsentry/sentry-javascript/releases) for Next.js 16 official support.

## Files Created

1. **Configuration Files:**
   - `sentry.client.config.ts` - Client-side error tracking
   - `sentry.server.config.ts` - Server-side error tracking with restaurant context
   - `sentry.edge.config.ts` - Edge runtime error tracking
   - `instrumentation.ts` - Next.js instrumentation hook

2. **Utilities:**
   - `lib/monitoring/sentry.ts` - Restaurant-specific Sentry helpers

3. **Examples:**
   - `app/api/health/route-with-sentry-example.ts` - Example API route with Sentry

4. **Config Updates:**
   - `next.config.ts` - Added Sentry webpack plugin
   - `.env.example` - Added Sentry environment variables
   - `.gitignore` - Added Sentry ignore patterns

## Setup Steps

### 1. Create a Sentry Account (if you don't have one)

1. Go to [sentry.io](https://sentry.io)
2. Sign up for free tier (5,000 errors/month)
3. Create a new organization or use existing

### 2. Create a Sentry Project

1. In Sentry dashboard, click "Create Project"
2. Platform: **Next.js**
3. Alert frequency: Choose based on preference (I recommend "On every new issue")
4. Project name: `restaurant-app` (or your preference)
5. Copy the **DSN** (Data Source Name) - looks like: `https://xxx@sentry.io/yyy`

### 3. Generate an Auth Token

For uploading source maps during builds:

1. Go to Settings → Account → API → Auth Tokens
2. Click "Create New Token"
3. Scopes needed:
   - `project:read`
   - `project:releases`
   - `org:read`
4. Copy the token

### 4. Update Environment Variables

Add to your `.env.local` file:

```bash
# Sentry Error Monitoring
NEXT_PUBLIC_SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/7654321
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=restaurant-app
SENTRY_AUTH_TOKEN=sntrys_your_auth_token_here
```

**Important:**
- `NEXT_PUBLIC_SENTRY_DSN` is public and safe to expose to the client
- `SENTRY_AUTH_TOKEN` is secret - keep it in `.env.local` (already in .gitignore)

### 5. Test the Setup

Start your dev server:

```bash
npm run dev
```

To test error tracking, create a test error:

```typescript
// In any component or API route
import * as Sentry from '@sentry/nextjs';

// Trigger a test error
Sentry.captureException(new Error('Test error from restaurant app'));
```

Check your Sentry dashboard - you should see the error appear within a few seconds.

### 6. Deploy Configuration

When deploying (Vercel, etc.), add the environment variables:

```bash
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_AUTH_TOKEN=...
```

## Using Sentry in Your App

### Basic Error Tracking

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  // Your code
} catch (error) {
  Sentry.captureException(error);
  throw error;
}
```

### Restaurant-Specific Context

Use the helpers in `lib/monitoring/sentry.ts`:

```typescript
import {
  setRestaurantContext,
  captureRestaurantError,
  trackAIReviewPerformance,
} from '@/lib/monitoring/sentry';

// In an API route
export async function POST(request: NextRequest) {
  const { venueId, businessDate } = await request.json();

  // Set context for this request
  setRestaurantContext({
    venueId,
    businessDate,
    operation: 'comp_review',
  });

  try {
    // Your logic
  } catch (error) {
    // Capture with restaurant context
    captureRestaurantError(error, {
      venueId,
      businessDate,
      operation: 'comp_review',
    });

    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

### Track AI Review Performance

```typescript
import { trackAIReviewPerformance } from '@/lib/monitoring/sentry';

const startTime = Date.now();
// ... run AI comp review ...
const duration = Date.now() - startTime;

trackAIReviewPerformance(venueId, businessDate, compCount, duration);
```

### API Performance Tracking

```typescript
import { trackAPIPerformance } from '@/lib/monitoring/sentry';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Your API logic
    const duration = Date.now() - startTime;
    trackAPIPerformance('/api/health', 'GET', 200, duration);
    return NextResponse.json({ ... });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackAPIPerformance('/api/health', 'GET', 500, duration);
    throw error;
  }
}
```

## Key Features Configured

### 1. Error Tracking
- ✅ Client-side errors (React errors, unhandled exceptions)
- ✅ Server-side errors (API routes, server components)
- ✅ Edge runtime errors

### 2. Performance Monitoring
- ✅ 10% of transactions sampled (configurable in `sentry.*.config.ts`)
- ✅ Custom metrics for AI review duration
- ✅ API route performance tracking

### 3. Session Replay
- ✅ 100% of sessions with errors captured
- ✅ 10% of normal sessions captured
- ✅ All text and media masked for privacy

### 4. Restaurant Context
- ✅ Venue ID tagged on errors
- ✅ Business date tracking
- ✅ Employee/Manager ID tracking
- ✅ Operation type (comp_review, labor_calc, etc.)

### 5. Privacy & Security
- ✅ Sensitive headers filtered (authorization, cookies)
- ✅ Sensitive query params filtered (tokens, API keys)
- ✅ Development errors not sent to Sentry
- ✅ PII masking in session replay

## Sentry Dashboard Features

### Issues
- See all errors grouped by type
- Filter by venue ID, operation type, or date
- View full stack traces with source maps
- See user actions leading to errors (breadcrumbs)

### Performance
- Monitor slow API routes
- Track AI review performance trends
- Identify bottlenecks by venue

### Releases
- Track which deploy introduced bugs
- Compare error rates between releases
- Automatic source map upload on build

### Alerts
Set up alerts for:
- New error types
- Error rate spikes
- Slow API routes
- Specific venues having issues

## Recommended Alerts

Create these alerts in Sentry:

1. **Critical API Errors**
   - When: Any error in `/api/health`, `/api/comp-analysis`
   - Notify: Immediately via email/Slack

2. **High Error Rate**
   - When: >10 errors in 1 hour
   - Notify: Email/Slack

3. **Venue-Specific Issues**
   - When: Errors for specific venue_id spike
   - Notify: Venue manager via webhook

4. **AI Review Failures**
   - When: Error with `operation:comp_review` tag
   - Notify: Immediately (revenue impact)

## Cost Management

### Free Tier Limits
- 5,000 errors/month
- 10,000 performance transactions/month

### Optimize Usage
We've configured:
- 10% performance sampling (adjustable in configs)
- 10% session replay sampling
- Development errors filtered out

### Monitor Usage
Check your Sentry quota at: Settings → Subscription

If you exceed limits, adjust sampling rates in:
- `sentry.client.config.ts` - `tracesSampleRate`
- `sentry.server.config.ts` - `tracesSampleRate`

## Integration with Control Plane

Future enhancement: Create manager actions from Sentry errors

```typescript
// When high-priority error occurs
const error = await captureRestaurantError(error, context);

// Auto-create manager action
await supabase.from('manager_actions').insert({
  venue_id: context.venueId,
  title: `System Error: ${error.message}`,
  description: `Sentry Issue: ${sentryIssueUrl}`,
  priority: 'urgent',
  created_at: new Date().toISOString(),
});
```

## Troubleshooting

### Errors not appearing in Sentry
1. Check `NEXT_PUBLIC_SENTRY_DSN` is set
2. Verify you're not in development mode (we filter dev errors)
3. Check browser console for Sentry init errors
4. Verify DSN is correct in Sentry dashboard

### Source maps not uploading
1. Check `SENTRY_AUTH_TOKEN` is set
2. Verify token has `project:releases` scope
3. Run `npm run build` and check for upload logs

### High error volume
1. Check for error loops (same error repeating)
2. Review `beforeSend` filters in configs
3. Adjust sample rates if needed

## Next Steps

1. ✅ Complete environment variable setup
2. ✅ Test error tracking in development
3. ✅ Add Sentry to critical API routes (see example)
4. ✅ Set up Slack/email alerts
5. ✅ Configure release tracking
6. ✅ Add Sentry context to AI comp review
7. ✅ Track performance metrics for key operations

## Resources

- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Best Practices](https://docs.sentry.io/platforms/javascript/best-practices/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Session Replay](https://docs.sentry.io/product/session-replay/)
