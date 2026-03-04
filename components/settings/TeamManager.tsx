'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Users,
  UserPlus,
  Trash2,
  Pencil,
  Mail,
  RotateCw,
  Clock,
  X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  venue_ids: string[] | null;
  is_active: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  venue_ids: string[] | null;
  inviter_name: string | null;
  expires_at: string;
  created_at: string;
}

interface OrgVenue {
  id: string;
  name: string;
}

// ── Role Config ──────────────────────────────────────────────────

const ROLES = [
  { value: 'owner', label: 'Owner', description: 'Full access — strategic oversight and control' },
  { value: 'director', label: 'Director', description: 'Full access — strategic oversight across operations' },
  { value: 'gm', label: 'General Manager', description: 'Full operational access, limited admin settings' },
  { value: 'agm', label: 'Assistant GM', description: 'Operations focus, most access except financial admin' },
  { value: 'manager', label: 'Manager', description: 'Day-to-day operations, no deep admin access' },
  { value: 'exec_chef', label: 'Executive Chef', description: 'Kitchen + procurement, plus operational visibility' },
  { value: 'sous_chef', label: 'Sous Chef', description: 'Kitchen operations, limited visibility' },
  { value: 'readonly', label: 'Read Only', description: 'Read-only access to all operational data' },
  { value: 'pwa', label: 'PWA Only', description: 'Pulse PWA access only — live sales monitoring' },
] as const;

const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

function getRoleLabel(role: string): string {
  return ROLE_MAP[role] || role;
}

// ── Component ────────────────────────────────────────────────────

