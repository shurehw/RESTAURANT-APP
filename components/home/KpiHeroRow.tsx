'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useVenue } from '@/components/providers/VenueProvider';
import { Users, DollarSign, CalendarCheck, TrendingUp } from 'lucide-react';

interface KpiData {
  business_date: string;
  covers_forecast: number | null;
  net_sales: number | null;
  covers_actual: number | null;
  reservations: number;
}

export function KpiHeroRow() {
  const { selectedVenue } = useVenue();
  const [data, setData] = useState<KpiData | null>(null);

  useEffect(() => {
    if (!selectedVenue || selectedVenue.id === 'all') {
      setData(null);
      return;
    }

    fetch(`/api/dashboard/kpi?venue_id=${selectedVenue.id}`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null));
  }, [selectedVenue]);

  if (!selectedVenue || selectedVenue.id === 'all' || !data) {
    return null;
  }

  const cards = [
    {
      label: 'Covers Forecast',
      value: data.covers_forecast != null ? data.covers_forecast.toLocaleString() : '—',
      icon: Users,
      color: 'text-keva-sage-600',
    },
    {
      label: 'Revenue Pace',
      value: data.net_sales != null ? `$${data.net_sales.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—',
      icon: DollarSign,
      color: 'text-brass',
    },
    {
      label: 'Covers Seated',
      value: data.covers_actual != null ? data.covers_actual.toLocaleString() : '—',
      icon: TrendingUp,
      color: 'text-keva-sage-600',
    },
    {
      label: 'Reservations',
      value: data.reservations.toLocaleString(),
      icon: CalendarCheck,
      color: 'text-brass',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-4">
          <div className="flex items-center gap-3">
            <card.icon className={`w-6 h-6 ${card.color}`} />
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</div>
              <div className="text-xl font-bold">{card.value}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
