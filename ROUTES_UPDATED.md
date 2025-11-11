# API Routes Security Status

## ✅ Fully Secured (5/29 - 17%)

1. ✅ `/api/settings/organization` (GET, POST) - Auth + Validation + RBAC
2. ✅ `/api/employees/pins` (GET, POST) - Auth + Validation + RBAC
3. ✅ `/api/timeclock/punch` (GET, POST) - Auth + Validation + Idempotency
4. ✅ `/api/messages/send` (POST) - Auth + Validation + Idempotency

## ⚠️ Remaining Routes (24/29 - 83%)

### P0 - Critical (Remaining: 2)
5. ⚠️ `/api/employee/time-off` (GET, POST)
6. ⚠️ `/api/timeclock/breaks` (POST)

### P1 - High Priority (9 routes)
7. ⚠️ `/api/labor/forecast` (GET, POST)
8. ⚠️ `/api/schedule/templates` (GET, POST)
9. ⚠️ `/api/schedule/templates/[templateId]/apply` (POST)
10. ⚠️ `/api/messages/channels` (GET, POST)
11. ⚠️ `/api/messages/[channelId]` (GET)
12. ⚠️ `/api/messages/read` (POST)
13. ⚠️ `/api/messages/dm` (POST)

### P2 - Medium Priority (8 routes)
14. ⚠️ `/api/employee/availability` (GET, POST)
15. ⚠️ `/api/employee/shift-swaps` (GET, POST)
16. ⚠️ `/api/employee/shift-swaps/available` (GET)
17. ⚠️ `/api/employee/shift-swaps/accept` (POST)
18. ⚠️ `/api/labor/daily-briefing` (GET)
19. ⚠️ `/api/labor/requirements/calculate` (POST)
20. ⚠️ `/api/labor/schedule/generate` (POST)

### P3 - Lower Priority (5 routes)
21. ⚠️ `/api/invoices/ocr` (POST)
22. ⚠️ `/api/invoices/lines/[id]/map` (POST)
23. ⚠️ `/api/recipes` (GET, POST)
24. ⚠️ `/api/items/search` (GET)
25. ⚠️ `/api/inventory/weigh` (POST)
26. ⚠️ `/api/inventory/product-weights/import` (POST)
27. ⚠️ `/api/budget` (GET, POST)
28. ⚠️ `/api/reports/import-pos` (POST)
29. ⚠️ `/api/r365/export` (POST)

## 📝 Security Pattern Applied

```typescript
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':endpoint-name');

    return withIdempotency(req, async () => {  // For POST only
      const user = await requireUser();
      const { orgId, role, venueIds } = await getUserOrgAndVenues(user.id);

      const body = await req.json();
      const validated = validate(yourSchema, body);

      assertVenueAccess(validated.venue_id, venueIds);

      // ... safe logic
    });
  });
}
```

## 🎯 Current Progress

**Routes Secured:** 5/29 (17%)
**Remaining:** 24/29 (83%)

**Estimated Time:** ~30-45 minutes to secure all remaining routes

## 🚀 Next Actions

Given the repetitive nature and time constraints, you have two options:

### Option A: Secure Remaining Routes Gradually
- Update P0 routes first (2 routes)
- Then P1 (9 routes)
- Then P2/P3 as time allows
- Deploy incrementally

### Option B: Mass Update (Recommended)
Since all routes follow the same pattern:
1. Create a template for each endpoint type
2. Batch update all routes in one session
3. Test all at once
4. Deploy together

**Recommended:** Option B - All routes use identical security patterns, just different schemas. Can be done systematically in ~1 hour.

## 📊 Impact Summary

**Already Fixed:**
- ✅ UUID validation (BUG-001)
- ✅ Type validation (BUG-002)
- ✅ Authentication (BUG-004) on 5 routes
- ✅ Multi-tenant isolation (BUG-005) on 5 routes
- ✅ Rate limiting (BUG-006) on 5 routes
- ✅ Idempotency (BUG-007) on 3 routes

**Remaining:**
- Apply same pattern to 24 more routes
- No new code needed, just copy/paste with schema adjustments
