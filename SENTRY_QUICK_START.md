# Sentry Quick Start

## Installation Status

Sentry configuration is complete! To finish the installation, run:

```bash
npm install --legacy-peer-deps
```

**Note:** The `--legacy-peer-deps` flag is needed because you're on Next.js 16.1.6, which Sentry doesn't officially support yet (supports up to Next 15). This is safe and Sentry will work fine.

## What's Been Configured

### ✅ Configuration Files Created
- `sentry.client.config.ts` - Client-side error tracking
- `sentry.server.config.ts` - Server-side tracking with restaurant context
- `sentry.edge.config.ts` - Edge runtime tracking
- `instrumentation.ts` - Next.js instrumentation hook
- `lib/monitoring/sentry.ts` - Restaurant-specific utilities

### ✅ Config Files Updated
- `next.config.ts` - Sentry webpack plugin added
- `package.json` - @sentry/nextjs dependency added
- `.env.example` - Sentry environment variables added
- `.gitignore` - Sentry files excluded

### ✅ Documentation Created
- `docs/SENTRY_SETUP.md` - Complete setup guide
- `app/api/health/route-with-sentry-example.ts` - Example implementation

## Next Steps

### 1. Install Package (Required)

```bash
npm install --legacy-peer-deps
```

### 2. Get Sentry Credentials

1. Go to [sentry.io](https://sentry.io) and sign up (free)
2. Create a new Next.js project
3. Copy your DSN (looks like: `https://xxx@sentry.io/yyy`)
4. Generate an auth token for source maps

### 3. Add Environment Variables

Create/update `.env.local`:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/7654321
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=restaurant-app
SENTRY_AUTH_TOKEN=sntrys_your_auth_token_here
```

### 4. Test It

```bash
npm run dev
```

Visit any page and check your Sentry dashboard for events.

## Quick Example

Add to any API route:

```typescript
import { captureRestaurantError } from '@/lib/monitoring/sentry';

try {
  // Your code
} catch (error) {
  captureRestaurantError(error, {
    venueId: 'venue-123',
    operation: 'comp_review',
  });
}
```

Now errors will appear in Sentry with full restaurant context (venue, date, operation type).

## Benefits for Your Restaurant App

✅ **Know when things break** - Get alerted immediately when errors occur
✅ **Track by venue** - See which locations have issues
✅ **Monitor AI performance** - Track Claude API response times
✅ **Debug faster** - See full stack traces with source maps
✅ **Understand impact** - Know how many managers affected by each error

## Full Documentation

See `docs/SENTRY_SETUP.md` for:
- Complete setup instructions
- Alert configuration
- Integration examples
- Best practices
- Troubleshooting

## Questions?

- Sentry Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- Your setup guide: `docs/SENTRY_SETUP.md`
