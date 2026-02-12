# Labor Scheduling Methodology — Delilah LA

## Complete Reference: Data Sources, Formulas, Calculations & Logic

**Last Updated:** February 2026
**Venue:** Delilah LA (Supper Club) | Venue ID: `11111111-1111-1111-1111-111111111111`
**Scheduler:** `python-services/scheduler/auto_scheduler.py`

---

## 1. Data Sources (Postgres Tables Used)

### Primary Data Source: `server_day_facts` (Ground Truth)

This is the **actual POS data from Toast** — the single source of truth for covers forecasting.

| Field | Description |
|-------|-------------|
| `employee_name` | Real server/bartender/manager name from POS |
| `employee_role` | Server, Bartender, Manager, Admin, Events, Sommelier |
| `covers_count` | Covers attributed to this employee for the night |
| `gross_sales` | Dollar sales for this employee |
| `net_sales` | Net sales after discounts |
| `checks_count` | Number of checks/tables |
| `venue_id` | Which venue |
| `business_date` | The operating date |

**Data volume:** 847 rows, 78 distinct business dates (Nov 7, 2025 — Feb 4, 2026)
**Days sampled:** Tue=13, Wed=12, Thu=9, Fri=13, Sat=13, Sun=13 nights (Monday = closed)

**How covers are calculated from this table:**
For each business_date, we sum the MAX covers across all servers (since covers overlap between server and bartender attribution):
```sql
SELECT business_date, day_of_week,
       MAX(total_covers) as covers
FROM (
    SELECT business_date, day_of_week,
           SUM(covers_count) as total_covers
    FROM server_day_facts
    WHERE venue_id = '11111111-...' AND employee_role = 'Server'
    GROUP BY business_date, day_of_week
) sub
GROUP BY business_date, day_of_week
```

### Derived Forecast: `hourly_forecast.json`

This file is **derived from `server_day_facts`** using the P75+10% method (see Section 3). It contains:
- Per-day covers and revenue
- Hour-by-hour on-floor counts for Servers and Bartenders
- Used by the scheduler when the `demand_forecasts` DB table has no matching dates

### Employee Roster: `employees` table

| Column | Description |
|--------|-------------|
| `first_name`, `last_name` | Employee name |
| `primary_position_id` | FK to `positions` table |
| `employment_status` | `active` / `inactive` |
| `max_hours_per_week` | Weekly hour cap (typically 40h) |
| `is_full_time` | Boolean |
| `venue_id` | Which venue |

**Current active roster: 55 employees**

| Position | Count | Source | Names |
|----------|-------|--------|-------|
| **Server** | 12 | POS (server_day_facts) | Alexah Maldonado, Alexander Steel, Andrea Christensen, Demi Pinkus, Edelmiro Zuniga, Eduardo A Finlay, Kendra Whitfield, Kyli Aguilera, Lucas Hubner, Mathew Llanos, Michael Seitz, Eli Stein |
| **Bartender** | 8 | POS (server_day_facts) | Kyle Lewis, Eddie Chang, Ian Buckley, Emily Garguilo, Anthony Wells, Melissa Wright, Maximillian Boyens, Jaclyn Huggins |
| **General Manager** | 2 | POS (server_day_facts) | Tony Harth, Scott Ruwart |
| **Shift Manager** | 9 | POS (server_day_facts) | Michael Spiropoulos, Jordan Delgiudice, John Reyes, Adam Olson, Kelly Quinlan, Alex Weil, Sean Jemai, Alan Inoue, Gabrielle Rubin |
| **Assistant Manager** | 1 | Seed data | Andrew Young |
| **Line Cook** | 4 | Seed data (no POS tracking for BOH) | Marco Rivera, David Kim, Carlos Torres, Anthony Nguyen |
| **Prep Cook** | 2 | Seed data | Luis Hernandez, Jose Sanchez |
| **Dishwasher** | 4 | Seed data | Miguel Ramirez, Angel Flores, Carlos Mendez, Victor Soto |
| **Sous Chef** | 1 | Seed data | Thomas Wright |
| **Executive Chef** | 1 | Seed data | Robert Morales |
| **Host** | 3 | Seed data | Ashley White, Megan Lopez, Rachel Kim |
| **Busser** | 3 | Seed data | Ryan Garcia, Tyler Harris, Nathan Clark |
| **Food Runner** | 5 | Seed data | Kevin Hall, Brandon Allen, Diego Vargas, Jason Park, Andre Thompson |

