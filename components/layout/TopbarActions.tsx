'use client';

import { Building2 } from 'lucide-react';
import { NotificationsDropdown } from './NotificationsDropdown';
import { IntegrationStatus } from './IntegrationStatus';
import { CommandTrigger } from '@/components/chatbot/FloatingChatWidget';
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

  return (
    <div className="flex items-center gap-3">
      {/* Venue Selector (only if multiple venues) */}
      {showVenueSelector && (
        <div className="flex items-center gap-2 px-3 py-1.5 border border-opsos-sage-300 rounded-md bg-white hover:bg-opsos-sage-50 transition-colors">
          <Building2 className="w-4 h-4 text-opsos-sage-600" />
          <select
            aria-label="Select venue"
            className="text-sm bg-transparent border-none focus:outline-none text-opsos-sage-800 cursor-pointer"
            value={selectedVenue?.id || ''}
            onChange={(e) => {
              if (e.target.value === 'all') {
                setSelectedVenue({
                  id: 'all',
                  name: 'The h.wood Group',
                  location: null,
                  city: null,
                  state: null,
                });
              } else {
                const venue = venues.find(v => v.id === e.target.value);
                if (venue) {
                  setSelectedVenue(venue);
                }
              }
            }}
          >
            <option value="all">The h.wood Group (All Venues)</option>
            <option disabled>──────────</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Command Panel Trigger */}
      <CommandTrigger />

      {/* Integration Status */}
      <IntegrationStatus />

      {/* Notifications */}
      <NotificationsDropdown />
    </div>
  );
}
