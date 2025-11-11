# Implementation Guide - Securing Remaining API Routes

## ✅ What's Done

- ✅ Security infrastructure created (auth, tenant, validate, rate-limit, etc.)
- ✅ RLS policies deployed (migrations 019, 020, 021)
- ✅ 2 routes fully secured (settings/organization, employees/pins)
- ✅ Security headers configured

## 🔨 What's Next

### Step 1: Update Remaining 27 API Routes

Apply this pattern to each route:

```typescript
// BEFORE (vulnerable)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  try {
    const body = await request.json();
    // ... direct logic
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// AFTER (secure)
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':endpoint-name');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { orgId, role, venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(yourSchema, body);

      // Validate access
      assertVenueAccess(validated.venue_id, venueIds);
      assertRole(role, ['owner', 'admin', 'manager']); // if needed

      const supabase = await createClient();
      // ... safe logic using validated data

      return NextResponse.json({ success: true, data });
    });
  });
}
```

### Step 2: Priority Order for Route Updates

**P0 - Critical (Do First):**
1. `/api/timeclock/punch` - Clock in/out
2. `/api/messages/send` - Send messages
3. `/api/employee/time-off` - Time-off requests
4. `/api/timeclock/breaks` - Break tracking

**P1 - High (Do Next):**
5. `/api/labor/forecast` - Demand forecasting
6. `/api/schedule/templates` - Schedule templates
7. `/api/schedule/templates/[templateId]/apply` - Apply template
8. `/api/messages/channels` - Message channels
9. `/api/messages/[channelId]` - Channel messages
10. `/api/messages/read` - Mark as read
11. `/api/messages/dm` - Direct messages

**P2 - Medium:**
12. `/api/employee/availability` - Availability
13. `/api/employee/shift-swaps` - Shift swaps
14. `/api/employee/shift-swaps/available` - Available swaps
15. `/api/employee/shift-swaps/accept` - Accept swap
16. `/api/labor/daily-briefing` - Daily briefing
17. `/api/labor/requirements/calculate` - Labor requirements
18. `/api/labor/schedule/generate` - Auto-scheduling

**P3 - Lower Priority:**
19. `/api/invoices/ocr` - Invoice OCR
20. `/api/invoices/lines/[id]/map` - Invoice mapping
21. `/api/recipes` - Recipes
22. `/api/items/search` - Item search
23. `/api/inventory/weigh` - Scale integration
24. `/api/inventory/product-weights/import` - Weight import
25. `/api/budget` - Budget
26. `/api/reports/import-pos` - POS import
27. `/api/r365/export` - R365 export

### Step 3: Testing Checklist

After updating each route, test:

```bash
# 1. Test authentication required (401)
curl -i http://localhost:3003/api/YOUR_ENDPOINT
# Expected: HTTP/1.1 401 Unauthorized

# 2. Test with valid auth (200)
# First, get a token by logging in through your app
curl -i http://localhost:3003/api/YOUR_ENDPOINT \
  -H "Authorization: Bearer YOUR_TOKEN"
# Expected: HTTP/1.1 200 OK

# 3. Test validation (400)
curl -i -X POST http://localhost:3003/api/YOUR_ENDPOINT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invalid":"data"}'
# Expected: HTTP/1.1 400 Bad Request with validation errors

# 4. Test rate limiting (429)
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:3003/api/YOUR_ENDPOINT \
    -H "Authorization: Bearer YOUR_TOKEN" &
done; wait
# Expected: First ~100 return 200, then 429
```

### Step 4: Create Validation Schemas

Add schemas to `lib/validate.ts` as needed:

```typescript
// Example: Time clock punch schema (already exists)
export const timePunchSchema = z.object({
  employee_id: uuid,
  venue_id: uuid,
  punch_type: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  punch_time: dateString.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

// Add more as needed for each endpoint
```

## 🚀 Quick Start: Update Your First Route

