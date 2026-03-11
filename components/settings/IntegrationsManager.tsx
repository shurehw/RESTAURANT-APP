'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plug,
  RefreshCw,
  Save,
  ChevronRight,
  Clock,
  Users,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  Link2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface VenueSettings {
  id: string;
  org_id: string;
  venue_id: string;
  venue_name: string;
  sr_venue_id: string | null;
  is_connected: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  covers_per_interval: number | null;
  custom_pacing: Record<string, number>;
  interval_minutes: number | null;
  turn_time_overrides: Record<string, number>;
  last_push_at: string | null;
  last_push_status: string | null;
  last_push_error: string | null;
}

interface SRShift {
  name: string;
  category: string;
  start_time: string;
  end_time: string;
  duration_minutes_by_party_size: Record<string, number>;
  interval_minutes: number;
  covers_per_seating_interval: number;
  custom_pacing: Record<string, number>;
}

// ── Main Component ───────────────────────────────────────────────

export function IntegrationsManager() {
  const [venues, setVenues] = useState<VenueSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const loadVenues = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/sevenrooms');
      const data = await res.json();
      if (data.success) {
        setVenues(data.venues || []);
      }
    } catch (err) {
      console.error('Failed to load SR settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVenues(); }, [loadVenues]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading integrations...
      </div>
    );
  }

  const selected = venues.find(v => v.venue_id === selectedVenueId) || null;

  return (
    <div className="space-y-10 max-w-5xl">
      {/* ── Mercantile Desk ── */}
      <MercantileIntegrationSection />

      {/* ── SevenRooms ── */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Plug className="w-6 h-6 text-opsos-sage-600" />
          <div>
            <h2 className="text-xl font-semibold">SevenRooms Integration</h2>
            <p className="text-sm text-muted-foreground">
              View live SR configuration and manage pacing overrides per venue
            </p>
          </div>
        </div>

        {/* Venue list */}
        <div className="grid gap-3">
          {venues.map(v => (
            <VenueCard
              key={v.venue_id}
              venue={v}
              isSelected={v.venue_id === selectedVenueId}
              onClick={() => setSelectedVenueId(
                v.venue_id === selectedVenueId ? null : v.venue_id
              )}
            />
          ))}
          {venues.length === 0 && (
            <p className="text-muted-foreground py-4">
              No venues configured. Run the SevenRooms venue settings migration first.
            </p>
          )}
        </div>

        {/* Selected venue detail */}
        {selected && (
          <VenueDetail
            venue={selected}
            onSaved={loadVenues}
          />
        )}
      </div>
    </div>
  );
}

// ── Venue Card ───────────────────────────────────────────────────

