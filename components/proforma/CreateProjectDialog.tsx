"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  organizationId,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    concept_type: "fsr",
    location_city: "",
    location_state: "",
    total_sqft: 0,
    foh_pct: 60,
    square_feet_foh: "",
    square_feet_boh: "",
    seats: "",
    seats_override: false,
    bar_seats: "",
  });

  // Calculate derived values
  const calculatedFohSqft = Math.round(formData.total_sqft * (formData.foh_pct / 100));
  const calculatedBohSqft = formData.total_sqft - calculatedFohSqft;
  const calculatedSeats = Math.round(calculatedFohSqft / 15); // 15 sqft per seat
  const displaySeats = formData.seats_override ? formData.seats : calculatedSeats;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          concept_type: formData.concept_type,
          location_city: formData.location_city || null,
          location_state: formData.location_state || null,
          org_id: organizationId,
          square_feet_foh: calculatedFohSqft || null,
          square_feet_boh: calculatedBohSqft || null,
          seats: displaySeats || null,
          bar_seats: formData.bar_seats ? parseInt(formData.bar_seats) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create project");
      }

      const { project } = await response.json();

      onOpenChange(false);
      router.push(`/proforma/${project.id}`);
      router.refresh();
    } catch (error) {
      console.error("Error creating project:", error);
      alert("Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Proforma Project</DialogTitle>
          <DialogDescription>
            Enter basic information about the concept you want to model
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Name */}
          <div>
            <Label htmlFor="name">Project Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. New Nightclub Downtown"
              required
            />
          </div>

          {/* Concept Type */}
          <div>
            <Label htmlFor="concept_type">Concept Type *</Label>
            <Select
              value={formData.concept_type}
              onValueChange={(value) =>
                setFormData({ ...formData, concept_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fsr">Full Service Restaurant</SelectItem>
                <SelectItem value="nightlife">Nightlife / Club</SelectItem>
                <SelectItem value="fast_casual">Fast Casual</SelectItem>
                <SelectItem value="coffee">Coffee Shop</SelectItem>
                <SelectItem value="bakery">Bakery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="location_city">City</Label>
              <Input
                id="location_city"
                value={formData.location_city}
                onChange={(e) =>
                  setFormData({ ...formData, location_city: e.target.value })
                }
                placeholder="Los Angeles"
              />
            </div>
            <div>
              <Label htmlFor="location_state">State</Label>
              <Input
                id="location_state"
                value={formData.location_state}
                onChange={(e) =>
                  setFormData({ ...formData, location_state: e.target.value })
                }
                placeholder="CA"
              />
            </div>
          </div>

          {/* Square Footage */}
          <div className="border-t border-zinc-800 pt-4 space-y-4">
            <h4 className="font-medium text-zinc-50">Space Planning</h4>

            <div>
              <Label htmlFor="total_sqft">Total Square Feet</Label>
              <Input
                id="total_sqft"
                type="number"
                min="0"
                value={formData.total_sqft || ""}
                onChange={(e) =>
                  setFormData({ ...formData, total_sqft: parseInt(e.target.value) || 0 })
                }
                placeholder="e.g., 4000"
              />
            </div>

            <div>
              <Label htmlFor="foh_pct">Front of House %</Label>
              <Input
                id="foh_pct"
                type="number"
                min="0"
                max="100"
                value={formData.foh_pct}
                onChange={(e) =>
                  setFormData({ ...formData, foh_pct: parseInt(e.target.value) || 60 })
                }
              />
              <p className="text-xs text-zinc-500 mt-1">
                FOH: {calculatedFohSqft.toLocaleString()} sqft | BOH: {calculatedBohSqft.toLocaleString()} sqft
              </p>
            </div>
          </div>

          {/* Seating */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="seats">Seats</Label>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.seats_override}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        seats_override: e.target.checked,
                        seats: displaySeats,
                      })
                    }
                    className="rounded"
                  />
                  Override calculation
                </label>
              </div>
              {formData.seats_override ? (
                <Input
                  id="seats"
                  type="number"
                  min="0"
                  value={formData.seats || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, seats: e.target.value })
                  }
                  placeholder="Enter seat count"
                />
              ) : (
                <div className="h-10 px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900/50 flex items-center text-sm text-zinc-300">
                  {calculatedSeats} seats (auto: ~15 sqft/seat)
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="bar_seats">Bar Seats</Label>
              <Input
                id="bar_seats"
                type="number"
                value={formData.bar_seats}
                onChange={(e) =>
                  setFormData({ ...formData, bar_seats: e.target.value })
                }
                placeholder="20"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
