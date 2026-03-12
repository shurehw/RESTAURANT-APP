-- Reservations Yield Management Engine — Data Foundation
-- Phase 1: fact tables + column additions for yield optimization

-- ============================================================
-- 1. reservation_requests — Demand funnel capture
-- Every inbound request, whether accepted or denied.
-- ============================================================
CREATE TABLE IF NOT EXISTS reservation_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id                UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_date          DATE NOT NULL,
  requested_time          TIME NOT NULL,
  requested_party_size    INTEGER NOT NULL,
  channel                 TEXT NOT NULL,
  guest_id                UUID,
  guest_name              TEXT,
  was_accepted            BOOLEAN NOT NULL,
  reservation_id          UUID REFERENCES reservations(id) ON DELETE SET NULL,
  rejected_reason         TEXT,            -- slot_full, party_too_large, past_cutoff, pacing_limit, etc.
  offered_alternatives    JSONB,           -- [{ time: "18:00", accepted: false }, ...]
  accepted_alternative    TIME,
  waitlisted              BOOLEAN DEFAULT false,
  converted_from_waitlist BOOLEAN DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rez_requests_venue_date
  ON reservation_requests(venue_id, requested_date);
CREATE INDEX IF NOT EXISTS idx_rez_requests_org
  ON reservation_requests(org_id);