Let's update `/api/timeclock/punch` as an example:

1. **Open the file:**
   ```
   app/api/timeclock/punch/route.ts
   ```

2. **Add imports at the top:**
   ```typescript
   import { guard } from '@/lib/route-guard';
   import { requireUser } from '@/lib/auth';
   import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
   import { rateLimit } from '@/lib/rate-limit';
   import { validate, assertContentType, timePunchSchema } from '@/lib/validate';
   import { withIdempotency } from '@/lib/idempotency';
   ```

3. **Wrap the handler:**
   ```typescript
   export async function POST(request: NextRequest) {
     return guard(async () => {
       rateLimit(request, ':timeclock-punch');

       return withIdempotency(request, async () => {
         assertContentType(request, ['multipart/form-data', 'application/json']);

         const user = await requireUser();
         const { venueIds } = await getUserOrgAndVenues(user.id);

         // Get form data or JSON
         const formData = await request.formData();
         const data = {
           employee_id: formData.get('employee_id') as string,
           venue_id: formData.get('venue_id') as string,
           punch_type: formData.get('punch_type') as string,
         };

         const validated = validate(timePunchSchema, data);
         assertVenueAccess(validated.venue_id, venueIds);

         // ... rest of your logic
       });
     });
   }
   ```

4. **Test it:**
   ```bash
   curl -i -X POST http://localhost:3003/api/timeclock/punch
   # Should return 401
   ```

## 📊 Progress Tracking

Create a simple checklist:

```markdown
## Route Security Progress

- [x] /api/settings/organization (GET, POST)
- [x] /api/employees/pins (GET, POST)
- [ ] /api/timeclock/punch (GET, POST)
- [ ] /api/messages/send (POST)
- [ ] /api/employee/time-off (POST)
- [ ] /api/timeclock/breaks (POST)
... (continue for all 29 routes)
```

## 🔍 Common Issues & Solutions

### Issue 1: "No organization access" error
**Solution:** Make sure user exists in `organization_users` table:
```sql
INSERT INTO organization_users (organization_id, user_id, role)
VALUES ('your-org-id', 'your-user-id', 'owner');
```

### Issue 2: Rate limit triggering too fast
**Solution:** Adjust rate limit per endpoint:
```typescript
rateLimit(request, ':slow-endpoint'); // Uses shared bucket
// OR increase capacity in lib/rate-limit.ts
```

### Issue 3: Validation errors unclear
**Solution:** Check the `details` field in error response:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request payload",
  "details": {
    "fieldErrors": {
      "employee_id": ["Invalid UUID format"]
    }
  }
}
```

## 🎯 End Goal

When all routes are updated:

✅ All 29 endpoints require authentication
✅ All requests validated with Zod schemas
✅ All endpoints enforce multi-tenant isolation
✅ Rate limiting protects against abuse
✅ Idempotency prevents duplicate operations
✅ RLS policies provide defense in depth
✅ Security headers protect against common attacks

## 📝 Final Deployment Checklist

Before going to production:

- [ ] All 29 routes updated with auth + validation
- [ ] All routes tested (auth, validation, RBAC)
- [ ] Rate limiter replaced with Redis/Upstash
- [ ] Monitoring/alerting set up for 401/403/429 errors
- [ ] Load testing completed
- [ ] Security audit/pen test performed
- [ ] Documentation updated for frontend team
- [ ] Backup/recovery tested

## 🆘 Need Help?

Reference files:
- **Pattern examples:** `app/api/settings/organization/route.ts`, `app/api/employees/pins/route.ts`
- **All utilities:** `lib/auth.ts`, `lib/tenant.ts`, `lib/validate.ts`, etc.
- **Full details:** `SECURITY_REMEDIATION_SUMMARY.md`
- **Bug context:** `QA_SECURITY_REPORT.md`

---

**Current Status:** 2/29 routes secured (7%)
**Next Step:** Update `/api/timeclock/punch` using the pattern above
