'use client';

import { useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { NotificationsDropdown } from './NotificationsDropdown';
import { CommandTrigger } from '@/components/chatbot/FloatingChatWidget';
import { useVenue } from '@/components/providers/VenueProvider';
import { useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TopbarActionsProps {
  venues: Array<{ id: string; name: string; location?: string | null; city?: string | null; state?: string | null }>;
  organizationSlug?: string;
  organizationName?: string;
}

export function TopbarActions({ venues, organizationName }: TopbarActionsProps) {
  const showVenueSelector = venues.length > 1;
  const { selectedVenue, setSelectedVenue, setVenues } = useVenue();
  const [venueOpen, setVenueOpen] = useState(false);

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

  const allVenueOption = {
    id: 'all',
    name: organizationName || 'All Venues',
    location: null,
    city: null,
    state: null,
  };

  return (
    <div className="flex items-center gap-3">
      {/* Venue Selector (multi-venue) or Venue Label (single-venue) */}
      {showVenueSelector ? (
        <Popover open={venueOpen} onOpenChange={setVenueOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 border border-keva-sage-300 rounded-md bg-white hover:bg-keva-sage-50 transition-colors text-sm text-keva-sage-800"
            >
              <Building2 className="w-4 h-4 text-keva-sage-600" />
              <span>{selectedVenue?.name || 'Select venue'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-keva-sage-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-1" align="start">
            <div className="flex flex-col">
              {/* All Venues option */}
              <button
                onClick={() => { setSelectedVenue(allVenueOption); setVenueOpen(false); }}
                className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                  selectedVenue?.id === 'all'
                    ? 'bg-brass/10 text-brass font-medium'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <span>{organizationName || 'All Venues'}</span>
                {selectedVenue?.id === 'all' && <Check className="h-4 w-4 text-brass" />}
              </button>
              <div className="h-px bg-border my-1" />
              {venues.map((venue) => (
                <button
                  key={venue.id}
                  onClick={() => { setSelectedVenue(venue); setVenueOpen(false); }}
                  className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                    venue.id === selectedVenue?.id
                      ? 'bg-brass/10 text-brass font-medium'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <span>{venue.name}</span>
                  {venue.id === selectedVenue?.id && <Check className="h-4 w-4 text-brass" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : venues.length === 1 ? (
        <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-keva-sage-700 font-medium">
          <Building2 className="w-4 h-4 text-keva-sage-500" />
          {venues[0].name}
        </div>
      ) : null}

      {/* Command Panel Trigger */}
      <CommandTrigger />

      {/* Notifications */}
      <NotificationsDropdown />
    </div>
  );
}