ALTER TABLE reservation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_requests_org_isolation ON reservation_requests
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 2. guest_profiles — Cross-venue guest intelligence
-- Materialized nightly from reservations + checks.
-- ============================================================
CREATE TABLE IF NOT EXISTS guest_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_name    TEXT,
  email             TEXT,
  phone             TEXT,
  first_seen        DATE,
  last_seen         DATE,
  visit_count       INTEGER NOT NULL DEFAULT 0,
  avg_spend         NUMERIC(10,2) DEFAULT 0,
  avg_party_size    NUMERIC(4,1) DEFAULT 0,
  no_show_count     INTEGER NOT NULL DEFAULT 0,
  cancel_count      INTEGER NOT NULL DEFAULT 0,
  no_show_rate      NUMERIC(5,4) DEFAULT 0,      -- 0.0000 to 1.0000
  cancel_rate       NUMERIC(5,4) DEFAULT 0,
  preferred_times   JSONB DEFAULT '{}',           -- { "19:00": 12, "20:00": 8 }
  preferred_venues  JSONB DEFAULT '{}',           -- { "venue_uuid": 15 }
  vip_tier          TEXT NOT NULL DEFAULT 'standard'
                    CHECK (vip_tier IN ('standard', 'silver', 'gold', 'platinum')),
  ltv_proxy         NUMERIC(12,2) DEFAULT 0,
  booking_lead_days NUMERIC(6,1),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicate by email first, phone second
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_email
  ON guest_profiles(org_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_phone
  ON guest_profiles(org_id, phone) WHERE phone IS NOT NULL AND email IS NULL;
CREATE INDEX IF NOT EXISTS idx_guest_profiles_org
  ON guest_profiles(org_id);

ALTER TABLE guest_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_profiles_org_isolation ON guest_profiles
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 3. table_seatings — Ground truth on physical table usage
-- Assembled nightly from table_status_events + tipsee_checks + reservations.
-- ============================================================
CREATE TABLE IF NOT EXISTS table_seatings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  reservation_id        UUID REFERENCES reservations(id) ON DELETE SET NULL,
  table_id              UUID NOT NULL,
  combined_table_ids    UUID[],
  business_date         DATE NOT NULL,
  shift_type            TEXT,
  quoted_duration_mins  INTEGER,
  arrival_time          TIMESTAMPTZ,
  seated_time           TIMESTAMPTZ,
  first_order_time      TIMESTAMPTZ,
  check_close_time      TIMESTAMPTZ,
  cleared_time          TIMESTAMPTZ,
  actual_party_size     INTEGER,
  section_id            UUID,
  server_id             UUID,
  check_id              TEXT,
  subtotal              NUMERIC(10,2),
  beverage_sales        NUMERIC(10,2),
  food_sales            NUMERIC(10,2),
  comps                 NUMERIC(10,2) DEFAULT 0,
  duration_mins         INTEGER,          -- computed by ETL: (cleared - seated) in minutes
  reopen_lag_mins       INTEGER,          -- computed by ETL: (next_seated - cleared) in minutes
  guest_profile_id      UUID REFERENCES guest_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seatings_venue_date
  ON table_seatings(venue_id, business_date);
CREATE INDEX IF NOT EXISTS idx_seatings_table
  ON table_seatings(table_id, business_date);
CREATE INDEX IF NOT EXISTS idx_seatings_reservation
  ON table_seatings(reservation_id) WHERE reservation_id IS NOT NULL;

ALTER TABLE table_seatings ENABLE ROW LEVEL SECURITY;
CREATE POLICY table_seatings_org_isolation ON table_seatings
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 4. rez_yield_config — Per-venue yield engine configuration
-- Manager-defined guardrails for the policy engine.
-- ============================================================
CREATE TABLE IF NOT EXISTS rez_yield_config (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id                    UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Master switch
  yield_engine_enabled        BOOLEAN NOT NULL DEFAULT false,

  -- Operating window
  service_start_time          TIME NOT NULL DEFAULT '16:00',
  service_end_time            TIME NOT NULL DEFAULT '02:00',

  -- Automation level: 'advisory' (Phase 1), 'semi_auto' (Phase 2), 'autonomous' (Phase 3)
  automation_level            TEXT NOT NULL DEFAULT 'advisory'
                              CHECK (automation_level IN ('advisory', 'semi_auto', 'autonomous')),

  -- Aggressiveness (0-100, higher = more aggressive filling)
  aggressiveness_ceiling      INTEGER NOT NULL DEFAULT 60,

  -- Overbooking
  max_overbook_pct            NUMERIC(5,2) DEFAULT 10,
  overbook_noshow_floor       NUMERIC(5,2) DEFAULT 5,       -- only overbook if no-show rate >= this

  -- Walk-in reserves
  walkin_reserve_pct          NUMERIC(5,2) DEFAULT 15,       -- % of capacity reserved for walk-ins

  -- VIP controls
  vip_table_ids               UUID[] DEFAULT '{}',
  vip_protection_level        INTEGER DEFAULT 70,            -- min protection score for VIP tables

  -- Table controls
  protect_large_tops          BOOLEAN DEFAULT true,          -- prevent 2-tops on 4+ capacity in prime
  large_top_threshold         INTEGER DEFAULT 4,

  -- Section controls
  blocked_section_ids         UUID[] DEFAULT '{}',           -- sections engine cannot assign

  -- Pacing controls
  max_pacing_delta_pct        NUMERIC(5,2) DEFAULT 25,       -- max % pacing change per cycle
  sr_push_enabled             BOOLEAN DEFAULT false,

  -- Duration buffer
  turn_buffer_minutes         INTEGER DEFAULT 15,            -- buffer between seatings
  end_of_service_compress     BOOLEAN DEFAULT true,          -- allow tighter packing near close

  -- Service quality threshold (0-100, engine stops adding if stress exceeds this)
  max_stress_score            INTEGER DEFAULT 75,

  -- Audit
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  UUID,

  CONSTRAINT uq_yield_config_venue UNIQUE(venue_id)
);

ALTER TABLE rez_yield_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY rez_yield_config_org_isolation ON rez_yield_config
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 5. rez_yield_decisions — Audit trail for every engine decision
-- ============================================================
CREATE TABLE IF NOT EXISTS rez_yield_decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  venue_id          UUID NOT NULL,
  business_date     DATE NOT NULL,
  decision_type     TEXT NOT NULL,     -- evaluate, posture_update, pacing_adjust, table_assign, etc.
  request_id        UUID,              -- links to reservation_requests
  reservation_id    UUID,
  recommendation    TEXT NOT NULL,     -- accept, offer_alternate, waitlist, deny
  confidence        NUMERIC(4,3),
  reasoning         TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',   -- full decision details
  was_followed      BOOLEAN,                        -- did the operator follow the recommendation?
  override_reason   TEXT,
  outcome_revenue   NUMERIC(10,2),                  -- actual revenue if followed/overridden
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yield_decisions_venue_date
  ON rez_yield_decisions(venue_id, business_date);
CREATE INDEX IF NOT EXISTS idx_yield_decisions_request
  ON rez_yield_decisions(request_id) WHERE request_id IS NOT NULL;

ALTER TABLE rez_yield_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rez_yield_decisions_org_isolation ON rez_yield_decisions
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 6. rez_yield_posture_log — Service posture snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS rez_yield_posture_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL,
  business_date     DATE NOT NULL,
  shift_type        TEXT NOT NULL,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  posture           TEXT NOT NULL CHECK (posture IN ('aggressive', 'open', 'balanced', 'protected', 'highly_protected')),
  slot_scores       JSONB NOT NULL DEFAULT '{}',   -- { "17:00": { protection: 80, fill_risk: 20, ... }, ... }
  pickup_vs_pace    NUMERIC(5,2),                   -- % above/below historical pace
  total_booked      INTEGER,
  total_capacity    INTEGER,
  demand_signals    JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posture_log_venue_date
  ON rez_yield_posture_log(venue_id, business_date);

-- ============================================================
-- 7. rez_yield_backtests — Nightly backtest results
-- ============================================================
CREATE TABLE IF NOT EXISTS rez_yield_backtests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  venue_id            UUID NOT NULL,
  business_date       DATE NOT NULL,
  shift_type          TEXT,

  -- Baseline (what actually happened)
  actual_covers       INTEGER,
  actual_revenue      NUMERIC(12,2),
  actual_utilization  NUMERIC(5,2),      -- seat-hour utilization %
  actual_dead_gap_mins INTEGER,
  actual_second_turns INTEGER,

  -- Counterfactual (what engine would have recommended)
  engine_covers       INTEGER,
  engine_revenue      NUMERIC(12,2),
  engine_utilization  NUMERIC(5,2),
  engine_dead_gap_mins INTEGER,
  engine_second_turns INTEGER,

  -- Deltas
  revenue_delta       NUMERIC(12,2),
  utilization_delta   NUMERIC(5,2),
  covers_delta        INTEGER,

  -- Narrative
  narrative           TEXT,
  recommendations     JSONB DEFAULT '[]',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_backtest_venue_date UNIQUE(venue_id, business_date, shift_type)
);

