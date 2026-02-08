'use client';

import { useState } from 'react';
import { LaborEfficiencyDashboard } from '@/components/labor/LaborEfficiencyDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download } from 'lucide-react';
import { format } from 'date-fns';

export default function LaborEfficiencyPage() {
  const [venueId, setVenueId] = useState(''); // In production, get from auth context
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  // In production, get venue_id from user context/auth
  // For now, we'll add a simple input
  const handleExport = () => {
    // TODO: Implement CSV export
    alert('Export functionality coming soon!');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Labor Efficiency</h1>
          <p className="text-muted-foreground mt-2">
            Track covers per labor hour (CPLH) and optimize staffing efficiency
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Data
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Customize your analysis period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Venue ID Input (temporary - replace with venue selector) */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Venue ID</label>
              <input
                type="text"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                placeholder="Enter venue ID"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            {/* Start Date */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard */}
      {venueId ? (
        <LaborEfficiencyDashboard
          venueId={venueId}
          startDate={startDate?.toISOString().split('T')[0]}
          endDate={endDate?.toISOString().split('T')[0]}
        />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="text-center">
              <p className="text-muted-foreground">
                Please enter a venue ID to view labor efficiency data
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
