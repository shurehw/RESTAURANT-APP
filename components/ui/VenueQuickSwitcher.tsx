'use client';

/**
 * Venue Quick Switcher Component
 * Dropdown selector for multi-venue users to navigate between venues
 * Syncs with global venue context so topbar stays in sync
 */

import { useVenue } from '@/components/providers/VenueProvider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface VenueQuickSwitcherProps {
  className?: string;
}

export function VenueQuickSwitcher({ className = '' }: VenueQuickSwitcherProps) {
  const { selectedVenue, setSelectedVenue, venues, isAllVenues } = useVenue();

  // Only show for multi-venue users
  if (venues.length <= 1) {
    return null;
  }

  const currentValue = isAllVenues ? 'all' : (selectedVenue?.id || '');

  const handleChange = (value: string) => {
    if (value === 'all') {
      setSelectedVenue({ id: 'all', name: 'All Venues' });
    } else {
      const venue = venues.find(v => v.id === value);
      if (venue) setSelectedVenue(venue);
    }
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className={`w-[200px] h-9 text-sm ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Venues</SelectItem>
        {venues.map((venue) => (
          <SelectItem key={venue.id} value={venue.id}>
            {venue.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
