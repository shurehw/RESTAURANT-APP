'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Shield, Save, Plus, Trash2, Search, Loader2, Check, X } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
}

interface ProcurementSettings {
  cost_spike_z_threshold: number;
  cost_spike_lookback_days: number;
  cost_spike_min_history: number;
  shrink_cost_warning: number;
  shrink_cost_critical: number;
  recipe_drift_warning_pct: number;
  recipe_drift_critical_pct: number;
  recipe_drift_lookback_days: number;
  require_purchasing_authorization: boolean;
  version?: number;
}

interface PurchasingAuth {
  id: string;
  org_id: string;
  user_id: string;
  venue_id: string | null;
  authorized_item_ids: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  user_email?: string;
  user_name?: string;
  venue_name?: string;
  item_names?: string[];
}

interface Props {
  organizations: Organization[];
}

export function ProcurementSettingsManager({ organizations }: Props) {
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(organizations[0] || null);
  const [settings, setSettings] = useState<ProcurementSettings | null>(null);
  const [authorizations, setAuthorizations] = useState<PurchasingAuth[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'thresholds' | 'authorizations'>('thresholds');

  // Form state for thresholds
  const [formData, setFormData] = useState<ProcurementSettings | null>(null);

  // Authorization form
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [editingAuth, setEditingAuth] = useState<PurchasingAuth | null>(null);
  const [authForm, setAuthForm] = useState({
    user_id: '',
    venue_id: '',
    authorized_item_ids: [] as string[],
    notes: '',
  });

  // Item search
  const [itemSearch, setItemSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // User search
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);

  // Venues
  const [venues, setVenues] = useState<any[]>([]);

  // Selected item details (for display)
  const [selectedItems, setSelectedItems] = useState<Map<string, string>>(new Map());

  const loadSettings = useCallback(async (orgId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/settings?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data.data);
        setFormData(data.data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuthorizations = useCallback(async (orgId: string) => {
    try {
      const res = await fetch(`/api/procurement/authorizations?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setAuthorizations(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load authorizations:', error);
    }
  }, []);

  useEffect(() => {
    if (selectedOrg) {
      loadSettings(selectedOrg.id);
      loadAuthorizations(selectedOrg.id);
    }
  }, [selectedOrg, loadSettings, loadAuthorizations]);

  // ── Threshold Handlers ──────────────────────────────────────────

  function updateField(field: keyof ProcurementSettings, value: number | boolean) {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
  }

  async function handleSaveThresholds() {
    if (!selectedOrg || !formData) return;

    setSaving(true);
    try {
      const res = await fetch('/api/procurement/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: selectedOrg.id,
          updates: formData,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data.data);
        setFormData(data.data);
        alert(`Settings updated to version ${data.version}`);
      } else {
        const error = await res.json();
        alert(`Failed: ${error.error}`);
      }
    } catch (error) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  // ── Authorization Handlers ──────────────────────────────────────

  async function searchItems(query: string) {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      // Use supabase client to search items
      const res = await fetch(`/api/items/search?q=${encodeURIComponent(query)}&org_id=${selectedOrg?.id}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items || []);
      }
    } catch (error) {
      console.error('Item search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  }

  function toggleItem(itemId: string, itemName: string) {
    const newIds = [...authForm.authorized_item_ids];
    const newItems = new Map(selectedItems);

    if (newIds.includes(itemId)) {
      newIds.splice(newIds.indexOf(itemId), 1);
      newItems.delete(itemId);
    } else {
      newIds.push(itemId);
      newItems.set(itemId, itemName);
    }

    setAuthForm({ ...authForm, authorized_item_ids: newIds });
    setSelectedItems(newItems);
  }

  function removeItem(itemId: string) {
    const newIds = authForm.authorized_item_ids.filter(id => id !== itemId);
    const newItems = new Map(selectedItems);
    newItems.delete(itemId);
    setAuthForm({ ...authForm, authorized_item_ids: newIds });
    setSelectedItems(newItems);
  }

  async function handleSaveAuth() {
    if (!selectedOrg || !authForm.user_id || authForm.authorized_item_ids.length === 0) {
      alert('Select a user and at least one item');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/procurement/authorizations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: selectedOrg.id,
          user_id: authForm.user_id,
          venue_id: authForm.venue_id || null,
          authorized_item_ids: authForm.authorized_item_ids,
          notes: authForm.notes || null,
        }),
      });

      if (res.ok) {
        await loadAuthorizations(selectedOrg.id);
        setShowAuthForm(false);
        setEditingAuth(null);
        resetAuthForm();
      } else {
        const error = await res.json();
        alert(`Failed: ${error.error}`);
      }
    } catch (error) {
      alert('Failed to save authorization');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAuth(authId: string) {
    if (!confirm('Deactivate this purchasing authorization?')) return;

    try {
      const res = await fetch(`/api/procurement/authorizations?id=${authId}`, {
        method: 'DELETE',
      });

      if (res.ok && selectedOrg) {
        await loadAuthorizations(selectedOrg.id);
      } else {
        const error = await res.json();
        alert(`Failed: ${error.error}`);
      }
    } catch (error) {
      alert('Failed to deactivate authorization');
    }
  }

  function resetAuthForm() {
    setAuthForm({ user_id: '', venue_id: '', authorized_item_ids: [], notes: '' });
    setSelectedItems(new Map());
    setItemSearch('');
    setSearchResults([]);
  }

  function startEditAuth(auth: PurchasingAuth) {
    setEditingAuth(auth);
    setAuthForm({
      user_id: auth.user_id,
      venue_id: auth.venue_id || '',
      authorized_item_ids: auth.authorized_item_ids,
      notes: auth.notes || '',
    });

    // Populate selected items map
    const items = new Map<string, string>();
    auth.authorized_item_ids.forEach((id, i) => {
      items.set(id, auth.item_names?.[i] || id.substring(0, 8));
    });
    setSelectedItems(items);
    setShowAuthForm(true);
  }

  // ── Render ──────────────────────────────────────────────────────

  if (organizations.length === 0) {
    return <p className="text-muted-foreground">No organizations found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Org selector */}
      {organizations.length > 1 && (
        <select
          className="input max-w-xs"
          value={selectedOrg?.id || ''}
          onChange={e => {
            const org = organizations.find(o => o.id === e.target.value);
            setSelectedOrg(org || null);
          }}
        >
          {organizations.map(org => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'thresholds'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('thresholds')}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          Thresholds
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'authorizations'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('authorizations')}
        >
          <Shield className="w-4 h-4 inline mr-2" />
          Purchasing Authorizations
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === 'thresholds' ? (
        <ThresholdsTab
          formData={formData}
          updateField={updateField}
          onSave={handleSaveThresholds}
          saving={saving}
          version={settings?.version}
        />
      ) : (
        <AuthorizationsTab
          authorizations={authorizations}
          showForm={showAuthForm}
          onShowForm={() => { resetAuthForm(); setShowAuthForm(true); }}
          onHideForm={() => { setShowAuthForm(false); setEditingAuth(null); resetAuthForm(); }}
          onEdit={startEditAuth}
          onDelete={handleDeleteAuth}
          authForm={authForm}
          setAuthForm={setAuthForm}
          selectedItems={selectedItems}
          itemSearch={itemSearch}
          setItemSearch={setItemSearch}
          searchResults={searchResults}
          searchLoading={searchLoading}
          onSearchItems={searchItems}
          onToggleItem={toggleItem}
          onRemoveItem={removeItem}
          onSave={handleSaveAuth}
          saving={saving}
          editing={!!editingAuth}
          requireAuth={formData?.require_purchasing_authorization || false}
        />
      )}
    </div>
  );
}

// ── Thresholds Tab ──────────────────────────────────────────────

function ThresholdsTab({
  formData,
  updateField,
  onSave,
  saving,
  version,
}: {
  formData: ProcurementSettings | null;
  updateField: (field: keyof ProcurementSettings, value: number | boolean) => void;
  onSave: () => void;
  saving: boolean;
  version?: number;
}) {
  if (!formData) return null;

  return (
    <div className="space-y-8">
      {/* Version badge */}
      {version && (
        <p className="text-xs text-muted-foreground">
          Current version: {version}
        </p>
      )}

      {/* Cost Spike Detection */}
      <section className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Cost Spike Detection</h3>
        <p className="text-sm text-muted-foreground">
          Flags items whose latest purchase cost deviates significantly from historical average.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Z-Score Threshold</label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="10"
              className="input w-full"
              value={formData.cost_spike_z_threshold}
              onChange={e => updateField('cost_spike_z_threshold', parseFloat(e.target.value) || 2)}
            />
            <p className="text-xs text-muted-foreground mt-1">Standard deviations from mean (default: 2.0)</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lookback Days</label>
            <input
              type="number"
              min="7"
              max="365"
              className="input w-full"
              value={formData.cost_spike_lookback_days}
              onChange={e => updateField('cost_spike_lookback_days', parseInt(e.target.value) || 90)}
            />
            <p className="text-xs text-muted-foreground mt-1">Historical window for average (default: 90)</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Minimum History</label>
            <input
              type="number"
              min="2"
              max="50"
              className="input w-full"
              value={formData.cost_spike_min_history}
              onChange={e => updateField('cost_spike_min_history', parseInt(e.target.value) || 5)}
            />
            <p className="text-xs text-muted-foreground mt-1">Min data points required (default: 5)</p>
          </div>
        </div>
      </section>

      {/* Inventory Shrink */}
      <section className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Inventory Shrink</h3>
        <p className="text-sm text-muted-foreground">
          Flags inventory counts where shrinkage cost exceeds thresholds.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Warning Threshold ($)</label>
            <input
              type="number"
              min="0"
              step="50"
              className="input w-full"
              value={formData.shrink_cost_warning}
              onChange={e => updateField('shrink_cost_warning', parseFloat(e.target.value) || 500)}
            />
            <p className="text-xs text-muted-foreground mt-1">Shrink cost that triggers warning (default: $500)</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Critical Threshold ($)</label>
            <input
              type="number"
              min="0"
              step="100"
              className="input w-full"
              value={formData.shrink_cost_critical}
              onChange={e => updateField('shrink_cost_critical', parseFloat(e.target.value) || 2000)}
            />
            <p className="text-xs text-muted-foreground mt-1">Shrink cost that triggers critical (default: $2,000)</p>
          </div>
        </div>
      </section>

      {/* Recipe Cost Drift */}
      <section className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Recipe Cost Drift</h3>
        <p className="text-sm text-muted-foreground">
          Flags recipes whose plate cost has drifted from the baseline.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Warning Drift (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              className="input w-full"
              value={formData.recipe_drift_warning_pct}
              onChange={e => updateField('recipe_drift_warning_pct', parseFloat(e.target.value) || 10)}
            />
            <p className="text-xs text-muted-foreground mt-1">% drift that triggers warning (default: 10%)</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Critical Drift (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              className="input w-full"
              value={formData.recipe_drift_critical_pct}
              onChange={e => updateField('recipe_drift_critical_pct', parseFloat(e.target.value) || 20)}
            />
            <p className="text-xs text-muted-foreground mt-1">% drift that triggers critical (default: 20%)</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lookback Days</label>
            <input
              type="number"
              min="7"
              max="365"
              className="input w-full"
              value={formData.recipe_drift_lookback_days}
              onChange={e => updateField('recipe_drift_lookback_days', parseInt(e.target.value) || 30)}
            />
            <p className="text-xs text-muted-foreground mt-1">Baseline comparison window (default: 30)</p>
          </div>
        </div>
      </section>

      {/* Purchasing Authorization Toggle */}
      <section className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Purchasing Authorization</h3>
        <p className="text-sm text-muted-foreground">
          When enabled, PO creation requires the user to have an active purchasing authorization covering all items in the order.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-border accent-accent"
            checked={formData.require_purchasing_authorization}
            onChange={e => updateField('require_purchasing_authorization', e.target.checked)}
          />
          <span className="font-medium">Require purchasing authorization for PO creation</span>
        </label>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Thresholds
        </button>
      </div>
    </div>
  );
}

// ── Authorizations Tab ──────────────────────────────────────────

function AuthorizationsTab({
  authorizations,
  showForm,
  onShowForm,
  onHideForm,
  onEdit,
  onDelete,
  authForm,
  setAuthForm,
  selectedItems,
  itemSearch,
  setItemSearch,
  searchResults,
  searchLoading,
  onSearchItems,
  onToggleItem,
  onRemoveItem,
  onSave,
  saving,
  editing,
  requireAuth,
}: {
  authorizations: PurchasingAuth[];
  showForm: boolean;
  onShowForm: () => void;
  onHideForm: () => void;
  onEdit: (auth: PurchasingAuth) => void;
  onDelete: (id: string) => void;
  authForm: { user_id: string; venue_id: string; authorized_item_ids: string[]; notes: string };
  setAuthForm: (form: any) => void;
  selectedItems: Map<string, string>;
  itemSearch: string;
  setItemSearch: (s: string) => void;
  searchResults: any[];
  searchLoading: boolean;
  onSearchItems: (q: string) => void;
  onToggleItem: (id: string, name: string) => void;
  onRemoveItem: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
  requireAuth: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={`p-4 rounded-lg border ${requireAuth ? 'border-accent/30 bg-accent/5' : 'border-border bg-muted/30'}`}>
        <p className="text-sm">
          {requireAuth ? (
            <span className="font-medium text-accent">Purchasing authorization is ACTIVE. Users must have authorization to create POs.</span>
          ) : (
            <span className="text-muted-foreground">Purchasing authorization is not active. Enable it in the Thresholds tab to enforce item-level purchasing permissions.</span>
          )}
        </p>
      </div>

      {/* Auth list */}
      {!showForm && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">
              Authorized Purchasers ({authorizations.length})
            </h3>
            <button className="btn btn-primary flex items-center gap-2" onClick={onShowForm}>
              <Plus className="w-4 h-4" /> Add Authorization
            </button>
          </div>

          {authorizations.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No purchasing authorizations configured yet.
            </p>
          ) : (
            <div className="space-y-3">
              {authorizations.map(auth => (
                <div key={auth.id} className="card p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{auth.user_email || auth.user_id.substring(0, 8)}</span>
                      {auth.venue_name && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">{auth.venue_name}</span>
                      )}
                      {!auth.venue_id && (
                        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded">All venues</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {auth.authorized_item_ids.length} authorized items
                      {auth.notes && ` — ${auth.notes}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onEdit(auth)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm text-destructive"
                      onClick={() => onDelete(auth.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Auth form */}
      {showForm && (
        <div className="card p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">
              {editing ? 'Edit Authorization' : 'New Purchasing Authorization'}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={onHideForm}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User ID (for now, text input — would be a user search in production) */}
          <div>
            <label className="block text-sm font-medium mb-1">User ID</label>
            <input
              type="text"
              className="input w-full"
              placeholder="User UUID"
              value={authForm.user_id}
              onChange={e => setAuthForm({ ...authForm, user_id: e.target.value })}
              disabled={editing}
            />
            <p className="text-xs text-muted-foreground mt-1">The user who will be authorized to purchase</p>
          </div>

          {/* Venue (optional) */}
          <div>
            <label className="block text-sm font-medium mb-1">Venue (optional)</label>
            <input
              type="text"
              className="input w-full"
              placeholder="Leave blank for all venues, or enter venue UUID"
              value={authForm.venue_id}
              onChange={e => setAuthForm({ ...authForm, venue_id: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">Restrict to a specific venue, or leave blank for org-wide</p>
          </div>

          {/* Item selector */}
          <div>
            <label className="block text-sm font-medium mb-1">Authorized Items</label>

            {/* Selected items */}
            {selectedItems.size > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {Array.from(selectedItems.entries()).map(([id, name]) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 bg-accent/10 text-accent text-sm px-2 py-1 rounded"
                  >
                    {name}
                    <button onClick={() => onRemoveItem(id)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                className="input w-full pl-10"
                placeholder="Search items by name..."
                value={itemSearch}
                onChange={e => {
                  setItemSearch(e.target.value);
                  onSearchItems(e.target.value);
                }}
              />
            </div>

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="mt-2 border border-border rounded-lg max-h-48 overflow-y-auto">
                {searchResults.map((item: any) => {
                  const isSelected = authForm.authorized_item_ids.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between ${
                        isSelected ? 'bg-accent/5' : ''
                      }`}
                      onClick={() => onToggleItem(item.id, item.name)}
                    >
                      <span>
                        {item.name}
                        {item.category && (
                          <span className="text-xs text-muted-foreground ml-2">{item.category}</span>
                        )}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-accent" />}
                    </button>
                  );
                })}
              </div>
            )}

            {searchLoading && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching...
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-1">
              {authForm.authorized_item_ids.length} items selected
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input
              type="text"
              className="input w-full"
              placeholder='e.g., "Bar manager — glasses & barware only"'
              value={authForm.notes}
              onChange={e => setAuthForm({ ...authForm, notes: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={onHideForm}>Cancel</button>
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={onSave}
              disabled={saving || !authForm.user_id || authForm.authorized_item_ids.length === 0}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editing ? 'Update' : 'Create'} Authorization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
