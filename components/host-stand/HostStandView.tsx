'use client';

/**
 * HostStandView — Full-screen live floor management surface.
 * Polls live floor data every 30s and renders the floor plan
 * with state-colored tables, upcoming arrivals, waitlist, and metrics.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { createClient } from '@/lib/supabase/client';
import { FloorPlanCanvas } from '@/components/floor-plan/FloorPlanCanvas';
import type { VenueTable, VenueSection, VenueLabel } from '@/lib/database/floor-plan';
import type { TableState } from '@/lib/floor-management/table-state-machine';
import type { TableVisualMeta } from '@/components/floor-plan/FloorPlanCanvas';
import { HostStandHeader } from './HostStandHeader';
import { HostStandSidebar } from './HostStandSidebar';
import { HostStandMetricsBar } from './HostStandMetricsBar';
import { TableStatusLegend } from './TableStatusLegend';
import { TableActionSheet } from './TableActionSheet';
import { AddWaitlistDialog } from './AddWaitlistDialog';
import { SeatWalkinDialog } from './SeatWalkinDialog';
import { NewReservationDialog } from './NewReservationDialog';
import { CombineTablesDialog } from './CombineTablesDialog';
import { SeatSuggestionToast } from './SeatSuggestionToast';
import { STATE_COLORS, getBusinessDate } from './constants';

// ── Types ────────────────────────────────────────────────────────

interface LiveTable {
  id: string;
  table_id: string;
  table_number: string;
  section_id: string | null;
  status: TableState;
  party_size: number | null;
  guest_name?: string;
  seated_at: string | null;
  current_spend: number;
  turn_number: number;
  min_capacity: number;
  max_capacity: number;
  shape: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  reservation_id: string | null;
}

interface UpcomingReservation {
  id: string;
  guest_name: string;
  party_size: number;
  arrival_time: string;
  status: string;
  is_vip: boolean;
  notes: string | null;
  client_requests: string | null;
  table_ids?: string[];
}

interface WaitlistEntry {
  id: string;
  guest_name: string;
  party_size: number;
  quoted_wait: number | null;
  added_at: string;
  status: string;
}

interface LiveSummary {
  total_tables: number;
  available: number;
  total_covers: number;
  total_revenue: number;
  avg_turn_minutes: number;
  waitlist_count: number;
}

interface HostStandViewProps {
  venueId: string;
  venueName: string;
  hostName: string;
  userId: string;
}

// ── Component ────────────────────────────────────────────────────

export function HostStandView({ venueId, venueName, hostName }: HostStandViewProps) {
  const [businessDate, setBusinessDate] = useState(getBusinessDate);

  const handleDateNav = useCallback((delta: number) => {
    setBusinessDate((prev) => {
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      return d.toISOString().slice(0, 10);
    });
  }, []);

  const handleDateSet = useCallback((date: string) => {
    setBusinessDate(date);
  }, []);

  // Live data state
  const [sections, setSections] = useState<VenueSection[]>([]);
  const [labels, setLabels] = useState<VenueLabel[]>([]);
  const [liveTables, setLiveTables] = useState<LiveTable[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingReservation[]>([]);
  const [seatedReservations, setSeatedReservations] = useState<UpcomingReservation[]>([]);
  const [completedRez, setCompletedRez] = useState<UpcomingReservation[]>([]);
  const [noShows, setNoShows] = useState<UpcomingReservation[]>([]);
  const [cancelledRez, setCancelledRez] = useState<UpcomingReservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [summary, setSummary] = useState<LiveSummary>({
    total_tables: 0,
    available: 0,
    total_covers: 0,
    total_revenue: 0,
    avg_turn_minutes: 0,
    waitlist_count: 0,
  });

  const [sectionServerMap, setSectionServerMap] = useState<Map<string, string>>(new Map());

  // Table combo state: comboId → combined_table_ids[], primaryTableId → comboId
  interface TableCombo { id: string; primary_table_id: string; combined_table_ids: string[] }
  const [activeCombos, setActiveCombos] = useState<TableCombo[]>([]);

  const fetchCombos = useCallback(async () => {
    try {
      const res = await fetch(`/api/floor-plan/live/combos?venue_id=${venueId}&date=${businessDate}`);
      if (!res.ok) return;
      const data = await res.json();
      setActiveCombos(data.combos || []);
    } catch {}
  }, [venueId, businessDate]);

  useEffect(() => { fetchCombos(); }, [fetchCombos]);

  // Derived sets for canvas rendering
  const comboTableIds = new Set(activeCombos.flatMap((c) => c.combined_table_ids));
  const comboPrimaryIds = new Set(activeCombos.map((c) => c.primary_table_id));
  // tableId → combo for action sheet lookups
  const tableComboMap = new Map<string, TableCombo>();
  for (const c of activeCombos) {
    for (const tid of c.combined_table_ids) tableComboMap.set(tid, c);
  }

  // Seat suggestion state
  const [activeSuggestion, setActiveSuggestion] = useState<{
    id: string; expires_at: string; reservation_id: string; guest_name: string; party_size: number; is_vip: boolean;
    table_id: string; table_number: string; section_name: string | null;
    section_color: string | null; reason: string | null;
  } | null>(null);
  const pendingSuggestionRef = useRef<Set<string>>(new Set()); // rez IDs with in-flight suggestion requests

  // UI state
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showWaitlistDialog, setShowWaitlistDialog] = useState(false);
  const [showSeatWalkinDialog, setShowSeatWalkinDialog] = useState(false);
  const [showNewReservationDialog, setShowNewReservationDialog] = useState(false);
  const [showCombineDialog, setShowCombineDialog] = useState(false);
  const [seatWalkinTableId, setSeatWalkinTableId] = useState<string | undefined>();
  const [seatWalkinTableNumber, setSeatWalkinTableNumber] = useState<string | undefined>();
  const [pendingWaitlistSeat, setPendingWaitlistSeat] = useState<WaitlistEntry | null>(null);
  const [lastLiveUpdateAt, setLastLiveUpdateAt] = useState<number>(Date.now());
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [syncFailures, setSyncFailures] = useState(0);
  const [alert, setAlert] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showAlert = useCallback((type: 'error' | 'success' | 'info', message: string) => {
    setAlert({ type, message });
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlert(null), 4500);
  }, []);

  useEffect(() => () => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
  }, []);

  useEffect(() => {
    const update = () => setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────

  const fetchLiveData = useCallback(async () => {
    try {
      const [liveRes, summaryRes, waitlistRes] = await Promise.all([
        fetch(`/api/floor-plan/live?venue_id=${venueId}&date=${businessDate}`),
        fetch(`/api/floor-plan/live/summary?venue_id=${venueId}&date=${businessDate}`),
        fetch(`/api/waitlist?venue_id=${venueId}&date=${businessDate}`),
      ]);

      if (liveRes.ok) {
        const liveData = await liveRes.json();
        setSections(liveData.sections || []);
        setLabels(liveData.labels || []);
        setLiveTables(liveData.tables || []);
        setUpcoming(liveData.upcoming || []);
        setSeatedReservations(liveData.seated_reservations || []);
        setCompletedRez(liveData.completed || []);
        setNoShows(liveData.no_shows || []);
        setCancelledRez(liveData.cancelled || []);
      }

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary({
          total_tables: summaryData.total_tables || 0,
          available: summaryData.available || 0,
          total_covers: summaryData.total_covers || 0,
          total_revenue: summaryData.total_revenue || 0,
          avg_turn_minutes: summaryData.avg_turn_minutes || 0,
          waitlist_count: summaryData.waitlist_count || 0,
        });
      }

      if (waitlistRes.ok) {
        const waitlistData = await waitlistRes.json();
        setWaitlist(waitlistData.entries || []);
      }

      setLastLiveUpdateAt(Date.now());
    } catch {
      showAlert('error', 'Live floor refresh failed. Retrying.');
    }
  }, [venueId, businessDate, showAlert]);

  // Initial load + 60s fallback poll (Realtime handles the fast path)
  useEffect(() => {
    fetchLiveData();
    fetchCombos();
    const interval = setInterval(() => {
      fetchLiveData();
      fetchCombos();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchLiveData, fetchCombos]);

  // Supabase Realtime — subscribe to table_status changes for instant updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`floor-live:${venueId}:${businessDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_status', filter: `venue_id=eq.${venueId}` },
        () => {
          fetchLiveData();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_combos', filter: `venue_id=eq.${venueId}` },
        () => {
          fetchCombos();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [venueId, businessDate, fetchLiveData, fetchCombos]);

  // ── Server Section Assignments (once per business date) ──────────

  useEffect(() => {
    async function fetchServerSections() {
      try {
        const res = await fetch(
          `/api/floor-plan/server-sections?venue_id=${venueId}&date=${businessDate}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const map = new Map<string, string>();
        for (const a of data.assignments || []) {
          if (a.section_id && a.server_name) {
            // Show first name only to keep it compact
            map.set(a.section_id, a.server_name.split(' ')[0]);
          }
        }
        setSectionServerMap(map);
      } catch {
        // Non-critical — silently ignore
      }
    }
    fetchServerSections();
  }, [venueId, businessDate]);

  // ── Real-time SR Sync (every 2 min) ─────────────────────────────

  const syncReservations = useCallback(async () => {
    try {
      const res = await fetch('/api/floor-plan/live/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, date: businessDate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSyncFailures((prev) => prev + 1);
        showAlert('error', data.error || 'Reservation sync failed');
        return;
      }
      setSyncFailures(0);
      // After sync, refresh live data to pick up changes
      fetchLiveData();
    } catch {
      setSyncFailures((prev) => prev + 1);
      showAlert('error', 'Reservation sync failed');
    }
  }, [venueId, businessDate, fetchLiveData, showAlert]);

  useEffect(() => {
    syncReservations(); // Initial sync on mount
    const interval = setInterval(syncReservations, 120_000); // Every 2 min
    return () => clearInterval(interval);
  }, [syncReservations]);

  // ── AI Seat Suggestion Trigger ─────────────────────────────────
  // Fires when a reservation transitions to 'arrived', and also when
  // called explicitly after a table clears with arrived guests waiting.

  const prevUpcomingRef = useRef<Map<string, string>>(new Map()); // id → status

  // Reusable function to fire a suggestion for the first arrived party waiting
  const triggerSuggestionForArrivedParty = useCallback((currentUpcoming: UpcomingReservation[]) => {
    if (activeSuggestion) return;
    const arrivedRez = currentUpcoming.find(
      (r) => r.status === 'arrived' && !pendingSuggestionRef.current.has(r.id)
    );
    if (!arrivedRez) return;

    pendingSuggestionRef.current.add(arrivedRez.id);
    fetch(`/api/floor-plan/live/suggest-seat?venue_id=${venueId}&date=${businessDate}&reservation_id=${arrivedRez.id}&trigger=table_opened`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.suggestion) setActiveSuggestion(data.suggestion); })
      .catch(() => {})
      .finally(() => pendingSuggestionRef.current.delete(arrivedRez.id));
  }, [venueId, businessDate, activeSuggestion]);

  useEffect(() => {
    const prev = prevUpcomingRef.current;
    const next = new Map<string, string>();
    for (const r of upcoming) next.set(r.id, r.status);
    prevUpcomingRef.current = next;

    // Find reservations that just became 'arrived'
    const newArrivals = upcoming.filter(
      (r) => r.status === 'arrived' && prev.get(r.id) !== 'arrived'
    );

    for (const rez of newArrivals) {
      if (pendingSuggestionRef.current.has(rez.id)) continue;
      if (activeSuggestion) continue; // one at a time
      pendingSuggestionRef.current.add(rez.id);

      fetch(`/api/floor-plan/live/suggest-seat?venue_id=${venueId}&date=${businessDate}&reservation_id=${rez.id}&trigger=arrived`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.suggestion) {
            setActiveSuggestion(data.suggestion);
          }
        })
        .catch(() => {})
        .finally(() => pendingSuggestionRef.current.delete(rez.id));
    }
  }, [upcoming, venueId, businessDate, activeSuggestion]);

  const handleSuggestionAccept = async (suggestion: NonNullable<typeof activeSuggestion>) => {
    setActiveSuggestion(null);
    // Log outcome
    await fetch('/api/floor-plan/live/suggest-seat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestion_id: suggestion.id, outcome: 'accepted', actual_table_id: suggestion.table_id, actual_table_number: suggestion.table_number }),
    }).catch(() => {});

    // Find the arrived reservation for this suggestion
    const rez = upcoming.find((r) => r.id === suggestion.reservation_id && r.status === 'arrived');
    if (!rez) return;

    // Seat the reservation on the suggested table
    await fetch('/api/floor-plan/live/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venue_id: venueId, table_id: suggestion.table_id,
        date: businessDate, action: 'seat',
        reservation_id: rez.id, party_size: rez.party_size, expected_duration: 90,
      }),
    }).catch(() => {});
    fetchLiveData();
  };

  const handleSuggestionDismiss = async (suggestion: NonNullable<typeof activeSuggestion>, outcome: 'dismissed' | 'expired') => {
    setActiveSuggestion(null);
    await fetch('/api/floor-plan/live/suggest-seat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestion_id: suggestion.id, outcome }),
    }).catch(() => {});
  };

  // ── Canvas Data Mapping ────────────────────────────────────────

  // Map LiveTable → VenueTable format for FloorPlanCanvas
  const canvasTables: VenueTable[] = liveTables.map((t) => ({
    id: t.table_id,
    org_id: '',
    venue_id: venueId,
    section_id: t.section_id,
    table_number: t.table_number,
    min_capacity: t.min_capacity,
    max_capacity: t.max_capacity,
    shape: t.shape as VenueTable['shape'],
    pos_x: t.pos_x,
    pos_y: t.pos_y,
    width: t.width,
    height: t.height,
    rotation: t.rotation,
    is_active: true,
    created_at: '',
    updated_at: '',
  }));

  // Build color map from table states
  const tableColorMap = new Map<string, string>();
  for (const t of liveTables) {
    tableColorMap.set(t.table_id, STATE_COLORS[t.status]);
  }

  // Build label map — guest names on occupied/reserved tables
  const tableLabelMap = new Map<string, string>();
  for (const t of liveTables) {
    if (t.guest_name && ['reserved', 'seated', 'occupied', 'check_dropped'].includes(t.status)) {
      tableLabelMap.set(t.table_id, t.guest_name);
    }
  }

  // ── Visual Meta (animations, VIP, spend, arrivals) ───────────
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const [transitioningTableIds, setTransitioningTableIds] = useState<Set<string>>(new Set());

  // Detect state transitions on each data refresh
  useEffect(() => {
    const prev = prevStatusRef.current;
    const transitioning = new Set<string>();

    for (const t of liveTables) {
      const oldStatus = prev.get(t.table_id);
      if (oldStatus && oldStatus !== t.status) {
        transitioning.add(t.table_id);
      }
    }

    // Update prev map
    const next = new Map<string, string>();
    for (const t of liveTables) next.set(t.table_id, t.status);
    prevStatusRef.current = next;

    if (transitioning.size > 0) {
      setTransitioningTableIds(transitioning);
      // Clear after animation completes
      const timer = setTimeout(() => setTransitioningTableIds(new Set()), 500);
      return () => clearTimeout(timer);
    }
  }, [liveTables]);

  // Build VIP and arrived sets from reservation data
  const allRezForMeta = [...upcoming, ...seatedReservations];
  const vipRezIds = new Set(allRezForMeta.filter(r => r.is_vip).map(r => r.id));
  const arrivedTableIds = new Set<string>();
  for (const r of upcoming) {
    if (r.status === 'arrived' && r.table_ids) {
      for (const tid of r.table_ids) arrivedTableIds.add(tid);
    }
  }

  // Compute spend intensity
  const maxSpend = Math.max(1, ...liveTables.map(t => t.current_spend || 0));

  // Build the meta map
  const tableMetaMap = new Map<string, TableVisualMeta>();
  for (const t of liveTables) {
    tableMetaMap.set(t.table_id, {
      status: t.status,
      seatedAt: t.seated_at,
      currentSpend: t.current_spend || 0,
      turnNumber: t.turn_number || 0,
      isVip: !!(t.reservation_id && vipRezIds.has(t.reservation_id)),
      isArrived: arrivedTableIds.has(t.table_id),
      spendIntensity: (t.current_spend || 0) / maxSpend,
    });
  }

  // Cover count per section (seated + occupied + check_dropped tables)
  const sectionCoverMap = new Map<string, number>();
  for (const t of liveTables) {
    if (t.section_id && ['seated', 'occupied', 'check_dropped'].includes(t.status) && t.party_size) {
      sectionCoverMap.set(t.section_id, (sectionCoverMap.get(t.section_id) ?? 0) + t.party_size);
    }
  }

  // ── Table Actions ──────────────────────────────────────────────

  const selectedTable = selectedTableId
    ? liveTables.find((t) => t.table_id === selectedTableId)
    : null;

  const tableById = useCallback((tableId: string) => liveTables.find((t) => t.table_id === tableId) || null, [liveTables]);

  const updateWaitlist = useCallback(async (entryId: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/waitlist/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update waitlist');
    }
  }, []);

  const postTransition = useCallback(async (
    body: Record<string, unknown>,
    contextLabel: string,
  ) => {
    const res = await fetch('/api/floor-plan/live/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return;
    const data = await res.json().catch(() => ({}));
    const fromStatus = data?.from_status ? ` (${data.from_status} -> ${data.to_status || '?'})` : '';
    if (res.status === 409) {
      throw new Error(`${contextLabel} conflict: ${data.error || 'state changed'}${fromStatus}`);
    }
    throw new Error(data.error || `${contextLabel} failed`);
  }, []);

  const seatWaitlistAtTable = useCallback(async (entry: WaitlistEntry, tableId: string) => {
    const table = tableById(tableId);
    if (!table) {
      showAlert('error', 'Target table no longer exists');
      return;
    }
    if (!['available', 'reserved'].includes(table.status)) {
      showAlert('error', `Table ${table.table_number} is ${table.status}. Choose an open table.`);
      return;
    }
    await postTransition({
      venue_id: venueId,
      table_id: table.table_id,
      date: businessDate,
      action: 'seat',
      party_size: entry.party_size,
      expected_duration: 90,
    }, 'Seat waitlist');
    await updateWaitlist(entry.id, {
      status: 'seated',
      seated_at: new Date().toISOString(),
    });
    setPendingWaitlistSeat(null);
    setSelectedTableId(null);
    await fetchLiveData();
    showAlert('success', `${entry.guest_name} seated at ${table.table_number}`);
  }, [tableById, showAlert, postTransition, venueId, businessDate, updateWaitlist, fetchLiveData]);

  const handleTableSelect = useCallback((id: string) => {
    if (pendingWaitlistSeat) {
      void seatWaitlistAtTable(pendingWaitlistSeat, id).catch((err) => {
        showAlert('error', err instanceof Error ? err.message : 'Failed to seat waitlist party');
      });
      return;
    }
    setSelectedTableId(id);
  }, [pendingWaitlistSeat, seatWaitlistAtTable, showAlert]);

  const handleDeselectAll = useCallback(() => {
    setSelectedTableId(null);
    setPendingWaitlistSeat(null);
  }, []);

  const handleTableAction = async (action: string) => {
    if (!selectedTable) return;

    if (action === 'seat_walkin') {
      setSeatWalkinTableId(selectedTable.table_id);
      setSeatWalkinTableNumber(selectedTable.table_number);
      setShowSeatWalkinDialog(true);
      setSelectedTableId(null);
      return;
    }

    if (action === 'combine_tables') {
      setShowCombineDialog(true);
      return;
    }

    if (action === 'release_combo') {
      const combo = tableComboMap.get(selectedTable.table_id);
      if (combo) {
        const res = await fetch('/api/floor-plan/live/combos', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ combo_id: combo.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showAlert('error', data.error || 'Failed to release combo');
          return;
        }
        setSelectedTableId(null);
        await fetchCombos();
        fetchLiveData();
        showAlert('success', 'Combined table released');
      }
      return;
    }

    if (action === 'force_complete') {
      await handleForceComplete(selectedTable);
      return;
    }

    // Map action to API action name
    const actionMap: Record<string, string> = {
      seat: 'seat',
      bus: 'bus',
      clear: 'clear',
      block: 'block',
      unblock: 'unblock',
    };

    const apiAction = actionMap[action];
    if (!apiAction) return;

    try {
      const body: Record<string, unknown> = {
        venue_id: venueId,
        table_id: selectedTable.table_id,
        date: businessDate,
        action: apiAction,
      };

      // For seating a reserved party, pass reservation details
      if (action === 'seat' && selectedTable.reservation_id) {
        body.reservation_id = selectedTable.reservation_id;
        body.party_size = selectedTable.party_size || 2;
        body.expected_duration = 90;
      }

      await postTransition(body, `Table ${selectedTable.table_number}`);

      // For seat/clear on a combo primary, propagate to all secondary tables
      const combo = tableComboMap.get(selectedTable.table_id);
      const secondaryIds = combo
        ? combo.combined_table_ids.filter((id) => id !== selectedTable.table_id)
        : [];

      if (secondaryIds.length > 0 && (action === 'seat' || action === 'clear')) {
        await Promise.all(secondaryIds.map((tableId) => postTransition({
          venue_id: venueId,
          table_id: tableId,
          date: businessDate,
          action: apiAction,
          ...(action === 'seat'
            ? {
                reservation_id: selectedTable.reservation_id || undefined,
                party_size: selectedTable.party_size || 2,
                expected_duration: 90,
              }
            : {}),
        }, `Combo table ${tableId}`)));
        // Release combo when clearing
        if (action === 'clear' && combo) {
          const res = await fetch('/api/floor-plan/live/combos', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ combo_id: combo.id }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showAlert('error', data.error || 'Failed to release combo');
          }
          fetchCombos();
        }
      }

      // When cancelling a reserved table, also cancel the reservation record
      if (action === 'clear' && selectedTable.status === 'reserved' && selectedTable.reservation_id) {
        fetch(`/api/reservations/${selectedTable.reservation_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancelled' }),
        }).catch(() => {});
      }

      setSelectedTableId(null);
      await fetchLiveData();
      showAlert('success', `${selectedTable.table_number} updated`);

      // After a table clears, fire suggestion for any arrived party already waiting
      if (action === 'clear') {
        triggerSuggestionForArrivedParty(upcoming);
      }
    } catch (err) {
      console.error('[host-stand] Transition error:', err);
      showAlert('error', err instanceof Error ? err.message : 'Transition failed');
    }
  };

  const handleSeatWalkinFromSidebar = () => {
    setSeatWalkinTableId(undefined);
    setSeatWalkinTableNumber(undefined);
    setShowSeatWalkinDialog(true);
  };

  const handleMarkArrived = async (rezId: string) => {
    try {
      const res = await fetch(`/api/reservations/${rezId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'arrived' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to mark arrived');
      }
      fetchLiveData();
    } catch {
      showAlert('error', 'Failed to mark arrived');
    }
  };

  const handleMarkNoShow = async (rezId: string) => {
    try {
      const res = await fetch(`/api/reservations/${rezId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'no_show' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to mark no-show');
      }
      fetchLiveData();
    } catch {
      showAlert('error', 'Failed to mark no-show');
    }
  };

  const handleCancelReservation = async (rezId: string) => {
    try {
      const res = await fetch(`/api/reservations/${rezId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancelled' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to cancel reservation');
      }
      fetchLiveData();
    } catch {
      showAlert('error', 'Failed to cancel reservation');
    }
  };

  const handleSeatWaitlist = async (entry: WaitlistEntry) => {
    if (selectedTable && ['available', 'reserved'].includes(selectedTable.status)) {
      try {
        await seatWaitlistAtTable(entry, selectedTable.table_id);
      } catch (err) {
        showAlert('error', err instanceof Error ? err.message : 'Failed to seat waitlist party');
      }
      return;
    }
    setPendingWaitlistSeat(entry);
    setSelectedTableId(null);
    showAlert('info', `Select an available table to seat ${entry.guest_name}`);
  };

  const handleNoShowWaitlist = async (entryId: string) => {
    try {
      await updateWaitlist(entryId, { status: 'no_show' });
      await fetchLiveData();
      showAlert('success', 'Waitlist entry marked no-show');
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'Failed to update waitlist');
    }
  };

  const handleRemoveWaitlist = async (entryId: string) => {
    try {
      await updateWaitlist(entryId, { status: 'cancelled' });
      await fetchLiveData();
      showAlert('success', 'Waitlist entry removed');
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'Failed to update waitlist');
    }
  };

  const handleAdjustWaitQuote = async (entryId: string, nextQuotedWait: number) => {
    try {
      await updateWaitlist(entryId, { quoted_wait: nextQuotedWait });
      await fetchLiveData();
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'Failed to update quote');
    }
  };

  // ── Drag-to-seat ───────────────────────────────────────────────

  /** Find table element under a screen coordinate, ignoring the drag overlay */
  const findTableAtPoint = useCallback((x: number, y: number): string | null => {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      let node: HTMLElement | null = el as HTMLElement;
      while (node) {
        const tableId = node.dataset?.tableId;
        if (tableId) return tableId;
        node = node.parentElement;
      }
    }
    return null;
  }, []);

  const [activeDragData, setActiveDragData] = useState<{ guest_name: string; party_size: number } | null>(null);
  const activeDragRez = useRef<UpcomingReservation | null>(null);
  const pointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragHoverTableId, setDragHoverTableId] = useState<string | null>(null);
  const dragTrackingCleanupRef = useRef<(() => void) | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    dragTrackingCleanupRef.current?.();

    const onMove = (e: PointerEvent) => {
      pointerPos.current = { x: e.clientX, y: e.clientY };
      setDragHoverTableId(findTableAtPoint(e.clientX, e.clientY));
    };
    window.addEventListener('pointermove', onMove);
    dragTrackingCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      setDragHoverTableId(null);
    };

    // Seed pointer position at drag start in case pointermove never fires.
    const activator = event.activatorEvent as MouseEvent | PointerEvent | TouchEvent | undefined;
    if (activator) {
      if ('clientX' in activator && 'clientY' in activator) {
        pointerPos.current = { x: activator.clientX, y: activator.clientY };
      } else if ('touches' in activator && activator.touches.length > 0) {
        pointerPos.current = {
          x: activator.touches[0].clientX,
          y: activator.touches[0].clientY,
        };
      }
    }

    if (event.active.data.current?.type === 'reservation') {
      const rez = event.active.data.current.reservation as UpcomingReservation;
      activeDragRez.current = rez;
      setActiveDragData({ guest_name: rez.guest_name, party_size: rez.party_size });
    }
  };

  const handleDragEnd = async (_event: DragEndEvent) => {
    setActiveDragData(null);
    dragTrackingCleanupRef.current?.();
    dragTrackingCleanupRef.current = null;
    const rez = activeDragRez.current;
    activeDragRez.current = null;
    if (!rez) return;

    // Use the last tracked pointer position for drop hit-testing.
    let x = pointerPos.current.x;
    let y = pointerPos.current.y;
    const tableId = findTableAtPoint(x, y);
    if (!tableId) return;

    const tableEl = document.querySelector(`[data-table-id="${tableId}"]`) as HTMLElement | null;
    const tableStatus = tableEl?.dataset.tableStatus || 'available';
    if (!['available', 'reserved'].includes(tableStatus)) {
      showAlert('error', 'Drop target is not open');
      return;
    }

    try {
      await postTransition({
        venue_id: venueId,
        table_id: tableId,
        date: businessDate,
        action: 'seat',
        reservation_id: rez.id,
        party_size: rez.party_size,
        expected_duration: 90,
      }, `Drag seat ${rez.guest_name || 'guest'}`);

      // If there was an open suggestion and host chose a different table, log as overridden
      if (
        activeSuggestion &&
        activeSuggestion.reservation_id === rez.id &&
        activeSuggestion.table_id !== tableId
      ) {
        fetch('/api/floor-plan/live/suggest-seat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            suggestion_id: activeSuggestion.id,
            outcome: 'overridden',
            actual_table_id: tableId,
          }),
        }).catch(() => {});
        setActiveSuggestion(null);
      }

      fetchLiveData();
    } catch (err) {
      console.error('[host-stand] Drag seat failed:', err);
      showAlert('error', err instanceof Error ? err.message : 'Drag seat failed');
    }
  };

  // ── Force Complete (chain through state machine to bussing) ────

  const handleForceComplete = async (table: LiveTable) => {
    const sequences: Record<string, string[]> = {
      seated: ['occupy', 'check_drop', 'bus', 'clear'],
      occupied: ['check_drop', 'bus', 'clear'],
      check_dropped: ['bus', 'clear'],
      bussing: ['clear'],
    };
    const actions = sequences[table.status];
    if (!actions) return;

    try {
      for (const action of actions) {
        await postTransition({ venue_id: venueId, table_id: table.table_id, date: businessDate, action }, `Force complete ${table.table_number}`);
      }
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'Force complete failed');
      return;
    }

    // Propagate force_complete to combo secondary tables, then release combo
    const combo = tableComboMap.get(table.table_id);
    if (combo) {
      const secondaryIds = combo.combined_table_ids.filter((id) => id !== table.table_id);
      for (const secId of secondaryIds) {
        for (const action of actions) {
          await postTransition({ venue_id: venueId, table_id: secId, date: businessDate, action }, `Force complete combo ${secId}`).catch(() => {});
        }
      }
      await fetch('/api/floor-plan/live/combos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combo_id: combo.id }),
      }).catch(() => {});
      fetchCombos();
    }

    setSelectedTableId(null);
    await fetchLiveData();
    showAlert('success', `${table.table_number} force completed`);
    // Table just cleared — fire suggestion for any arrived party already waiting
    triggerSuggestionForArrivedParty(upcoming);
  };

  // ── Render ─────────────────────────────────────────────────────

  const now = Date.now();
  const msSinceLiveUpdate = now - lastLiveUpdateAt;
  const connectionStatus: 'live' | 'degraded' | 'offline' =
    isOffline || msSinceLiveUpdate > 300_000
      ? 'offline'
      : (syncFailures > 0 || msSinceLiveUpdate > 90_000)
        ? 'degraded'
        : 'live';
  const connectionLabel =
    connectionStatus === 'live'
      ? 'Realtime'
      : connectionStatus === 'degraded'
        ? 'Polling fallback'
        : 'No network';

  return (
    <div className="flex flex-col h-screen bg-[#1C1917] overflow-hidden">
      <HostStandHeader
        venueName={venueName}
        hostName={hostName}
        businessDate={businessDate}
        onDateNav={handleDateNav}
        onDateSet={handleDateSet}
        connectionStatus={connectionStatus}
        connectionLabel={connectionLabel}
      />

      {alert && (
        <div
          className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-sm ${
            alert.type === 'error'
              ? 'border-red-700 bg-red-900/30 text-red-200'
              : alert.type === 'success'
                ? 'border-emerald-700 bg-emerald-900/30 text-emerald-200'
                : 'border-amber-700 bg-amber-900/30 text-amber-200'
          }`}
        >
          {alert.message}
        </div>
      )}

      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 min-h-0">
          {/* Sidebar — left */}
          <div className="w-80 shrink-0">
            <HostStandSidebar
              upcoming={upcoming}
              seatedReservations={seatedReservations}
              completed={completedRez}
              noShows={noShows}
              cancelled={cancelledRez}
              waitlist={waitlist}
              onAddWaitlist={() => setShowWaitlistDialog(true)}
              onSeatWalkin={handleSeatWalkinFromSidebar}
              onNewReservation={() => setShowNewReservationDialog(true)}
              onMarkArrived={handleMarkArrived}
              onMarkNoShow={handleMarkNoShow}
              onCancelReservation={handleCancelReservation}
              onSeatWaitlist={handleSeatWaitlist}
              onNoShowWaitlist={handleNoShowWaitlist}
              onRemoveWaitlist={handleRemoveWaitlist}
              onAdjustWaitQuote={handleAdjustWaitQuote}
            />
          </div>

          {/* Floor plan area */}
          <div className="flex-1 flex flex-col p-4 gap-3">
            {pendingWaitlistSeat && (
              <div className="rounded-lg border border-amber-700 bg-amber-900/25 px-3 py-2 text-sm text-amber-200">
                Seating mode: tap an open table for {pendingWaitlistSeat.guest_name} ({pendingWaitlistSeat.party_size}).
              </div>
            )}
            <FloorPlanCanvas
              tables={canvasTables}
              sections={sections}
              labels={labels}
              selectedTableIds={new Set(selectedTableId ? [selectedTableId] : [])}
              highlightedTableIds={activeSuggestion ? new Set([activeSuggestion.table_id]) : undefined}
              tableColorMap={tableColorMap}
              tableLabelMap={tableLabelMap}
              tableMetaMap={tableMetaMap}
              transitioningTableIds={transitioningTableIds}
              sectionServerMap={sectionServerMap}
              sectionCoverMap={sectionCoverMap}
              comboTableIds={comboTableIds}
              comboPrimaryIds={comboPrimaryIds}
              dragHoverTableId={dragHoverTableId}
              onSelectTable={handleTableSelect}
              onDeselectAll={handleDeselectAll}
              onDoubleClickTable={() => {}}
              readOnly
            />
            <TableStatusLegend />
          </div>
        </div>

        {/* Drag overlay — shows what's being dragged */}
        <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
          {activeDragData && (
            <div className="px-3 py-2 bg-[#D4622B] text-white text-sm font-semibold rounded-lg shadow-xl whitespace-nowrap">
              {activeDragData.guest_name || 'Guest'} · {activeDragData.party_size}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <HostStandMetricsBar
        totalCovers={summary.total_covers}
        available={summary.available}
        totalTables={summary.total_tables}
        avgTurnMinutes={summary.avg_turn_minutes}
        waitlistCount={summary.waitlist_count}
        totalRevenue={summary.total_revenue}
      />

      {/* Table action sheet */}
      {selectedTable && (() => {
        const allRezs = [...upcoming, ...seatedReservations, ...completedRez];
        const matchingRez = selectedTable.reservation_id
          ? allRezs.find(r => r.id === selectedTable.reservation_id)
          : null;

        const tableCombo = tableComboMap.get(selectedTable.table_id);
        return (
          <TableActionSheet
            table={{
              ...selectedTable,
              reservation_id: selectedTable.reservation_id,
              reservation_notes: matchingRez?.notes ?? null,
              client_requests: matchingRez?.client_requests ?? null,
              combo_id: tableCombo?.id ?? null,
              is_combo_primary: tableCombo?.primary_table_id === selectedTable.table_id,
            }}
            venueId={venueId}
            businessDate={businessDate}
            onAction={handleTableAction}
            onClose={() => setSelectedTableId(null)}
            onNoteAdded={fetchLiveData}
          />
        );
      })()}

      {/* New reservation dialog */}
      {showNewReservationDialog && (
        <NewReservationDialog
          venueId={venueId}
          date={businessDate}
          onClose={() => setShowNewReservationDialog(false)}
          onCreated={fetchLiveData}
        />
      )}

      {/* Add waitlist dialog */}
      {showWaitlistDialog && (
        <AddWaitlistDialog
          venueId={venueId}
          date={businessDate}
          onClose={() => setShowWaitlistDialog(false)}
          onAdded={fetchLiveData}
        />
      )}

      {/* Seat walk-in dialog */}
      {showSeatWalkinDialog && (
        <SeatWalkinDialog
          venueId={venueId}
          date={businessDate}
          tableId={seatWalkinTableId}
          tableNumber={seatWalkinTableNumber}
          onClose={() => setShowSeatWalkinDialog(false)}
          onSeated={fetchLiveData}
        />
      )}

      {/* Combine tables dialog */}
      {showCombineDialog && selectedTable && (
        <CombineTablesDialog
          primaryTable={{
            table_id: selectedTable.table_id,
            table_number: selectedTable.table_number,
            max_capacity: selectedTable.max_capacity,
            section_id: selectedTable.section_id,
          }}
          availableTables={liveTables
            .filter((t) => t.status === 'available' && !comboTableIds.has(t.table_id))
            .map((t) => ({
              table_id: t.table_id,
              table_number: t.table_number,
              max_capacity: t.max_capacity,
              section_id: t.section_id,
            }))}
          venueId={venueId}
          date={businessDate}
          onClose={() => { setShowCombineDialog(false); setSelectedTableId(null); }}
          onCombined={() => { fetchCombos(); fetchLiveData(); }}
        />
      )}

      {/* AI seat suggestion toast */}
      {activeSuggestion && (
        <SeatSuggestionToast
          suggestion={activeSuggestion}
          onAccept={handleSuggestionAccept}
          onDismiss={handleSuggestionDismiss}
        />
      )}
    </div>
  );
}
