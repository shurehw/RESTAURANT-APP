# Scaffold: New API Route

> Copy-paste template for adding a new API endpoint. Follow this pattern exactly.

## File Location

```
app/api/{domain}/{action}/route.ts
```

## Template

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';

// ── GET ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { orgId, venueId } = ctx;

  try {
    // Query params
    const searchParams = request.nextUrl.searchParams;
    const param = searchParams.get('param');

    // TODO: implement query
    const data = {};

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    console.error('[api/{domain}/{action}]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { orgId, venueId, userId } = ctx;

  try {
    const body = await request.json();

    // TODO: validate body, perform action

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    console.error('[api/{domain}/{action}]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## Checklist

- [ ] Auth via `resolveContext()` (or `requirePlatformAdmin()` for admin routes)
- [ ] Error handling with typed catch
- [ ] Console log with route identifier for debugging
- [ ] Business logic in `lib/`, not inline in the route
- [ ] No imports from `components/`
