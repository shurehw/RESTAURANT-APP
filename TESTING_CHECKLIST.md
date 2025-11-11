# OpsOS - Complete Testing Checklist

## 🎯 How to Test Everything Top to Bottom

### Prerequisites
- ✅ Migrations 017 & 018 ran in Supabase
- ✅ Dev server running at http://localhost:3003
- ✅ Database has sample data (venues, employees)

---

## 1️⃣ **Team Messaging System** (`/messages`)

### Test Direct Messages
1. Go to `/messages`
2. Click "New DM" button (message icon)
3. Select an employee from the list
4. Send a test message
5. **Expected:** Message appears in chat thread
6. **Verify:** Unread count badge shows on channel list

### Test Group Channels
1. Click "New Channel" (+ icon)
2. Fill in:
   - Name: "Test Team Chat"
   - Type: Group Channel
   - Add 2-3 members
3. Click "Create Channel"
4. **Expected:** New channel appears in sidebar
5. Send messages with @mentions (type @name)
6. **Verify:** Mentions are highlighted in blue

### Test Announcements
1. Look for "Announcements" channel (auto-created)
2. Send a message
3. **Expected:** All employees see it
4. **Verify:** Channel has megaphone icon

### Verify Features
- [ ] Channels show unread count badges
- [ ] Messages have timestamps
- [ ] Can search conversations
- [ ] Message threading works (if implemented)
- [ ] Emoji reactions appear (if clicked)

**API Tests:**
```bash
# Get channels
curl "http://localhost:3003/api/messages/channels?employee_id=YOUR_EMP_ID&venue_id=YOUR_VENUE_ID"

# Send message
curl -X POST http://localhost:3003/api/messages/send \
  -H "Content-Type: application/json" \
  -d '{"channel_id":"CHANNEL_ID","sender_id":"EMP_ID","message_text":"Test message"}'
```

---

## 2️⃣ **Advanced Time Clock** (`/timeclock` or kiosk)

### Test Early Clock-In Prevention
1. Find an employee's next shift in database
2. Try to clock in >15 minutes early
3. **Expected:** Error message: "Cannot clock in more than 15 minutes early"
4. **Verify:** No punch record created

**SQL Test:**
```sql
-- Check clock-in validation
SELECT * FROM can_clock_in(
  'EMPLOYEE_ID'::UUID,
  'VENUE_ID'::UUID,
  NOW()::TIMESTAMPTZ
);
-- Should return: allowed = false, reason = "Cannot clock in..."
```

### Test Overtime Prevention
1. Manually add 40 hours to an employee this week:
```sql
UPDATE shift_assignments
SET actual_hours = 10
WHERE employee_id = 'EMP_ID'
LIMIT 4;
```
2. Try to clock in
3. **Expected:** Error: "Overtime prevention: You have already worked 40 hours"

### Test Auto Clock-Out
```sql
-- Simulate long shift (insert 13 hours ago)
INSERT INTO time_punches (venue_id, employee_id, punch_type, punch_time)
VALUES ('VENUE_ID', 'EMP_ID', 'clock_in', NOW() - INTERVAL '13 hours');

-- Run auto-logout function
SELECT auto_clock_out_overtime_shifts();

-- Verify auto clock-out created
SELECT * FROM time_punches
WHERE employee_id = 'EMP_ID'
  AND is_auto_logout = TRUE
ORDER BY punch_time DESC
LIMIT 1;
```

**API Test:**
```bash
# Try to clock in (should validate)
curl -X POST http://localhost:3003/api/timeclock/punch \
  -F "employee_id=EMP_ID" \
  -F "venue_id=VENUE_ID" \
  -F "punch_type=clock_in"
```

---

## 3️⃣ **Break Tracking** (`/api/timeclock/breaks`)

### Test Break Start/End
1. Clock in first
2. Start a meal break:
```bash
curl -X POST http://localhost:3003/api/timeclock/breaks \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": "EMP_ID",
    "venue_id": "VENUE_ID",
    "break_type": "meal",
    "action": "start"
  }'
```
3. **Expected:** Success response with break ID
4. End break after 30 seconds:
```bash
curl -X POST http://localhost:3003/api/timeclock/breaks \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": "EMP_ID",
    "venue_id": "VENUE_ID",
    "break_type": "meal",
    "action": "end"
  }'
```
5. **Verify:** Break duration calculated correctly

