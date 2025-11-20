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

interface CreateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  hasBaseScenario: boolean;
}

export function CreateScenarioDialog({
  open,
  onOpenChange,
  projectId,
  hasBaseScenario,
}: CreateScenarioDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: hasBaseScenario ? "Upside" : "Base",
    is_base: !hasBaseScenario,
    months: "60",
    start_month: new Date().toISOString().slice(0, 7) + "-01",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          project_id: projectId,
          months: parseInt(formData.months),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create scenario");
      }

      onOpenChange(false);
      router.refresh();

      // Reset form
      setFormData({
        name: "Upside",
        is_base: false,
        months: "60",
        start_month: new Date().toISOString().slice(0, 7) + "-01",
      });
    } catch (error) {
      console.error("Error creating scenario:", error);
      alert("Failed to create scenario");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Scenario</DialogTitle>
          <DialogDescription>
            Add a new scenario to model different outcomes (Base, Upside, Downside)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Scenario Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Base, Upside, Downside"
              required
            />
          </div>

          <div>
            <Label htmlFor="months">Projection Period (Months) *</Label>
            <Input
              id="months"
              type="number"
              value={formData.months}
              onChange={(e) => setFormData({ ...formData, months: e.target.value })}
              min="12"
              max="120"
              required
            />
          </div>

          <div>
            <Label htmlFor="start_month">Start Month *</Label>
            <Input
              id="start_month"
              type="date"
              value={formData.start_month}
              onChange={(e) =>
                setFormData({ ...formData, start_month: e.target.value })
              }
              required
            />
          </div>

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
              {loading ? "Creating..." : "Create Scenario"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