> **Note:** BOH and FOH support roles (Busser, Host, Food Runner, Line Cook, etc.) are NOT tracked by Toast POS. Their names are placeholder data. FOH primary roles (Server, Bartender) and Managers are real names from POS.

### Position Definitions: `positions` table

| Position | Category | Hourly Rate | Tipped? |
|----------|----------|-------------|---------|
| Server | front_of_house | $15.00 | Yes |
| Bartender | front_of_house | $16.00 | Yes |
| Busser | front_of_house | $14.00 | Yes |
| Host | front_of_house | $14.00 | No |
| Food Runner | front_of_house | $14.00 | Yes |
| Line Cook | back_of_house | $18.00 | No |
| Prep Cook | back_of_house | $16.00 | No |
| Dishwasher | back_of_house | $15.00 | No |
| Sous Chef | back_of_house | $22.00 | No |
| Executive Chef | back_of_house | $28.00 | No |
| General Manager | management | $25.00 | No |
| Assistant Manager | management | $20.00 | No |
| Shift Manager | management | $18.00 | No |

### Schedule Output Tables

| Table | Purpose |
|-------|---------|
| `weekly_schedules` | One row per generated week (ID, dates, status, totals, metrics) |
| `shift_assignments` | Individual shifts (employee, position, date, start/end, hours, status) |

---

## 2. Covers Forecast: How We Project Nightly Volume

### Method: Day-of-Week P75 + 10% Buffer

From the 78 actual POS nights in `server_day_facts`, we:

1. **Group by day of week** (Tue, Wed, Thu, Fri, Sat, Sun)
2. **Calculate P75** (75th percentile) of total covers for that day
3. **Add 10% buffer** → `forecast = P75 * 1.10`

This means the forecast covers ~85% of historical nights — we staff for a "strong version" of that day, not the average.

### Actual POS Data Statistics (from `server_day_facts`)

| Day | Nights | Avg Covers | P50 | P75 | P75+10% (Forecast) | Avg Servers | Avg Bartenders |
|-----|--------|-----------|-----|-----|---------------------|-------------|----------------|
| **Sun** | 13 | 507 | 485 | 570 | **627** | 7.5 | 4.2 |
| Mon | - | CLOSED | - | - | - | - | - |
| **Tue** | 13 | 88 | 95 | 109 | **120** | 3.5 | 2.1 |
| **Wed** | 12 | 145 | 155 | 178 | **196** | 4.2 | 2.5 |
| **Thu** | 9 | 168 | 185 | 203 | **223** | 4.8 | 2.8 |
| **Fri** | 13 | 463 | 450 | 492 | **541** | 7.2 | 4.0 |
| **Sat** | 13 | 512 | 510 | 614 | **675** | 7.8 | 4.3 |

**Key insight:** Sunday is the **2nd busiest night** (627 covers) — not a slow night! This is characteristic of Delilah LA's supper club market.

### Revenue Estimates

Revenue per cover estimated at ~$108 (from POS gross_sales / covers):

| Day | Covers | Est. Revenue |
|-----|--------|-------------|
| Sun | 627 | $75,000 |
| Tue | 120 | $15,000 |
| Wed | 196 | $22,000 |
| Thu | 223 | $28,000 |
| Fri | 541 | $65,000 |
| Sat | 675 | $80,000 |
| **Weekly Total** | **2,382** | **$285,000** |

### Special Events

The forecast supports date-specific overrides for known events:
- **Valentine's Day (Sat Feb 14)**: 911 covers (35% uplift over regular Saturday)
- **Pre-Valentine's (Thu Feb 12)**: 350 covers (57% uplift over regular Thursday)

---

