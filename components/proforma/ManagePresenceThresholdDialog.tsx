"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, AlertCircle } from "lucide-react";

interface Position {
  id?: string;
  position_name: string;
  category: 'FOH' | 'BOH';
  labor_driver_type: 'PRESENCE' | 'THRESHOLD';
  staff_per_service: number;
  hours_per_shift: number;
  hourly_rate: number;
  cover_threshold?: number; // Only for THRESHOLD
  applies_to: string[];
}

interface ManagePresenceThresholdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioId: string;
}

export function ManagePresenceThresholdDialog({
  open,
  onOpenChange,
  scenarioId,
}: ManagePresenceThresholdDialogProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);

  useEffect(() => {
    if (open) {
      loadPositions();
    }
  }, [open, scenarioId]);

  const loadPositions = async () => {
    try {
      const response = await fetch(
        `/api/proforma/labor-positions?scenario_id=${scenarioId}&driver_types=PRESENCE,THRESHOLD`
      );
      if (response.ok) {
        const data = await response.json();
        setPositions(data.positions || []);
      }
    } catch (error) {
      console.error("Error loading positions:", error);
    }
  };

  const handleAdd = () => {
    setEditing({
      position_name: "",
      category: "FOH",
      labor_driver_type: "PRESENCE",
      staff_per_service: 1,
      hours_per_shift: 6,
      hourly_rate: 25,
      applies_to: ["dining"],
    });
  };

  const handleSave = async () => {
    if (!editing) return;

    setLoading(true);
    try {
      const method = editing.id ? "PATCH" : "POST";
      const response = await fetch("/api/proforma/labor-positions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editing,
          scenario_id: scenarioId,
        }),
      });

      if (response.ok) {
        await loadPositions();
        setEditing(null);
      } else {
        alert("Failed to save position");
      }
    } catch (error) {
      console.error("Error saving position:", error);
      alert("Failed to save position");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (positionId: string) => {
    if (!confirm("Delete this position?")) return;

    try {
      const response = await fetch(
        `/api/proforma/labor-positions?id=${positionId}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        await loadPositions();
      } else {
        alert("Failed to delete position");
      }
    } catch (error) {
      console.error("Error deleting position:", error);
      alert("Failed to delete position");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage PRESENCE/THRESHOLD Positions</DialogTitle>
          <p className="text-sm text-zinc-500 mt-2">
            <span className="font-semibold">PRESENCE:</span> Fixed staff per service (e.g., Security, Maître d') •{" "}
            <span className="font-semibold">THRESHOLD:</span> Kicks in after X covers (e.g., Extra Host at 250 covers)
          </p>
        </DialogHeader>

        {editing ? (
          <div className="space-y-4 p-4 border border-zinc-800 rounded-lg bg-zinc-900/50">
            <h4 className="font-semibold text-zinc-50">
              {editing.id ? "Edit Position" : "Add New Position"}
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="position_name">Position Name *</Label>
                <Input
                  id="position_name"
                  value={editing.position_name}
                  onChange={(e) =>
                    setEditing({ ...editing, position_name: e.target.value })
                  }
                  placeholder="e.g., Security, Maître d'"
                />
              </div>

              <div>
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: e.target.value as "FOH" | "BOH",
                    })
                  }
                  className="w-full h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-50"
                >
                  <option value="FOH">FOH</option>
                  <option value="BOH">BOH</option>
                </select>
              </div>

              <div>
                <Label htmlFor="driver_type">Type *</Label>
                <select
                  id="driver_type"
                  value={editing.labor_driver_type}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      labor_driver_type: e.target.value as
                        | "PRESENCE"
                        | "THRESHOLD",
                    })
                  }
                  className="w-full h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-50"
                >
                  <option value="PRESENCE">PRESENCE (Fixed per service)</option>
                  <option value="THRESHOLD">THRESHOLD (After X covers)</option>
                </select>
              </div>

              <div>
                <Label htmlFor="staff_per_service">Staff per Service *</Label>
                <Input
                  id="staff_per_service"
                  type="number"
                  step="0.5"
                  value={editing.staff_per_service}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      staff_per_service: parseFloat(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="hours_per_shift">Hours per Shift *</Label>
                <Input
                  id="hours_per_shift"
                  type="number"
                  step="0.5"
                  value={editing.hours_per_shift}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      hours_per_shift: parseFloat(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="hourly_rate">Hourly Rate ($) *</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.50"
                  value={editing.hourly_rate}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      hourly_rate: parseFloat(e.target.value),
                    })
                  }
                />
              </div>

              {editing.labor_driver_type === "THRESHOLD" && (
                <div className="col-span-2">
                  <Label htmlFor="cover_threshold">Cover Threshold *</Label>
                  <Input
                    id="cover_threshold"
                    type="number"
                    value={editing.cover_threshold || 0}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        cover_threshold: parseInt(e.target.value),
                      })
                    }
                    placeholder="e.g., 250"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    This position kicks in after this many covers
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Saving..." : "Save Position"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {positions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-2 text-zinc-600" />
                  <p>No PRESENCE/THRESHOLD positions yet</p>
                  <p className="text-sm">Click "Add Position" to get started</p>
                </div>
              ) : (
                positions.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-3 border border-zinc-800 rounded-lg hover:bg-zinc-900/50"
                  >
                    <div>
                      <h4 className="font-medium text-zinc-50">
                        {position.position_name}
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {position.labor_driver_type}
                        </span>
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {position.category}
                        </span>
                      </h4>
                      <p className="text-sm text-zinc-500">
                        {position.staff_per_service} staff × {position.hours_per_shift} hrs @ $
                        {position.hourly_rate}/hr
                        {position.cover_threshold &&
                          ` • Kicks in after ${position.cover_threshold} covers`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(position)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => position.id && handleDelete(position.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-zinc-800">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={handleAdd}>
                <Plus className="w-4 h-4 mr-2" />
                Add Position
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
