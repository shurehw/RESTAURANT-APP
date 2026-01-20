'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface Venue {
  id: string;
  name: string;
  location?: string | null;
  city?: string | null;
  state?: string | null;
}

interface VenueContextType {
  selectedVenue: Venue | null;
  setSelectedVenue: (venue: Venue | null) => void;
  venues: Venue[];
  setVenues: (venues: Venue[]) => void;
  isHydrated: boolean;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

export function VenueProvider({
  children,
  initialVenue = null,
  initialVenues = []
}: {
  children: React.ReactNode;
  initialVenue?: Venue | null;
  initialVenues?: Venue[];
}) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(initialVenue);
  const [venues, setVenues] = useState<Venue[]>(initialVenues);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore from localStorage on mount (before hydration completes)
  useEffect(() => {
    const savedVenueId = localStorage.getItem('selectedVenueId');
    if (savedVenueId && initialVenues.length > 0) {
      const savedVenue = initialVenues.find(v => v.id === savedVenueId);
      if (savedVenue) {
        setSelectedVenue(savedVenue);
      }
    }
    setIsHydrated(true);
  }, [initialVenues]);

  // Persist to localStorage
  useEffect(() => {
    if (selectedVenue && isHydrated) {
      localStorage.setItem('selectedVenueId', selectedVenue.id);
    }
  }, [selectedVenue, isHydrated]);

  return (
    <VenueContext.Provider value={{ selectedVenue, setSelectedVenue, venues, setVenues, isHydrated }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const context = useContext(VenueContext);
  if (context === undefined) {
    throw new Error('useVenue must be used within a VenueProvider');
  }
  return context;
}