## 3. Staffing Calculations: Position-by-Position

### 3A. CPLH Formula (Covers Per Labor Hour)

Most positions use this formula:

```
employees_needed = ceil( forecasted_covers / (CPLH × shift_hours) )
```

**CPLH** = how many covers one employee handles per hour of their shift.

| Position | CPLH | Shift Hours | Meaning |
|----------|------|-------------|---------|
| Server | 18.0 | 6.5h | 1 server handles 18 covers/hr |
| Bartender | 30.0 | 8.5h | 1 bartender serves 30 covers/hr |
| Busser | 35.0 | 6.5h | 1 busser supports 35 covers/hr |
| Food Runner | 30.0 | 6.0h | 1 runner handles 30 covers/hr |
| Line Cook | 22.0 | 8.0h | 1 cook produces for 22 covers/hr |
| Prep Cook | 50.0 | 7.0h | 1 prep handles 50 covers/hr |
| Host | 50.0 | 6.0h | 1 host seats 50 covers/hr |
| Dishwasher | 50.0 | 8.5h | 1 dishwasher handles 50 covers/hr |

**Where do CPLH values come from?**
Calibrated from actual Delilah staffing in `server_day_facts`:
- A 675-cover Saturday uses ~6 servers in ~6.5h shifts → `675 / (6 × 6.5)` = **17.3 actual CPLH**
- Target set to 18.0 (slight headroom above actual)
- These are fine-dining/supper club benchmarks, NOT casual restaurant numbers

### 3B. Hourly Wave Scheduling (Servers & Bartenders ONLY)

When `hourly_forecast.json` has hour-by-hour data, Servers and Bartenders use **staggered wave scheduling** instead of flat CPLH:

1. Read the hour-by-hour on-floor counts from the forecast
2. Detect arrival/departure events (count increase = new wave arrives)
3. FIFO matching: first to arrive = first to get cut
4. Add setup (30 min) and teardown (45 min) to each wave

**Example: Saturday (675 covers) Server Waves:**
```
Hourly forecast:  4PM=2, 5PM=4, 6PM=5, 7PM=6, 8PM=6, 9PM=4, 10PM=2

Wave 1:  2 servers   2:30 PM - 7:45 PM   (5.25h)  ← openers
Wave 2:  2 servers   3:30 PM - 8:45 PM   (5.25h)
Wave 3:  1 server    4:30 PM - 8:45 PM   (4.25h)
Wave 4:  1 server    5:30 PM - 9:45 PM   (4.25h)
Wave 5:  0 added (peak plateau)
Wave 6:  Closers stay through end
```

The server/bartender counts per hour are **capped at actual headcount** (max 6 servers, 3 bartenders) based on what the venue actually uses on peak nights.

### 3C. Fixed Staff (Management & Chefs)

These positions get exactly **1 per open day**, regardless of covers:

| Position | Shift | Hours | Priority |
|----------|-------|-------|----------|
| Executive Chef | 3:00 PM - 11:00 PM | 8.0h | Assigned first |
| Sous Chef | 2:00 PM - 11:00 PM | 9.0h | Assigned first |
| General Manager | 2:00 PM - 12:00 AM | 10.0h | Assigned first |
| Assistant Manager | 3:00 PM - 12:00 AM | 9.0h | Assigned first |

Fixed staff are salaried and exempt from weekly hour caps.

### 3D. Covers Ratio (Hosts & Dishwashers)

Simple ratio instead of CPLH×hours:

```
employees_needed = ceil(forecasted_covers / ratio)
```

| Position | Ratio | 675 covers (Sat) | 120 covers (Tue) |
|----------|-------|-------------------|-------------------|
| Host | 250 | ceil(675/250) = **3** | ceil(120/250) = **1** |
| Dishwasher | 200 | ceil(675/200) = **4** | ceil(120/200) = **1** |

---

## 4. Demand Tiers & Shift Structure

Daily covers determine a **demand tier** that affects shift structure:

