'use client';

/**
 * Schedule Booking Modal
 * Form for creating entertainment bookings for specific dates
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Artist {
  id?: string;
  name: string;
  entertainment_type: string;
}

interface ScheduleBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId?: string;
  venueName?: string;
  artists?: Artist[];
  onSuccess?: () => void;
}

const ENTERTAINMENT_TYPES = ['Band', 'Dancers', 'DJ', 'AV'] as const;

export function ScheduleBookingModal({
  open,
  onOpenChange,
  venueId,
  venueName,
  artists = [],
  onSuccess,
}: ScheduleBookingModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    booking_date: '',
    entertainment_type: '' as typeof ENTERTAINMENT_TYPES[number] | '',
    artist_name: '',
    time_start: '19:00',
    time_end: '21:00',
    config: '',
    rate_amount: '',
    notes: '',
    status: 'confirmed' as 'confirmed' | 'tentative' | 'cancelled',
  });

  // Filter artists by selected type
  const filteredArtists = artists.filter(
    (a) => !formData.entertainment_type || a.entertainment_type === formData.entertainment_type
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.booking_date || !formData.entertainment_type) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/entertainment/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          venue_id: venueId,
          rate_amount: formData.rate_amount ? parseFloat(formData.rate_amount) : null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create booking');
      }

      toast.success('Booking created successfully');
      setFormData({
        booking_date: '',
        entertainment_type: '',
        artist_name: '',
        time_start: '19:00',
        time_end: '21:00',
        config: '',
        rate_amount: '',
        notes: '',
        status: 'confirmed',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Booking</DialogTitle>
          <DialogDescription>
            Create a new entertainment booking for {venueName || 'your venue'}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.booking_date}
                onChange={(e) => setFormData({ ...formData, booking_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select
                value={formData.entertainment_type}
                onValueChange={(value) => setFormData({ ...formData, entertainment_type: value as any, artist_name: '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {ENTERTAINMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="artist">Performer</Label>
            <Select
              value={formData.artist_name}
              onValueChange={(value) => setFormData({ ...formData, artist_name: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select performer (optional)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">TBD / Open</SelectItem>
                {filteredArtists.map((artist) => (
                  <SelectItem key={artist.name} value={artist.name}>
                    {artist.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Start Time</Label>
              <Input
                id="start"
                type="time"
                value={formData.time_start}
                onChange={(e) => setFormData({ ...formData, time_start: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end">End Time</Label>
              <Input
                id="end"
                type="time"
                value={formData.time_end}
                onChange={(e) => setFormData({ ...formData, time_end: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="config">Configuration</Label>
              <Input
                id="config"
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
                placeholder="e.g., DUO, 4 PIECE, 2 DANCERS"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate">Rate ($)</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                value={formData.rate_amount}
                onChange={(e) => setFormData({ ...formData, rate_amount: e.target.value })}
                placeholder="e.g., 350"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="tentative">Tentative</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any special instructions or notes..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brass" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
