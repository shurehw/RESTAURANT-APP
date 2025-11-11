'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

interface ForecastFiltersProps {
  venues: Array<{ id: string; name: string }>;
  selectedVenue: string;
  daysAhead: number;
}

export function ForecastFilters({ venues, selectedVenue, daysAhead }: ForecastFiltersProps) {
  return (
    <div className="flex gap-4 mb-6">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Venue:</label>
        <select
          className="px-3 py-2 border rounded-md"
          value={selectedVenue}
          onChange={(e) => {
            window.location.href = `/sales/forecasts?venue=${e.target.value}&days=${daysAhead}`;
          }}
        >
          {venues?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Days Ahead:</label>
        <select
          className="px-3 py-2 border rounded-md"
          value={daysAhead}
          onChange={(e) => {
            window.location.href = `/sales/forecasts?venue=${selectedVenue}&days=${e.target.value}`;
          }}
        >
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </select>
      </div>

      <Button variant="brass" className="ml-auto">
        <Calendar className="w-4 h-4 mr-2" />
        Generate New Forecasts
      </Button>
    </div>
  );
}
