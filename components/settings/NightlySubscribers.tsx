'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mail, Plus, Trash2, UserPlus } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface Subscriber {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  venue_scope: 'all' | 'selected' | 'auto';
  venue_ids: string[] | null;
  is_active: boolean;
  created_at: string;
}

interface OrgUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  venue_ids: string[] | null;
}

// ── Component ────────────────────────────────────────────────────

export default function NightlySubscribers({
  briefingEnabled,
}: {
  briefingEnabled: boolean;
}) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedScope, setSelectedScope] = useState<'auto' | 'all'>('auto');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [subsRes, usersRes] = await Promise.all([
        fetch('/api/settings/nightly-subscribers'),
        fetch('/api/settings/org-users'),
      ]);
      const subsData = await subsRes.json();
      const usersData = await usersRes.json();

      if (subsData.success) setSubscribers(subsData.subscribers);
      if (usersData.success) setOrgUsers(usersData.users);
    } catch (err) {
      console.error('Failed to load subscriber data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const subscribedUserIds = new Set(subscribers.map((s) => s.user_id));
  const availableUsers = orgUsers.filter((u) => !subscribedUserIds.has(u.user_id));

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setSaving(true);

    try {
      const res = await fetch('/api/settings/nightly-subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUserId,
          venue_scope: selectedScope,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSubscribers((prev) => [...prev, data.subscriber]);
        setDialogOpen(false);
        setSelectedUserId('');
        setSelectedScope('auto');
      } else {
        alert(data.message || 'Failed to add subscriber');
      }
    } catch {
      alert('Error adding subscriber');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (sub: Subscriber) => {
    try {
      const res = await fetch(`/api/settings/nightly-subscribers/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sub.is_active }),
      });
      const data = await res.json();

      if (data.success) {
        setSubscribers((prev) =>
          prev.map((s) =>
            s.id === sub.id ? { ...s, is_active: !s.is_active } : s
          )
        );
      }
    } catch {
      alert('Error updating subscriber');
    }
  };

  const handleRemove = async (sub: Subscriber) => {
    if (!confirm(`Remove ${sub.email} from nightly reports?`)) return;

    try {
      const res = await fetch(`/api/settings/nightly-subscribers/${sub.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setSubscribers((prev) => prev.filter((s) => s.id !== sub.id));
      }
    } catch {
      alert('Error removing subscriber');
    }
  };

  const getScopeBadge = (sub: Subscriber) => {
    switch (sub.venue_scope) {
      case 'all':
        return <Badge variant="sage">All Venues</Badge>;
      case 'selected':
        return (
          <Badge variant="brass">
            {sub.venue_ids?.length || 0} Venue{(sub.venue_ids?.length || 0) !== 1 ? 's' : ''}
          </Badge>
        );
      case 'auto':
      default:
        return <Badge variant="outline">Auto</Badge>;
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6 text-keva-sage-600" />
          <div>
            <h2 className="text-xl font-semibold">Nightly Report Recipients</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Manage who receives the nightly report email
            </p>
          </div>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={!briefingEnabled || availableUsers.length === 0}
          size="sm"
          className="bg-keva-sage-600 hover:bg-keva-sage-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {!briefingEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-sm text-amber-800">
          Enable "Daily Forecast Briefing" above to activate nightly report emails.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading subscribers...</p>
      ) : subscribers.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No subscribers yet. Add team members to receive nightly reports.</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 font-medium text-gray-600">User</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Scope</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Active</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => {
                const user = orgUsers.find((u) => u.user_id === sub.user_id);
                return (
                  <tr key={sub.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {user?.full_name || sub.email}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{sub.email}</td>
                    <td className="px-4 py-3">{getScopeBadge(sub)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(sub)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          sub.is_active ? 'bg-keva-sage-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            sub.is_active ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(sub)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Subscriber Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Nightly Report Subscriber</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Team Member
              </label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name || user.email}{' '}
                      <span className="text-gray-400">({user.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Report Scope
              </label>
              <Select
                value={selectedScope}
                onValueChange={(v) => setSelectedScope(v as 'auto' | 'all')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto — based on user's venue access
                  </SelectItem>
                  <SelectItem value="all">
                    All Venues — consolidated report
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                "Auto" sends a consolidated report to org-level users and per-venue reports to venue-specific users.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!selectedUserId || saving}
              className="bg-keva-sage-600 hover:bg-keva-sage-700"
            >
              {saving ? 'Adding...' : 'Add Subscriber'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