| Tier | Covers | Effect |
|------|--------|--------|
| Light | 0 - 150 | Minimal staff, FOH cut 60-90 min early |
| Moderate | 150 - 300 | Standard shifts, no stagger |
| Busy | 300 - 450 | Stagger FOH into Openers + Closers |
| Peak | 450+ | Full stagger + all hands |

**Delilah LA weekly tier breakdown:**
- Mon: CLOSED
- Tue (120): Light
- Wed (196): Moderate
- Thu (223): Moderate
- Fri (541): Peak
- Sat (675): Peak
- Sun (627): Peak

### Stagger Logic (for positions without hourly data)

| Position | Threshold | Opener Split | Closer Split |
|----------|-----------|-------------|-------------|
| Server | 6+ needed | 40% (4:00-10:00 PM) | 60% (6:00 PM-12:00 AM) |
| Busser | 4+ needed | 40% (4:00-10:00 PM) | 60% (6:00-11:30 PM) |
| Food Runner | 3+ needed | 35% (4:30-9:30 PM) | 65% (6:00-11:00 PM) |

---

## 5. Service Quality Constraints

After calculating raw headcount, quality ratios are enforced:

| Constraint | Formula | Purpose |
|-----------|---------|---------|
| Max covers per server | covers/servers ≤ 20 | Prevent overloaded sections |
| Busser:Server ratio | bussers ≥ ceil(servers × 0.5) | Enough bus support |
| Runner:Server ratio | runners ≥ ceil(servers × 0.33) | Enough food running |

**Example: Saturday with 6 servers**
- Minimum bussers: ceil(6 × 0.5) = **3** ✓ (we have 3)
- Minimum runners: ceil(6 × 0.33) = **2** (CPLH gives more)
- Covers per server: 675/6 = **112.5** — but this is total nightly, not concurrent. The hourly stagger ensures no server has >20 concurrent covers.

---

## 6. Employee Assignment Algorithm

### Priority Order
1. **Fixed staff first** (Chef, Sous Chef, GM, AM) — assigned across ALL days before anyone else
2. **By eligible pool size** — positions with fewer available employees go first (prevents starvation)
3. **By date** — Sunday first, then Tue, Wed, Thu, Fri, Sat

### Scoring (within each position)
Each eligible employee gets a score (lower = assigned first):
```
score = (0.4 × cost_score) + (0.4 × balance_score) + fatigue_penalty

cost_score = hourly_rate / $35
balance_score = hours_worked_this_week / max_hours
fatigue_penalty = +0.3 if already worked 5+ days, +0.5 if 6+ days
```

### Constraints
- No employee works > 1 shift per day
- Hourly employees can't exceed their `max_hours_per_week` (typically 40h)
- Fixed staff (salaried) bypass the hour cap

---

## 7. Position Shift Times

| Position | Dinner Shift | Duration |
|----------|-------------|----------|
| Prep Cook | 2:00 PM - 9:00 PM | 7.0h |
| Sous Chef | 2:00 PM - 11:00 PM | 9.0h |
| General Manager | 2:00 PM - 12:00 AM | 10.0h |
| Line Cook | 3:00 PM - 11:00 PM | 8.0h |
| Executive Chef | 3:00 PM - 11:00 PM | 8.0h |
| Bartender | 3:00 PM - 11:30 PM | 8.5h |
| Dishwasher | 3:00 PM - 11:30 PM | 8.5h |
| Assistant Manager | 3:00 PM - 12:00 AM | 9.0h |
| Shift Manager | 4:00 PM - 12:00 AM | 8.0h |
| Host | 4:30 PM - 10:30 PM | 6.0h |
| Server | 4:30 PM - 11:00 PM | 6.5h |
| Busser | 4:30 PM - 11:00 PM | 6.5h |
| Food Runner | 5:00 PM - 11:00 PM | 6.0h |

---

## 8. Complete Worked Example: Saturday (675 covers, Peak)

### Inputs
- Forecasted covers: **675** (P75+10% from 13 actual Saturdays)
- Forecasted revenue: **$80,000**
- Hourly server forecast: peaks at 6 concurrent at 7-8PM
- Demand tier: **Peak**

### Staffing Calculations