export default function TeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [venues, setVenues] = useState<OrgVenue[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch('/api/settings/team/members'),
        fetch('/api/settings/team/invites'),
      ]);
      const membersData = await membersRes.json();
      const invitesData = await invitesRes.json();

      if (membersData.success) {
        setMembers(membersData.members.filter((m: TeamMember) => m.is_active));
        setVenues(membersData.venues);
      }
      if (invitesData.success) {
        setInvites(invitesData.invites);
      }
    } catch (err) {
      console.error('Failed to load team data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Member Actions ─────────────────────────────────────────────

  const handleToggleActive = async (member: TeamMember) => {
    try {
      const res = await fetch(`/api/settings/team/members/${member.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === member.user_id ? { ...m, is_active: !m.is_active } : m
          )
        );
      } else {
        alert(data.message || 'Failed to update member');
      }
    } catch {
      alert('Error updating member');
    }
  };

  const handleDeactivate = async (member: TeamMember) => {
    if (!confirm(`Deactivate ${member.full_name || member.email}?`)) return;
    try {
      const res = await fetch(`/api/settings/team/members/${member.user_id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMembers((prev) =>
          prev.filter((m) => m.user_id !== member.user_id)
        );
      }
    } catch {
      alert('Error deactivating member');
    }
  };

  const handleEditSave = async (userId: string, updates: { role: string; venue_ids: string[] | null }) => {
    try {
      const res = await fetch(`/api/settings/team/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === userId ? { ...m, ...updates } : m
          )
        );
        setEditDialogOpen(false);
      } else {
        alert(data.message || 'Failed to update member');
      }
    } catch {
      alert('Error updating member');
    }
  };

  // ── Invite Actions ─────────────────────────────────────────────

  const handleInviteSent = (invite: PendingInvite) => {
    setInvites((prev) => [invite, ...prev]);
    setInviteDialogOpen(false);
  };

  const handleResend = async (invite: PendingInvite) => {
    try {
      const res = await fetch(`/api/settings/team/invites/${invite.id}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        alert('Invitation resent');
      }
    } catch {
      alert('Error resending invite');
    }
  };

  const handleRevoke = async (invite: PendingInvite) => {
    if (!confirm(`Revoke invitation for ${invite.email}?`)) return;
    try {
      const res = await fetch(`/api/settings/team/invites/${invite.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      }
    } catch {
      alert('Error revoking invite');
    }
  };

  // ── Venue Badges ───────────────────────────────────────────────

  const getVenueBadges = (venueIds: string[] | null) => {
    if (!venueIds || venueIds.length === 0) {
      return <Badge variant="sage">All Venues</Badge>;
    }
    if (venueIds.length <= 2) {
      return venueIds.map((vid) => {
        const venue = venues.find((v) => v.id === vid);
        return (
          <Badge key={vid} variant="brass" className="mr-1">
            {venue?.name || 'Unknown'}
          </Badge>
        );
      });
    }
    return <Badge variant="brass">{venueIds.length} Venues</Badge>;
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Members Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-opsos-sage-600" />
            <div>
              <h2 className="text-xl font-semibold">Team Members</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Manage roles and venue access for your team
              </p>
            </div>
          </div>
          <Button
            onClick={() => setInviteDialogOpen(true)}
            size="sm"
            className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
          >
            <UserPlus className="w-4 h-4 mr-1" />
            Invite Member
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading team...</p>
        ) : members.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No team members yet.</p>
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Venues</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Active</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.user_id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {member.full_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{member.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{getRoleLabel(member.role)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {getVenueBadges(member.venue_ids)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(member)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          member.is_active ? 'bg-opsos-sage-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            member.is_active ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingMember(member);
                          setEditDialogOpen(true);
                        }}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(member)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-5 h-5 text-opsos-sage-600" />
            <h3 className="text-lg font-semibold">Pending Invitations</h3>
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Sent</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Expires</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{invite.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{getRoleLabel(invite.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(invite.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(invite)}
                        className="text-gray-500 hover:text-gray-700"
                        title="Resend invitation"
                      >
                        <RotateCw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(invite)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Revoke invitation"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Invite Dialog */}
      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        venues={venues}
        onInviteSent={handleInviteSent}
      />

      {/* Edit Dialog */}
      {editingMember && (
        <EditMemberDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingMember(null);
          }}
          member={editingMember}
          venues={venues}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}

// ── Invite Member Dialog ─────────────────────────────────────────

function InviteMemberDialog({
  open,
  onOpenChange,
  venues,
  onInviteSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venues: OrgVenue[];
  onInviteSent: (invite: PendingInvite) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('manager');
  const [allVenues, setAllVenues] = useState(true);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedRole = ROLES.find((r) => r.value === role);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/settings/team/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          role,
          venue_ids: allVenues ? null : selectedVenueIds,
        }),
      });
      const data = await res.json();

      if (data.success) {
        onInviteSent(data.invite);
        // Reset form
        setEmail('');
        setRole('manager');
        setAllVenues(true);
        setSelectedVenueIds([]);
      } else {
        setError(data.message || 'Failed to send invitation');
      }
    } catch {
      setError('Error sending invitation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email Address
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoFocus
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Role
            </label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole && (
              <p className="text-xs text-gray-500 mt-1">{selectedRole.description}</p>
            )}
          </div>

          {/* Venue Assignment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Venue Access
            </label>
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                id="all-venues-invite"
                checked={allVenues}
                onCheckedChange={(checked) => {
                  setAllVenues(!!checked);
                  if (checked) setSelectedVenueIds([]);
                }}
              />
              <label htmlFor="all-venues-invite" className="text-sm">
                All Venues
              </label>
            </div>
            {!allVenues && venues.length > 0 && (
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {venues.map((venue) => (
                  <div key={venue.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`venue-invite-${venue.id}`}
                      checked={selectedVenueIds.includes(venue.id)}
                      onCheckedChange={(checked) => {
                        setSelectedVenueIds((prev) =>
                          checked
                            ? [...prev, venue.id]
                            : prev.filter((id) => id !== venue.id)
                        );
                      }}
                    />
                    <label htmlFor={`venue-invite-${venue.id}`} className="text-sm">
                      {venue.name}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!email.trim() || saving}
            className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
          >
            {saving ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Member Dialog ───────────────────────────────────────────

function EditMemberDialog({
  open,
  onOpenChange,
  member,
  venues,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember;
  venues: OrgVenue[];
  onSave: (userId: string, updates: { role: string; venue_ids: string[] | null }) => void;
}) {
  const [role, setRole] = useState(member.role);
  const [allVenues, setAllVenues] = useState(!member.venue_ids || member.venue_ids.length === 0);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>(member.venue_ids || []);

  const selectedRole = ROLES.find((r) => r.value === role);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Team Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Member Info (read-only) */}
          <div className="bg-gray-50 rounded-md p-3">
            <p className="font-medium text-gray-900">{member.full_name || '—'}</p>
            <p className="text-sm text-gray-600">{member.email}</p>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Role
            </label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole && (
              <p className="text-xs text-gray-500 mt-1">{selectedRole.description}</p>
            )}
          </div>

          {/* Venue Assignment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Venue Access
            </label>
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                id="all-venues-edit"
                checked={allVenues}
                onCheckedChange={(checked) => {
                  setAllVenues(!!checked);
                  if (checked) setSelectedVenueIds([]);
                }}
              />
              <label htmlFor="all-venues-edit" className="text-sm">
                All Venues
              </label>
            </div>
            {!allVenues && venues.length > 0 && (
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {venues.map((venue) => (
                  <div key={venue.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`venue-edit-${venue.id}`}
                      checked={selectedVenueIds.includes(venue.id)}
                      onCheckedChange={(checked) => {
                        setSelectedVenueIds((prev) =>
                          checked
                            ? [...prev, venue.id]
                            : prev.filter((id) => id !== venue.id)
                        );
                      }}
                    />
                    <label htmlFor={`venue-edit-${venue.id}`} className="text-sm">
                      {venue.name}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave(member.user_id, {
                role,
                venue_ids: allVenues ? null : selectedVenueIds,
              })
            }
            className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