CREATE INDEX IF NOT EXISTS idx_backtests_venue_date
  ON rez_yield_backtests(venue_id, business_date);

-- ============================================================
-- 8. duration_cohorts — Precomputed turn time statistics
-- Refreshed nightly from table_seatings.
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_cohorts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL,
  party_size_bucket TEXT NOT NULL,       -- '1-2', '3-4', '5-6', '7-8', '9+'
  section_id        UUID,               -- null = venue-wide
  day_of_week       INTEGER,            -- 0-6, null = all days
  shift_type        TEXT,               -- null = all shifts
  sample_size       INTEGER NOT NULL DEFAULT 0,
  p25_mins          INTEGER,
  p50_mins          INTEGER,
  p75_mins          INTEGER,
  p90_mins          INTEGER,
  avg_mins          NUMERIC(6,1),
  stddev_mins       NUMERIC(6,1),
  avg_reopen_lag    NUMERIC(6,1),
  avg_spend         NUMERIC(10,2),
  avg_bev_pct       NUMERIC(5,2),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_duration_cohort UNIQUE(venue_id, party_size_bucket, section_id, day_of_week, shift_type)
);

CREATE INDEX IF NOT EXISTS idx_duration_cohorts_venue
  ON duration_cohorts(venue_id);

-- ============================================================
-- 9. Column additions to existing tables
-- ============================================================

-- reservation_access_rules: add yield engine columns
ALTER TABLE reservation_access_rules
  ADD COLUMN IF NOT EXISTS protection_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS demand_posture TEXT;

-- demand_forecasts: add probabilistic bands + walk-in pressure
ALTER TABLE demand_forecasts
  ADD COLUMN IF NOT EXISTS covers_p10 INTEGER,
  ADD COLUMN IF NOT EXISTS covers_p90 INTEGER,
  ADD COLUMN IF NOT EXISTS walkin_pressure_score NUMERIC(5,2);

-- reservations: add guest_profile linkage
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS guest_profile_id UUID REFERENCES guest_profiles(id) ON DELETE SET NULL;