| Position | Method | Formula | Result | Shift |
|----------|--------|---------|--------|-------|
| **Server** | Hourly Waves | 6 staggered waves from hourly data | **6** | Staggered 2:30-10:45 PM |
| **Bartender** | Hourly Waves | 3 staggered waves | **3** | Staggered 2:30-11:45 PM |
| **Line Cook** | CPLH | ceil(675 / (22 × 8)) = ceil(3.84) | **4** | 3:00-11:00 PM |
| **Prep Cook** | CPLH | ceil(675 / (50 × 7)) = ceil(1.93) | **2** | 2:00-9:00 PM |
| **Busser** | CPLH+Quality | ceil(675 / (35 × 6.5)) = 3; quality min = ceil(6×0.5) = 3 | **3** | 4:30-11:00 PM |
| **Food Runner** | CPLH | Peak stagger: 1 opener + 3 closers | **4** | Staggered 4:30-11:00 PM |
| **Host** | Ratio | ceil(675 / 250) = 3 | **3** | 4:30-10:30 PM |
| **Dishwasher** | Ratio | ceil(675 / 200) = 4 | **4** | 3:00-11:30 PM |
| **Executive Chef** | Fixed | Always 1 | **1** | 3:00-11:00 PM |
| **Sous Chef** | Fixed | Always 1 | **1** | 2:00-11:00 PM |
| **General Manager** | Fixed | Always 1 | **1** | 2:00-12:00 AM |
| **Asst. Manager** | Fixed | Always 1 | **1** | 3:00-12:00 AM |
| **Shift Manager** | CPLH | 1 per peak night | **1** | 4:00-12:00 AM |
| | | **Total Saturday staff:** | **~35** | |

### Cost Estimate
```
Total shift hours:  ~220h
Avg hourly rate:    ~$17.50 (weighted by position mix)
Total labor cost:   ~$3,850
Revenue:            $80,000
Labor %:            4.8%
```

---

## 9. Full Weekly Schedule Summary

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun | **Total** |
|---|---|---|---|---|---|---|---|---|
| **Covers** | Closed | 120 | 196 | 223 | 541 | 675 | 627 | **2,382** |
| **Revenue** | - | $15K | $22K | $28K | $65K | $80K | $75K | **$285K** |
| **Tier** | - | Light | Moderate | Moderate | Peak | Peak | Peak | |
| **Servers** | - | 2 | 2 | 2 | 5 | 6 | 6 | |
| **Bartenders** | - | 1 | 1 | 1 | 3 | 3 | 3 | |
| **Hosts** | - | 1 | 1 | 1 | 3 | 3 | 3 | |
| **Bussers** | - | 1 | 1 | 1 | 3 | 3 | 3 | |
| **Food Runners** | - | 1 | 1 | 1 | 3 | 4 | 4 | |
| **Line Cooks** | - | 1 | 1 | 2 | 4 | 4 | 4 | |
| **Prep Cooks** | - | 1 | 1 | 1 | 2 | 2 | 2 | |
| **Dishwashers** | - | 1 | 1 | 1 | 4 | 4 | 4 | |
| **Sous Chef** | - | 1 | 1 | 1 | 1 | 1 | 1 | |
| **Exec Chef** | - | 1 | 1 | 1 | 1 | 1 | 1 | |
| **GM** | - | 1 | 1 | 1 | 1 | 1 | 1 | |
| **Asst Mgr** | - | 1 | 1 | 1 | 1 | 1 | 1 | |
| **Shift Mgr** | - | 0 | 0 | 0 | 1 | 1 | 1 | |
| **Total Staff** | - | ~13 | ~14 | ~15 | ~33 | ~35 | ~35 | **~147** |
| **Labor Hours** | - | ~80h | ~85h | ~90h | ~210h | ~220h | ~220h | **~900h** |
| **Labor Cost** | - | ~$1.2K | ~$1.3K | ~$1.4K | ~$3.5K | ~$3.8K | ~$3.8K | **~$15K** |
| **Labor %** | - | 8.0% | 5.9% | 5.0% | 5.4% | 4.8% | 5.1% | **~5.3%** |

