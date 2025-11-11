/**
 * Unified Admin Panel
 * Organizations, Venues, and Users management in one place
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, MapPin, UserPlus, Plus, Trash, Database, Mail, ChevronDown, ChevronUp, Users, Edit } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  legal_name?: string;
  plan: string;
  subscription_status: string;
  created_at: string;
  has_custom_db?: boolean;
  primary_contact_email?: string;
  primary_contact_name?: string;
  max_venues: number;
}

interface Venue {
  id: string;
  name: string;
  location?: string;
  address?: string;
  city?: string;
  state?: string;
  organization_id?: string;
  organization?: { id: string; name: string };
  is_active: boolean;
}

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('venues');

  // Organizations state
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [orgForm, setOrgForm] = useState({
    name: '',
    legal_name: '',
    owner_email: '',
    owner_name: '',
    plan: 'trial',
    max_venues: 1,
  });

  // Venues state
  const [venues, setVenues] = useState<Venue[]>([]);
  const [showVenueForm, setShowVenueForm] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('all');
  const [venueForm, setVenueForm] = useState({
    name: '',
    location: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    phone: '',
    organization_id: '',
  });

  // Users state
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [orgsRes, venuesRes] = await Promise.all([
        fetch('/api/admin/organizations'),
        fetch('/api/admin/venues'),
      ]);

      const orgsData = await orgsRes.json();
      const venuesData = await venuesRes.json();

      setOrganizations(orgsData.organizations || []);
      setVenues(venuesData.venues || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Organization handlers
  const handleCreateOrg = async () => {
    try {
      const url = editingOrg ? `/api/admin/organizations/${editingOrg.id}` : '/api/admin/organizations';
      const method = editingOrg ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orgForm),
      });

      if (response.ok) {
        alert(editingOrg ? 'Organization updated!' : 'Organization created!');
        setShowOrgForm(false);
        setEditingOrg(null);
        setOrgForm({ name: '', legal_name: '', owner_email: '', owner_name: '', plan: 'trial', max_venues: 1 });
        fetchAll();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to save organization');
    }
  };

  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org);
    setOrgForm({
      name: org.name,
      legal_name: org.legal_name || '',
      owner_email: org.primary_contact_email || '',
      owner_name: org.primary_contact_name || '',
      plan: org.plan,
      max_venues: org.max_venues,
    });
    setShowOrgForm(true);
  };

  // Venue handlers
  const handleCreateVenue = async () => {
    try {
      const url = editingVenue ? `/api/admin/venues/${editingVenue.id}` : '/api/admin/venues';
      const method = editingVenue ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(venueForm),
      });

      if (response.ok) {
        alert(editingVenue ? 'Venue updated!' : 'Venue created!');
        setShowVenueForm(false);
        setEditingVenue(null);
        setVenueForm({ name: '', location: '', address: '', city: '', state: '', zip_code: '', phone: '', organization_id: '' });
        fetchAll();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to save venue');
    }
  };

  const handleEditVenue = (venue: Venue) => {
    setEditingVenue(venue);
    setVenueForm({
      name: venue.name,
      location: venue.location || '',
      address: venue.address || '',
      city: venue.city || '',
      state: venue.state || '',
      zip_code: '',
      phone: '',
      organization_id: venue.organization_id || '',
    });
    setShowVenueForm(true);
  };

  const handleDeleteVenue = async (venueId: string) => {
    if (!confirm('Delete this venue?')) return;

    try {
      const response = await fetch(`/api/admin/venues/${venueId}`, { method: 'DELETE' });
      if (response.ok) {
        alert('Venue deleted!');
        fetchAll();
      }
    } catch (error) {
      alert('Failed to delete venue');
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  const filteredVenues = selectedOrgFilter === 'all'
    ? venues
    : selectedOrgFilter === 'none'
    ? venues.filter(v => !v.organization_id)
    : venues.filter(v => v.organization_id === selectedOrgFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">System Administration</h1>
        <p className="text-sm text-gray-500 mt-1">Manage organizations, venues, and users</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="venues">Venues</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        {/* ORGANIZATIONS TAB */}
        <TabsContent value="organizations" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowOrgForm(!showOrgForm)} className="bg-brass hover:bg-brass/90">
              <Plus className="w-4 h-4 mr-2" />
              New Organization
            </Button>
          </div>

          {showOrgForm && (
            <Card>
              <CardHeader><CardTitle>{editingOrg ? 'Edit Organization' : 'Create Organization'}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Organization Name *</label>
                    <input
                      type="text"
                      value={orgForm.name}
                      onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                      placeholder="H.Wood Group"
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Legal Name</label>
                    <input
                      type="text"
                      value={orgForm.legal_name}
                      onChange={(e) => setOrgForm({ ...orgForm, legal_name: e.target.value })}
                      placeholder="H.Wood Group LLC"
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Plan</label>
                    <select
                      value={orgForm.plan}
                      onChange={(e) => setOrgForm({ ...orgForm, plan: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="trial">Trial</option>
                      <option value="starter">Starter</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max Venues</label>
                    <input
                      type="number"
                      value={orgForm.max_venues}
                      onChange={(e) => setOrgForm({ ...orgForm, max_venues: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleCreateOrg} disabled={!orgForm.name} className="bg-brass hover:bg-brass/90">
                    {editingOrg ? 'Update Organization' : 'Create Organization'}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setShowOrgForm(false);
                    setEditingOrg(null);
                    setOrgForm({ name: '', legal_name: '', owner_email: '', owner_name: '', plan: 'trial', max_venues: 1 });
                  }}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {organizations.map((org) => (
              <Card key={org.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-opsos-sage-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-opsos-sage-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{org.name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>Plan: {org.plan}</span>
                          <span>Status: {org.subscription_status}</span>
                          <span>Max Venues: {org.max_venues}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {org.has_custom_db && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          Custom DB
                        </span>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleEditOrg(org)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* VENUES TAB */}
        <TabsContent value="venues" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={selectedOrgFilter} onValueChange={setSelectedOrgFilter}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filter by organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Venues</SelectItem>
                <SelectItem value="none">Standalone Venues</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setShowVenueForm(!showVenueForm)} className="bg-brass hover:bg-brass/90">
              <Plus className="w-4 h-4 mr-2" />
              New Venue
            </Button>
          </div>

          {showVenueForm && (
            <Card>
              <CardHeader><CardTitle>{editingVenue ? 'Edit Venue' : 'Create Venue'}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Organization (Optional)</label>
                  <Select value={venueForm.organization_id || 'none'} onValueChange={(value) => setVenueForm({ ...venueForm, organization_id: value === 'none' ? '' : value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Standalone venue (no organization)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None - Standalone</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Venue Name *</label>
                    <input
                      type="text"
                      value={venueForm.name}
                      onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                      placeholder="Delilah West Hollywood"
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Location</label>
                    <input
                      type="text"
                      value={venueForm.location}
                      onChange={(e) => setVenueForm({ ...venueForm, location: e.target.value })}
                      placeholder="West Hollywood"
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Address</label>
                  <input
                    type="text"
                    value={venueForm.address}
                    onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })}
                    placeholder="7969 Santa Monica Blvd"
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <input
                    type="text"
                    value={venueForm.city}
                    onChange={(e) => setVenueForm({ ...venueForm, city: e.target.value })}
                    placeholder="City"
                    className="px-3 py-2 border rounded-md"
                  />
                  <input
                    type="text"
                    value={venueForm.state}
                    onChange={(e) => setVenueForm({ ...venueForm, state: e.target.value })}
                    placeholder="State"
                    className="px-3 py-2 border rounded-md"
                  />
                  <input
                    type="text"
                    value={venueForm.phone}
                    onChange={(e) => setVenueForm({ ...venueForm, phone: e.target.value })}
                    placeholder="Phone"
                    className="px-3 py-2 border rounded-md"
                  />
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleCreateVenue} disabled={!venueForm.name} className="bg-brass hover:bg-brass/90">
                    {editingVenue ? 'Update Venue' : 'Create Venue'}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setShowVenueForm(false);
                    setEditingVenue(null);
                    setVenueForm({ name: '', location: '', address: '', city: '', state: '', zip_code: '', phone: '', organization_id: '' });
                  }}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {filteredVenues.map((venue) => (
              <Card key={venue.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-opsos-sage-100 rounded-lg flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-opsos-sage-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{venue.name}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          {venue.organization && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {venue.organization.name}
                            </span>
                          )}
                          {!venue.organization_id && (
                            <span className="text-amber-600 font-medium">Standalone</span>
                          )}
                          {venue.location && <span>• {venue.location}</span>}
                          {venue.city && <span>• {venue.city}, {venue.state}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditVenue(venue)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteVenue(venue.id)}>
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredVenues.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center text-gray-500">
                  No venues found. Click "New Venue" to create one.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* USERS TAB */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardContent className="p-12 text-center text-gray-500">
              User management coming soon...
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
