'use client';

import { Users, Settings, UserCircle, Building2, LogOut } from 'lucide-react';
import { NotificationsDropdown } from './NotificationsDropdown';
import { VendorOnboardingLinkDisplay } from './VendorOnboardingLinkDisplay';
import { createClient } from '@/lib/supabase/client';
import { useVenue } from '@/components/providers/VenueProvider';
import { useEffect } from 'react';

interface TopbarActionsProps {
  venues: Array<{ id: string; name: string; location?: string | null; city?: string | null; state?: string | null }>;
  organizationSlug?: string;
  organizationName?: string;
}

export function TopbarActions({ venues, organizationSlug, organizationName }: TopbarActionsProps) {
  const showVenueSelector = venues.length > 1;
  const { selectedVenue, setSelectedVenue, setVenues } = useVenue();

  // Initialize venues in context
  useEffect(() => {
    setVenues(venues);
  }, [venues, setVenues]);

  // Set initial venue if not already set
  useEffect(() => {
    if (!selectedVenue && venues.length > 0) {
      const savedVenueId = localStorage.getItem('selectedVenueId');
      const initialVenue = savedVenueId
        ? venues.find(v => v.id === savedVenueId) || venues[0]
        : venues[0];
      setSelectedVenue(initialVenue);
    }
  }, [selectedVenue, venues, setSelectedVenue]);

  const handleTeamSettings = () => {
    // TODO: Navigate to team settings page
    console.log('Team settings clicked');
  };

  const handleUserSettings = () => {
    window.location.href = '/settings/organization';
  };

  const handleProfile = () => {
    // TODO: Navigate to profile page or show dropdown
    console.log('Profile clicked');
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="flex items-center gap-3">
      {/* Vendor Onboarding Link */}
      {organizationSlug && organizationName && (
        <VendorOnboardingLinkDisplay
          organizationSlug={organizationSlug}
          organizationName={organizationName}
        />
      )}

      {/* Venue Selector (only if multiple venues) */}
      {showVenueSelector && (
        <div className="flex items-center gap-2 px-3 py-1.5 border border-opsos-sage-300 rounded-md bg-white hover:bg-opsos-sage-50 transition-colors">
          <Building2 className="w-4 h-4 text-opsos-sage-600" />
          <select
            className="text-sm bg-transparent border-none focus:outline-none text-opsos-sage-800 cursor-pointer"
            value={selectedVenue?.id || ''}
            onChange={(e) => {
              const venue = venues.find(v => v.id === e.target.value);
              if (venue) {
                setSelectedVenue(venue);
                console.log('Selected venue:', venue.name);
              }
            }}
          >
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Team Settings */}
      <button
        onClick={handleTeamSettings}
        className="p-2 text-opsos-sage-600 hover:text-opsos-sage-800 hover:bg-opsos-sage-50 rounded-md transition-colors"
        title="Team Settings"
      >
        <Users className="w-5 h-5" />
      </button>

      {/* User Settings */}
      <button
        onClick={handleUserSettings}
        className="p-2 text-opsos-sage-600 hover:text-opsos-sage-800 hover:bg-opsos-sage-50 rounded-md transition-colors"
        title="User Settings"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Notifications */}
      <NotificationsDropdown />

      {/* User Profile */}
      <button
        onClick={handleProfile}
        className="p-2 text-opsos-sage-600 hover:text-opsos-sage-800 hover:bg-opsos-sage-50 rounded-md transition-colors"
        title="Profile"
      >
        <UserCircle className="w-5 h-5" />
      </button>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="p-2 text-opsos-sage-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
        title="Logout"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  );
}
