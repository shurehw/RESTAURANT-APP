'use client';

import { Users, Settings, UserCircle, Building2 } from 'lucide-react';
import { NotificationsDropdown } from './NotificationsDropdown';

interface TopbarActionsProps {
  venues: Array<{ id: string; name: string }>;
}

export function TopbarActions({ venues }: TopbarActionsProps) {
  const showVenueSelector = venues.length > 1;

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

  return (
    <div className="flex items-center gap-3">
      {/* Venue Selector (only if multiple venues) */}
      {showVenueSelector && (
        <div className="flex items-center gap-2 px-3 py-1.5 border border-opsos-sage-300 rounded-md bg-white hover:bg-opsos-sage-50 transition-colors">
          <Building2 className="w-4 h-4 text-opsos-sage-600" />
          <select
            className="text-sm bg-transparent border-none focus:outline-none text-opsos-sage-800 cursor-pointer"
            onChange={(e) => {
              // TODO: Update selected venue in context/state
              console.log('Selected venue:', e.target.value);
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
    </div>
  );
}