function VenueCard({
  venue,
  isSelected,
  onClick,
}: {
  venue: VenueSettings;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 ${
        isSelected ? 'ring-2 ring-opsos-sage-500 bg-gray-50' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ConnectionBadge connected={venue.is_connected} srVenueId={venue.sr_venue_id} />
          <div>
            <h3 className="font-medium">{venue.venue_name}</h3>
            <p className="text-xs text-muted-foreground">
              {venue.sr_venue_id
                ? `SR: ${venue.sr_venue_id.slice(-12)}`
                : 'No SR venue ID'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {venue.last_sync_at && (
            <span className="text-xs text-muted-foreground">
              Synced {timeAgo(venue.last_sync_at)}
            </span>
          )}
          {(venue.covers_per_interval != null ||
            Object.keys(venue.turn_time_overrides || {}).length > 0) && (
            <Badge variant="outline" className="text-xs">
              Overrides active
            </Badge>
          )}
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${
            isSelected ? 'rotate-90' : ''
          }`} />
        </div>
      </div>
    </Card>
  );
}

// ── Venue Detail (expanded) ──────────────────────────────────────

function VenueDetail({
  venue,
  onSaved,
}: {
  venue: VenueSettings;
  onSaved: () => void;
}) {
  const [liveShifts, setLiveShifts] = useState<SRShift[] | null>(null);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Editable overrides
  const [coversPerInterval, setCoversPerInterval] = useState<string>(
    venue.covers_per_interval?.toString() ?? ''
  );
  const [intervalMinutes, setIntervalMinutes] = useState<string>(
    venue.interval_minutes?.toString() ?? ''
  );
  const [turnTimeOverrides, setTurnTimeOverrides] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(venue.turn_time_overrides || {}).map(([k, v]) => [k, String(v)])
    )
  );
  const [customPacing, setCustomPacing] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(venue.custom_pacing || {}).map(([k, v]) => [k, String(v)])
    )
  );

  // Fetch live shifts on mount
  useEffect(() => {
    if (!venue.sr_venue_id) return;
    setLoadingShifts(true);
    fetch(`/api/integrations/sevenrooms?venue_id=${venue.venue_id}`)
      .then(r => r.json())
      .then(data => {
        if (data.liveShifts) setLiveShifts(data.liveShifts);
      })
      .catch(() => {})
      .finally(() => setLoadingShifts(false));
  }, [venue.venue_id, venue.sr_venue_id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = { venue_id: venue.venue_id };

      if (coversPerInterval !== '') {
        body.covers_per_interval = parseInt(coversPerInterval);
      } else {
        body.covers_per_interval = null;
      }
      if (intervalMinutes !== '') {
        body.interval_minutes = parseInt(intervalMinutes);
      } else {
        body.interval_minutes = null;
      }

      // Convert string maps to number maps, filtering empty values
      body.turn_time_overrides = Object.fromEntries(
        Object.entries(turnTimeOverrides)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, parseInt(v)])
      );
      body.custom_pacing = Object.fromEntries(
        Object.entries(customPacing)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, parseInt(v)])
      );

      const res = await fetch('/api/integrations/sevenrooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSaved();
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (err) {
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/integrations/sevenrooms/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venue.venue_id }),
      });
      const data = await res.json();
      setSyncResult(data.message || (data.success ? 'Synced' : 'Failed'));
      onSaved();
    } catch {
      setSyncResult('Sync request failed');
    } finally {
      setSyncing(false);
    }
  };

  const primaryShift = liveShifts?.[0] ?? null;

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{venue.venue_name} — Configuration</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing || !venue.sr_venue_id}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync to SR'}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
          >
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Saving...' : 'Save Overrides'}
          </Button>
        </div>
      </div>

      {syncResult && (
        <div className="text-sm px-3 py-2 rounded bg-gray-100">
          {syncResult}
        </div>
      )}

      {venue.last_push_status && (
        <PushStatusBadge
          status={venue.last_push_status}
          at={venue.last_push_at}
          error={venue.last_push_error}
        />
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Live SR Data */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Live from SevenRooms
          </h4>

          {loadingShifts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading shifts...
            </div>
          ) : primaryShift ? (
            <div className="space-y-3">
              <InfoRow label="Shift" value={primaryShift.name} />
              <InfoRow label="Hours" value={`${formatTime(primaryShift.start_time)} – ${formatTime(primaryShift.end_time)}`} />
              <InfoRow label="Interval" value={`${primaryShift.interval_minutes} min`} />
              <InfoRow label="Covers/interval" value={String(primaryShift.covers_per_seating_interval)} />

              {/* Turn times from SR */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Turn times (SR)</p>
                <div className="grid grid-cols-4 gap-1 text-xs">
                  {Object.entries(primaryShift.duration_minutes_by_party_size || {})
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .slice(0, 8)
                    .map(([size, mins]) => (
                      <div key={size} className="bg-gray-50 rounded px-2 py-1">
                        <span className="text-gray-500">{size === '-1' ? '11+' : `${size}p`}</span>{' '}
                        <span className="font-medium">{mins}m</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Custom pacing from SR */}
              {Object.keys(primaryShift.custom_pacing || {}).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Custom pacing (SR)</p>
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    {Object.entries(primaryShift.custom_pacing)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([slot, covers]) => (
                        <div key={slot} className="bg-gray-50 rounded px-2 py-1">
                          <span className="text-gray-500">{slot}</span>{' '}
                          <span className="font-medium">{covers}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              {venue.sr_venue_id ? 'No shifts found for today' : 'No SR venue ID configured'}
            </p>
          )}
        </div>

        {/* Right: OpSOS Overrides */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Clock className="w-4 h-4" />
            OpSOS Overrides
          </h4>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Covers per interval
              </label>
              <input
                type="number"
                value={coversPerInterval}
                onChange={e => setCoversPerInterval(e.target.value)}
                placeholder={primaryShift ? String(primaryShift.covers_per_seating_interval) : 'e.g. 50'}
                min={1}
                max={500}
                className="w-32 p-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-0.5">
                Blank = use SR default
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interval (minutes)
              </label>
              <input
                type="number"
                value={intervalMinutes}
                onChange={e => setIntervalMinutes(e.target.value)}
                placeholder={primaryShift ? String(primaryShift.interval_minutes) : 'e.g. 30'}
                min={5}
                max={120}
                className="w-32 p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            {/* Turn time overrides */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Turn time overrides (minutes)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {['2', '4', '6', '8', '10', '-1'].map(size => (
                  <div key={size} className="flex flex-col">
                    <span className="text-xs text-gray-500 mb-0.5">
                      {size === '-1' ? '11+' : `${size}p`}
                    </span>
                    <input
                      type="number"
                      value={turnTimeOverrides[size] ?? ''}
                      onChange={e => setTurnTimeOverrides(prev => ({
                        ...prev,
                        [size]: e.target.value,
                      }))}
                      placeholder={
                        primaryShift?.duration_minutes_by_party_size?.[size]
                          ? String(primaryShift.duration_minutes_by_party_size[size])
                          : '—'
                      }
                      min={15}
                      max={300}
                      className="w-full p-1.5 border border-gray-300 rounded text-sm text-center"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Blank = use SR default for that party size
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Mercantile Desk Integration ──────────────────────────────────

interface MercantileIntegration {
  id: string;
  mercantile_org_id: string;
  api_key?: string;
  api_key_last4: string;
  catalog_sync_enabled: boolean;
  enforce_catalog_only: boolean;
  default_vendor_id: string | null;
  last_sync_at: string | null;
}

function MercantileIntegrationSection() {
  const [integration, setIntegration] = useState<MercantileIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form
  const [mercantileOrgId, setMercantileOrgId] = useState('');
  const [catalogSync, setCatalogSync] = useState(true);
  const [enforceOnly, setEnforceOnly] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/integrations/mercantile');
        const data = await res.json();
        if (data.integration) {
          setIntegration(data.integration);
          setMercantileOrgId(data.integration.mercantile_org_id);
          setCatalogSync(data.integration.catalog_sync_enabled);
          setEnforceOnly(data.integration.enforce_catalog_only);
        }
      } catch (e) {
        console.error('Error loading mercantile integration:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/integrations/mercantile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mercantile_org_id: mercantileOrgId,
          catalog_sync_enabled: catalogSync,
          enforce_catalog_only: enforceOnly,
        }),
      });
      const data = await res.json();
      if (data.integration) {
        if (data.integration.api_key && !integration) {
          setNewApiKey(data.integration.api_key);
        }
        setIntegration(data.integration);
        setHasChanges(false);
        setMessage({
          type: 'success',
          text: integration
            ? 'Settings updated.'
            : 'Connected! Copy the API key below — it won\'t be shown again.',
        });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('Regenerate API key? The current key will stop working immediately.')) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/integrations/mercantile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate_api_key: true }),
      });
      const data = await res.json();
      if (data.integration?.api_key) {
        setNewApiKey(data.integration.api_key);
        setIntegration(data.integration);
        setMessage({ type: 'success', text: 'New API key generated. Copy it now.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to regenerate key.' });
    } finally {
      setSaving(false);
    }
  };

  const copyKey = async () => {
    if (newApiKey) {
      await navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const update = (setter: (v: any) => void, value: any) => {
    setter(value);
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading Mercantile Desk integration...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link2 className="w-6 h-6 text-opsos-sage-600" />
          <div>
            <h2 className="text-xl font-semibold">Mercantile Desk</h2>
            <p className="text-sm text-muted-foreground">
              Receive approved branded items from your brand standards platform
            </p>
          </div>
        </div>
        <Badge variant={integration ? 'default' : 'outline'}>
          {integration ? 'Connected' : 'Not configured'}
        </Badge>
      </div>

      <Card className="p-5 space-y-4">
        {/* Mercantile Org ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mercantile Organization ID
          </label>
          <input
            type="text"
            placeholder="org_..."
            value={mercantileOrgId}
            onChange={(e) => update(setMercantileOrgId, e.target.value)}
            className="w-full max-w-md p-2 border border-gray-300 rounded-md text-sm font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">
            From Mercantile Desk Admin &gt; Integrations
          </p>
        </div>

        {/* API Key */}
        {integration && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            {newApiKey ? (
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={newApiKey}
                  readOnly
                  className="flex-1 p-2 border border-gray-300 rounded-md text-sm font-mono bg-gray-50"
                />
                <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={copyKey}>
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="p-2 border border-gray-300 rounded-md text-sm font-mono bg-gray-50">
                  {integration.api_key_last4 || '••••••••'}
                </span>
                <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={saving}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regenerate
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Enter this key in Mercantile Desk &gt; Admin &gt; Integrations &gt; OpsOS API Key
            </p>
          </div>
        )}

        {/* Toggles */}
        <div className="space-y-3 pt-2">
          <div className="flex items-start justify-between py-2">
            <div>
              <h3 className="font-medium text-gray-900">Catalog Sync</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Receive catalog items from Mercantile Desk automatically
              </p>
            </div>
            <button
              onClick={() => update(setCatalogSync, !catalogSync)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                catalogSync ? 'bg-opsos-sage-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                catalogSync ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-start justify-between py-2">
            <div>
              <h3 className="font-medium text-gray-900">Enforce Catalog Only</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Block POs for branded items not in the approved catalog
              </p>
            </div>
            <button
              onClick={() => update(setEnforceOnly, !enforceOnly)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                enforceOnly ? 'bg-opsos-sage-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                enforceOnly ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        {/* Last sync */}
        {integration?.last_sync_at && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            Last catalog sync: {timeAgo(integration.last_sync_at)}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || (!hasChanges && !!integration)}
            className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : integration ? 'Update' : 'Connect'}
          </Button>
        </div>
      </Card>

      {/* Status message */}
      {message && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          }
          {message.text}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function ConnectionBadge({ connected, srVenueId }: { connected: boolean; srVenueId: string | null }) {
  if (!srVenueId) {
    return (
      <div className="w-2.5 h-2.5 rounded-full bg-gray-300" title="Not configured" />
    );
  }
  return (
    <div
      className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-yellow-500'}`}
      title={connected ? 'Connected' : 'Disconnected'}
    />
  );
}

function PushStatusBadge({
  status,
  at,
  error,
}: {
  status: string;
  at: string | null;
  error: string | null;
}) {
  const icon =
    status === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> :
    status === 'unsupported' ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" /> :
    <XCircle className="w-3.5 h-3.5 text-red-600" />;

  const label =
    status === 'success' ? 'Last push succeeded' :
    status === 'unsupported' ? 'SR write API not available' :
    'Last push failed';

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
      {at && <span>({timeAgo(at)})</span>}
      {error && status === 'error' && (
        <span className="text-red-500 truncate max-w-xs" title={error}>
          — {error}
        </span>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function formatTime(time: string): string {
  // "17:00:00" → "5:00 PM"
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
