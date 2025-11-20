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
    square_feet_foh: "",
    square_feet_boh: "",
    seats: "",
    bar_seats: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          org_id: organizationId,
          square_feet_foh: formData.square_feet_foh ? parseInt(formData.square_feet_foh) : null,
          square_feet_boh: formData.square_feet_boh ? parseInt(formData.square_feet_boh) : null,
          seats: formData.seats ? parseInt(formData.seats) : null,
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="square_feet_foh">FOH Square Feet</Label>
              <Input
                id="square_feet_foh"
                type="number"
                value={formData.square_feet_foh}
                onChange={(e) =>
                  setFormData({ ...formData, square_feet_foh: e.target.value })
                }
                placeholder="3000"
              />
            </div>
            <div>
              <Label htmlFor="square_feet_boh">BOH Square Feet</Label>
              <Input
                id="square_feet_boh"
                type="number"
                value={formData.square_feet_boh}
                onChange={(e) =>
                  setFormData({ ...formData, square_feet_boh: e.target.value })
                }
                placeholder="1500"
              />
            </div>
          </div>

          {/* Seating */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="seats">Total Seats</Label>
              <Input
                id="seats"
                type="number"
                value={formData.seats}
                onChange={(e) => setFormData({ ...formData, seats: e.target.value })}
                placeholder="150"
              />
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