---

## 10. Key Calibration Points

These are the parameters managers can adjust:

| Parameter | Current Value | What it Controls | How to Adjust |
|-----------|--------------|-----------------|---------------|
| Server CPLH | 18.0 | Lower = more servers scheduled | Edit in `auto_scheduler.py` CPLH_TARGETS |
| Line Cook CPLH | 22.0 | Kitchen staffing density | Edit in CPLH_TARGETS |
| Bartender CPLH | 30.0 | Bar staffing | Edit in CPLH_TARGETS |
| Busser:Server ratio | 0.50 | Min 1 busser per 2 servers | Edit QUALITY_RATIOS |
| Runner:Server ratio | 0.33 | Min 1 runner per 3 servers | Edit QUALITY_RATIOS |
| Host ratio | 1 per 250 covers | Scales with volume | Edit HOST_COVER_RATIO |
| Dishwasher ratio | 1 per 200 covers | Scales with volume | Edit DISH_COVER_RATIO |
| P75 buffer | +10% | Forecast conservatism | Re-run covers analysis |
| Light threshold | < 150 covers | When to cut early | Edit DEMAND_TIERS |
| Peak threshold | > 450 covers | When to full-stagger | Edit DEMAND_TIERS |

### How to Adjust

**"We need more servers on Fridays"**
→ Lower Server CPLH from 18.0 to 16.0 (each server handles fewer covers/hr = more needed)

**"Bussers are overwhelmed"**
→ Raise busser_to_server_ratio from 0.5 to 0.6

**"We're overstaffing slow nights"**
→ Raise light night threshold from 150 to 200, or increase CPLH targets

**"The forecast is too conservative/aggressive"**
→ Switch from P75+10% to P50 (median) or P90 by updating hourly_forecast.json

---

## 11. All Postgres Tables Referenced

| Table | Read/Write | Purpose |
|-------|-----------|---------|
| `server_day_facts` | READ | Primary data: actual POS covers, sales, staffing per night |
| `demand_forecasts` | READ | ML predictions (currently has 2024 dates, not used) |
| `employees` | READ | Active employee roster with positions and hour caps |
| `positions` | READ | Position definitions with hourly rates |
| `venues` | READ | Venue metadata (class, timezone) |
| `weekly_schedules` | WRITE | Generated schedule header (dates, totals, metrics) |
| `shift_assignments` | WRITE | Individual shift records per employee per day |
| `organization_users` | READ | User-org membership (for auth/access) |
| `organizations` | READ | Org metadata |

### File-based Data

| File | Purpose |
|------|---------|
| `python-services/scheduler/hourly_forecast.json` | Hour-by-hour server/bartender counts derived from POS data |
| `python-services/scheduler/auto_scheduler.py` | Main scheduler engine (~1500 lines) |

---

## 12. UI: Covers Projection Table

The schedule page displays a **Covers Projection & Staffing** table above the calendar grid showing:
- **Projected Covers** per day (computed from server_hours × CPLH 18.0)
- **Server, Bartender, FOH, BOH counts** per day
- **Total Staff** per day and weekly total
- **Summary chips**: Peak day, weekly revenue, labor cost, labor %

This data is computed client-side from the shift assignments (no separate API call).

---

## 13. System Architecture Flow

```
Toast POS → server_day_facts (847 rows)
                ↓
    P75+10% by DOW analysis
                ↓
    hourly_forecast.json (covers + hourly curves)
                ↓
    auto_scheduler.py reads forecast + employees + positions
                ↓
    Step 1: Calculate headcount per position (CPLH / ratio / fixed)
    Step 2: Stagger into waves for busy/peak nights
    Step 3: Quality constraints (server caps, busser ratios)
    Step 4: Greedy employee assignment (cost + balance scoring)
                ↓
    weekly_schedules + shift_assignments → Supabase
                ↓
    Schedule Calendar UI (Next.js)
    ├── Covers Projection table
    ├── Calendar grid (position × day)
    ├── Shift edit/add dialogs
    └── Approve & Publish workflow
```
