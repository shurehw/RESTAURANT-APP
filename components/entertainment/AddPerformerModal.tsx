'use client';

/**
 * Add Performer Modal
 * Form for adding new performers/artists to the entertainment roster
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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AddPerformerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId?: string;
  venueName?: string;
  onSuccess?: () => void;
}

const ENTERTAINMENT_TYPES = ['Band', 'Dancers', 'DJ', 'AV'] as const;

export function AddPerformerModal({
  open,
  onOpenChange,
  venueId,
  venueName,
  onSuccess,
}: AddPerformerModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    entertainment_type: '' as typeof ENTERTAINMENT_TYPES[number] | '',
    phone: '',
    email: '',
    standard_rate: '',
    is_coordinator: false,
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.entertainment_type) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/entertainment/performers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          standard_rate: formData.standard_rate ? parseFloat(formData.standard_rate) : null,
          venue_id: venueId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to add performer');
      }

      toast.success(`${formData.name} added successfully`);
      setFormData({
        name: '',
        entertainment_type: '',
        phone: '',
        email: '',
        standard_rate: '',
        is_coordinator: false,
        notes: '',
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Performer</DialogTitle>
          <DialogDescription>
            Add a new performer to {venueName || 'your venue'}'s entertainment roster.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., John Smith"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select
              value={formData.entertainment_type}
              onValueChange={(value) => setFormData({ ...formData, entertainment_type: value as any })}
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

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="e.g., 310-555-1234"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g., john@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="standard_rate">Standard Rate</Label>
            <Input
              id="standard_rate"
              type="number"
              min="0"
              step="0.01"
              value={formData.standard_rate}
              onChange={(e) => setFormData({ ...formData, standard_rate: e.target.value })}
              placeholder="e.g., 250.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g., Wednesday performer, prefers early slots"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="coordinator"
              checked={formData.is_coordinator}
              onCheckedChange={(checked) => setFormData({ ...formData, is_coordinator: !!checked })}
            />
            <Label htmlFor="coordinator" className="text-sm font-normal">
              This person is a coordinator for their category
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brass" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Performer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