**Database Verification:**
```sql
SELECT * FROM employee_breaks
WHERE employee_id = 'EMP_ID'
ORDER BY break_start DESC;
```

### Test Break Compliance
```sql
-- Check if breaks required after 5 hours
SELECT * FROM check_break_compliance('EMP_ID'::UUID, 5.5);
-- Should return required breaks
```

**UI Test (if integrated):**
- [ ] Break buttons appear when clocked in
- [ ] "On Break" status shows during break
- [ ] Break duration displays correctly
- [ ] Today's breaks list shows all breaks

---

## 4️⃣ **PIN Management** (`/settings/pins`)

### Test PIN Generation
1. Go to `/settings/pins`
2. **Expected:** See list of all employees with PINs
3. Click "Reset PIN" for an employee
4. **Expected:** New 4-digit PIN appears (write it down!)
5. **Verify:** PIN disappears after 30 seconds

**Database Verification:**
```sql
-- Check PIN created
SELECT
  ep.*,
  e.first_name,
  e.last_name
FROM employee_pins ep
JOIN employees e ON e.id = ep.employee_id
WHERE ep.venue_id = 'VENUE_ID'
ORDER BY ep.created_at DESC;
```

### Test PIN Security
```sql
-- Simulate failed attempts
UPDATE employee_pins
SET failed_attempts = 3,
    locked_until = NOW() + INTERVAL '15 minutes'
WHERE employee_id = 'EMP_ID';

-- Refresh /settings/pins page
-- Expected: Employee shows "Locked" badge
```

**API Test:**
```bash
# Generate new PIN
curl -X POST http://localhost:3003/api/employees/pins \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"EMP_ID","venue_id":"VENUE_ID"}'
```

---

## 5️⃣ **Schedule Templates**

### Test Save Template
1. Go to schedule page (wherever you have it)
2. Create a weekly schedule with multiple shifts
3. Open templates modal (if integrated)
4. Click "Save as Template"
5. Fill in:
   - Name: "Standard Week"
   - Type: Weekly
6. **Expected:** Template saved successfully

**Database Verification:**
```sql
SELECT * FROM schedule_templates
WHERE venue_id = 'VENUE_ID'
ORDER BY created_at DESC;

-- Check template data structure
SELECT
  name,
  template_type,
  jsonb_array_length(template_data) as shift_count
FROM schedule_templates;
```

### Test Apply Template
1. Create a new blank weekly schedule
2. Open templates modal
3. Click "Apply" on saved template
4. **Expected:** All shifts copied to new week
5. **Verify:**
   - Shift count matches template
   - Employee assignments correct
   - Times adjusted to new week dates

**API Test:**
```bash
# Get templates
curl "http://localhost:3003/api/schedule/templates?venue_id=VENUE_ID"

# Apply template
curl -X POST "http://localhost:3003/api/schedule/templates/TEMPLATE_ID/apply" \
  -H "Content-Type: application/json" \
  -d '{
    "week_start_date": "2025-01-13",
    "schedule_id": "SCHEDULE_ID"
  }'
```

---

## 6️⃣ **Integration Tests**

### Full Employee Flow
1. **Employee opens app on phone** → `/employee`
2. **Views schedule** → See this week's shifts
3. **Requests time off** → Submit vacation request
4. **Manager approves** → Status changes to "Approved"
5. **Employee clocks in** → Photo + GPS verification
6. **Takes meal break** → Start/end tracked
7. **Clocks out** → Hours calculated correctly

### Full Manager Flow
1. **View labor forecast** → `/labor/briefing`
2. **Check staffing requirements** → `/labor/requirements`
3. **Generate schedule** → `/labor/schedule`
4. **Save as template** → Reusable pattern created
5. **Review time punches** → Check flagged entries
6. **Reset employee PIN** → `/settings/pins`
7. **Send team message** → `/messages`

---

## 🔍 **Database Health Checks**

### Verify All Tables Exist
```sql
-- Check messaging tables
SELECT EXISTS (SELECT 1 FROM message_channels);
SELECT EXISTS (SELECT 1 FROM messages);
SELECT EXISTS (SELECT 1 FROM notifications);

-- Check time clock tables
SELECT EXISTS (SELECT 1 FROM employee_pins);
SELECT EXISTS (SELECT 1 FROM employee_breaks);
SELECT EXISTS (SELECT 1 FROM time_clock_settings);
SELECT EXISTS (SELECT 1 FROM schedule_templates);
```

