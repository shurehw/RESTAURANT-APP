'use client';

/**
 * Venue Quick Switcher Component
 * Quick-switch buttons for multi-venue users to navigate between venues
 * Syncs with global venue context so topbar stays in sync
 */

import { Button } from '@/components/ui/button';
import { useVenue } from '@/components/providers/VenueProvider';

interface VenueQuickSwitcherProps {
  className?: string;
}

export function VenueQuickSwitcher({ className = '' }: VenueQuickSwitcherProps) {
  const { selectedVenue, setSelectedVenue, venues, isAllVenues } = useVenue();

  // Only show for multi-venue users
  if (venues.length <= 1) {
    return null;
  }

  const handleVenueSwitch = (venue: typeof selectedVenue) => {
    setSelectedVenue(venue);
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button
        variant={isAllVenues ? "default" : "outline"}
        size="sm"
        onClick={() => handleVenueSwitch({ id: 'all', name: 'All Venues' })}
        className={isAllVenues ? "bg-brass hover:bg-brass-dark text-white" : ""}
      >
        All Venues
      </Button>
      {venues.map((venue) => (
        <Button
          key={venue.id}
          variant={selectedVenue?.id === venue.id ? "default" : "outline"}
          size="sm"
          onClick={() => handleVenueSwitch(venue)}
          className={selectedVenue?.id === venue.id ? "bg-brass hover:bg-brass-dark text-white" : ""}
        >
          {venue.name}
        </Button>
      ))}
    </div>
  );
}
