'use client';

import { LaborEfficiencyDashboard } from '@/components/labor/LaborEfficiencyDashboard';
import { Card, CardContent } from '@/components/ui/card';
import { useVenue } from '@/components/providers/VenueProvider';

export default function LaborEfficiencyPage() {
  const { selectedVenue } = useVenue();

  if (!selectedVenue || selectedVenue.id === 'all') {
    return (
      <div>
        <div className="mb-8">
          <h1 className="page-header">Labor Efficiency</h1>
          <p className="text-muted-foreground">
            Track covers per labor hour (CPLH) and optimize staffing efficiency
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Select a venue to view labor efficiency data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-header">Labor Efficiency</h1>
        <p className="text-muted-foreground">
          Track covers per labor hour (CPLH) and optimize staffing efficiency
        </p>
      </div>

      <LaborEfficiencyDashboard venueId={selectedVenue.id} />
    </div>
  );
}