### Verify Functions Work
```sql
-- Test can_clock_in
SELECT * FROM can_clock_in(
  (SELECT id FROM employees LIMIT 1),
  (SELECT id FROM venues LIMIT 1),
  NOW()
);

-- Test auto clock-out
SELECT auto_clock_out_overtime_shifts();

-- Test break compliance
SELECT * FROM check_break_compliance(
  (SELECT id FROM employees LIMIT 1),
  5.5
);

-- Test PIN generation
SELECT generate_employee_pin(
  (SELECT id FROM employees LIMIT 1),
  (SELECT id FROM venues LIMIT 1)
);
```

### Verify Triggers Fire
```sql
-- Insert test message
INSERT INTO messages (channel_id, sender_id, message_text)
VALUES (
  (SELECT id FROM message_channels LIMIT 1),
  (SELECT id FROM employees LIMIT 1),
  'Test message'
);

-- Check if channel updated
SELECT last_message_at, message_count
FROM message_channels
WHERE id = (SELECT id FROM message_channels LIMIT 1);

-- Check if unread counts incremented
SELECT unread_count FROM channel_members
WHERE channel_id = (SELECT id FROM message_channels LIMIT 1);
```

---

## 🚨 **Error Scenarios to Test**

### Should Prevent
- [ ] Clock in >15 mins early (Error 403)
- [ ] Clock in with >40 hrs this week (Error 403)
- [ ] Start break when already on break (Error 400)
- [ ] End break when not on break (Error 400)
- [ ] Request time off <24 hrs notice (Error 400)
- [ ] Apply template without schedule ID (Error 400)

### Should Handle Gracefully
- [ ] Duplicate message send (should just create duplicate)
- [ ] Clock in without GPS (should flag for review)
- [ ] Clock in without photo (should flag for review)
- [ ] Reset PIN while locked (should unlock)

---

## 📊 **Performance Checks**

### Page Load Times
- [ ] `/messages` loads <2 seconds
- [ ] `/settings/pins` loads <1 second
- [ ] API responses <500ms

### Query Performance
```sql
-- Should use indexes
EXPLAIN ANALYZE
SELECT * FROM messages
WHERE channel_id = 'CHANNEL_ID'
ORDER BY created_at DESC
LIMIT 50;

-- Should use index on employee_id
EXPLAIN ANALYZE
SELECT * FROM employee_breaks
WHERE employee_id = 'EMP_ID'
ORDER BY break_start DESC;
```

---

## ✅ **Final Checklist**

Core Features:
- [ ] Messages send and receive
- [ ] Early clock-in blocked
- [ ] Breaks track duration
- [ ] PINs generate unique codes
- [ ] Templates save and apply

Data Integrity:
- [ ] All foreign keys valid
- [ ] Triggers firing correctly
- [ ] Functions return expected results
- [ ] No orphaned records

Security:
- [ ] PIN lockout after 3 attempts
- [ ] RLS disabled (dev mode only!)
- [ ] Photo verification required

User Experience:
- [ ] All buttons work
- [ ] Error messages clear
- [ ] Loading states show
- [ ] Success confirmations appear

---

## 🎯 **Quick Smoke Test** (5 minutes)

Run these commands in order:

```bash
# 1. Get message channels
curl "http://localhost:3003/api/messages/channels?employee_id=$(psql -U postgres -d opsos -tAc "SELECT id FROM employees LIMIT 1")&venue_id=$(psql -U postgres -d opsos -tAc "SELECT id FROM venues LIMIT 1")"

# 2. Test clock-in prevention
curl -X POST http://localhost:3003/api/timeclock/punch -F "employee_id=$(psql -U postgres -d opsos -tAc "SELECT id FROM employees LIMIT 1")" -F "venue_id=$(psql -U postgres -d opsos -tAc "SELECT id FROM venues LIMIT 1")" -F "punch_type=clock_in"

# 3. Get PINs
curl "http://localhost:3003/api/employees/pins?venue_id=$(psql -U postgres -d opsos -tAc "SELECT id FROM venues LIMIT 1")"

# 4. Get templates
curl "http://localhost:3003/api/schedule/templates?venue_id=$(psql -U postgres -d opsos -tAc "SELECT id FROM venues LIMIT 1")"
```

If all 4 return valid JSON (not errors), core functionality works! ✅
