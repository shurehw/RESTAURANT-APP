"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";

interface RevenueCenter {
  id: string;
  center_name: string;
  seats: number;
  sort_order: number;
  is_bar?: boolean;
  bar_mode?: 'seated' | 'standing' | 'none';
  bar_zone_area_sqft?: number | null;
  bar_zone_depth_ft?: number | null;
  is_pdr?: boolean;
  max_seats?: number | null;
}

interface RevenueCentersManagerProps {
  scenarioId: string;
}

export function RevenueCentersManager({ scenarioId }: RevenueCentersManagerProps) {
  const [centers, setCenters] = useState<RevenueCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<RevenueCenter>>({});
  const [newCenter, setNewCenter] = useState({
    center_name: "",
    seats: "",
    is_bar: false,
    bar_mode: 'none' as 'seated' | 'standing' | 'none',
    bar_zone_area_sqft: "",
    bar_zone_depth_ft: "",
    is_pdr: false,
    max_seats: "",
  });

  useEffect(() => {
    loadCenters();
  }, [scenarioId]);

  const loadCenters = async () => {
    try {
      const response = await fetch(`/api/proforma/revenue-centers?scenario_id=${scenarioId}`);
      if (response.ok) {
        const data = await response.json();
        setCenters(data.centers || []);
      }
    } catch (error) {
      console.error("Error loading revenue centers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCenter = async () => {
    if (!newCenter.center_name) {
      alert("Please enter a center name");
      return;
    }

    // Standing bars can have 0 seats initially (will be calculated)
    const isStandingBar = newCenter.is_bar && newCenter.bar_mode === 'standing';
    if (!isStandingBar && (!newCenter.seats || parseInt(newCenter.seats) <= 0)) {
      alert("Please enter a valid seat count");
      return;
    }

    // Validation: if is_bar, bar_mode must be set
    if (newCenter.is_bar && newCenter.bar_mode === 'none') {
      alert("Please select a bar mode (Seated or Standing)");
      return;
    }

    // Validation: cannot be both bar and PDR
    if (newCenter.is_bar && newCenter.is_pdr) {
      alert("A center cannot be both a bar and a PDR");
      return;
    }

    try {
      const response = await fetch("/api/proforma/revenue-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          center_name: newCenter.center_name,
          seats: parseInt(newCenter.seats) || 0, // Allow 0 for standing bars
          sort_order: centers.length,
          is_bar: newCenter.is_bar,
          bar_mode: newCenter.is_bar ? newCenter.bar_mode : 'none',
          bar_zone_area_sqft: newCenter.bar_zone_area_sqft ? parseFloat(newCenter.bar_zone_area_sqft) : null,
          bar_zone_depth_ft: newCenter.bar_zone_depth_ft ? parseFloat(newCenter.bar_zone_depth_ft) : null,
          is_pdr: newCenter.is_pdr,
          max_seats: newCenter.max_seats ? parseInt(newCenter.max_seats) : null,
        }),
      });

      if (response.ok) {
        setNewCenter({
          center_name: "",
          seats: "",
          is_bar: false,
          bar_mode: 'none',
          bar_zone_area_sqft: "",
          bar_zone_depth_ft: "",
          is_pdr: false,
          max_seats: "",
        });
        await loadCenters();
      } else {
        alert("Failed to add revenue center");
      }
    } catch (error) {
      console.error("Error adding center:", error);
      alert("Failed to add revenue center");
    }
  };

  const handleStartEdit = (center: RevenueCenter) => {
    setEditingId(center.id);
    setEditValues({
      center_name: center.center_name,
      seats: center.seats,
      is_bar: center.is_bar,
      bar_mode: center.bar_mode,
      bar_zone_area_sqft: center.bar_zone_area_sqft,
      bar_zone_depth_ft: center.bar_zone_depth_ft,
      is_pdr: center.is_pdr,
      max_seats: center.max_seats,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSaveEdit = async (centerId: string) => {
    if (!editValues.center_name) {
      alert("Center name cannot be empty");
      return;
    }

    if (!editValues.seats || editValues.seats <= 0) {
      alert("Please enter a valid seat count");
      return;
    }

    // Validation: if is_bar, bar_mode must be set
    if (editValues.is_bar && editValues.bar_mode === 'none') {
      alert("Please select a bar mode (Seated or Standing)");
      return;
    }

    // Validation: cannot be both bar and PDR
    if (editValues.is_bar && editValues.is_pdr) {
      alert("A center cannot be both a bar and a PDR");
      return;
    }

    try {
      const response = await fetch("/api/proforma/revenue-centers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: centerId,
          center_name: editValues.center_name,
          seats: editValues.seats,
          is_bar: editValues.is_bar,
          bar_mode: editValues.is_bar ? editValues.bar_mode : 'none',
          bar_zone_area_sqft: editValues.bar_zone_area_sqft,
          bar_zone_depth_ft: editValues.bar_zone_depth_ft,
          is_pdr: editValues.is_pdr,
          max_seats: editValues.max_seats,
        }),
      });

      if (response.ok) {
        setEditingId(null);
        setEditValues({});
        await loadCenters();
      } else {
        alert("Failed to update revenue center");
      }
    } catch (error) {
      console.error("Error updating center:", error);
      alert("Failed to update revenue center");
    }
  };

  const handleDelete = async (centerId: string) => {
    if (!confirm("Are you sure you want to delete this revenue center? This will also delete all associated cover allocations.")) {
      return;
    }

    try {
      const response = await fetch(`/api/proforma/revenue-centers?id=${centerId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadCenters();
      } else {
        alert("Failed to delete revenue center");
      }
    } catch (error) {
      console.error("Error deleting center:", error);
      alert("Failed to delete revenue center");
    }
  };

  const totalSeats = centers.reduce((sum, c) => sum + c.seats, 0);

  if (loading) {
    return <div className="text-zinc-400">Loading revenue centers...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-md font-semibold text-black">Revenue Centers</h4>
          <p className="text-sm text-zinc-600">
            Define your revenue-generating areas (Dining Room, Bar, Patio, etc.)
          </p>
        </div>
        {centers.length > 0 && (
          <div className="text-sm text-zinc-600">
            Total: <span className="font-semibold text-black">{totalSeats}</span> seats
          </div>
        )}
      </div>

      {/* Existing Centers */}
      {centers.length > 0 && (
        <div className="space-y-2">
          {centers.map((center) => {
            const isEditing = editingId === center.id;

            return (
              <Card key={center.id} className="p-3 bg-white border-zinc-200">
                <div className="flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-zinc-400 cursor-move" />

                  {isEditing ? (
                    <>
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Input
                              value={editValues.center_name || ""}
                              onChange={(e) => setEditValues({ ...editValues, center_name: e.target.value })}
                              placeholder="Center name"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Input
                              type="number"
                              min="1"
                              value={editValues.seats || ""}
                              onChange={(e) => setEditValues({ ...editValues, seats: parseInt(e.target.value) || 0 })}
                              placeholder="Seats"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>

                        {/* Bar Mode Editing */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id={`edit_is_bar_${center.id}`}
                            checked={editValues.is_bar || false}
                            onChange={(e) => setEditValues({
                              ...editValues,
                              is_bar: e.target.checked,
                              bar_mode: e.target.checked ? (editValues.bar_mode || 'none') : 'none'
                            })}
                            className="w-3 h-3 rounded border-zinc-300"
                          />
                          <Label htmlFor={`edit_is_bar_${center.id}`} className="text-xs text-zinc-600 cursor-pointer">
                            Bar
                          </Label>
                          {editValues.is_bar && (
                            <select
                              value={editValues.bar_mode || 'none'}
                              onChange={(e) => setEditValues({ ...editValues, bar_mode: e.target.value as 'seated' | 'standing' | 'none' })}
                              className="h-7 px-2 text-xs rounded border border-zinc-300"
                            >
                              <option value="none">Select mode...</option>
                              <option value="seated">Seated</option>
                              <option value="standing">Standing</option>
                            </select>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSaveEdit(center.id)}
                        className="h-7 w-7 p-0"
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        className="h-7 w-7 p-0"
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="font-medium text-black">
                          {center.center_name}
                          {center.is_bar && (
                            <span className="ml-2 text-xs font-normal text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                              {center.bar_mode === 'seated' ? 'Seated Bar' : center.bar_mode === 'standing' ? 'Standing Bar' : 'Bar'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">{center.seats} seats</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStartEdit(center)}
                        className="h-7 w-7 p-0"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(center.id)}
                        className="h-7 w-7 p-0"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add New Center */}
      <Card className="p-4 bg-zinc-50 border-zinc-300 border-dashed">
        <div className="space-y-3">
          <Label className="text-sm font-medium text-zinc-700">Add Revenue Center</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                placeholder="Center name (e.g., Dining Room)"
                value={newCenter.center_name}
                onChange={(e) => setNewCenter({ ...newCenter, center_name: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              {newCenter.is_bar && newCenter.bar_mode === 'standing' ? (
                <div>
                  <Label className="text-xs text-zinc-600 mb-1 block">
                    Standing Capacity (auto-calculated from area)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Optional override"
                    value={newCenter.seats}
                    onChange={(e) => setNewCenter({ ...newCenter, seats: e.target.value })}
                    className="h-9 bg-zinc-50"
                  />
                </div>
              ) : (
                <Input
                  type="number"
                  min="1"
                  placeholder="Seats"
                  value={newCenter.seats}
                  onChange={(e) => setNewCenter({ ...newCenter, seats: e.target.value })}
                  className="h-9"
                />
              )}
            </div>
          </div>

          {/* Bar Mode Selection */}
          <div className="space-y-2 pt-2 border-t border-zinc-300">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_bar"
                checked={newCenter.is_bar}
                onChange={(e) => setNewCenter({
                  ...newCenter,
                  is_bar: e.target.checked,
                  bar_mode: e.target.checked ? newCenter.bar_mode : 'none'
                })}
                className="w-4 h-4 rounded border-zinc-300"
              />
              <Label htmlFor="is_bar" className="text-sm font-medium text-zinc-700 cursor-pointer">
                This is a bar
              </Label>
            </div>

            {newCenter.is_bar && (
              <div className="ml-6 space-y-2 p-3 bg-white rounded border border-zinc-200">
                <Label className="text-sm font-medium text-zinc-700">Bar Mode (Required)</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="bar_seated"
                      name="bar_mode"
                      value="seated"
                      checked={newCenter.bar_mode === 'seated'}
                      onChange={(e) => setNewCenter({ ...newCenter, bar_mode: 'seated' })}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="bar_seated" className="text-sm cursor-pointer">
                      Seated Dining Bar (seat-based covers)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="bar_standing"
                      name="bar_mode"
                      value="standing"
                      checked={newCenter.bar_mode === 'standing'}
                      onChange={(e) => setNewCenter({ ...newCenter, bar_mode: 'standing' })}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="bar_standing" className="text-sm cursor-pointer">
                      Standing / Throughput Bar (guest flow)
                    </Label>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {newCenter.bar_mode === 'seated'
                    ? 'Seated bars use seat-based math and count toward total covers.'
                    : newCenter.bar_mode === 'standing'
                    ? 'Standing bars use throughput model (guests/hour) and are tracked separately from covers.'
                    : 'Choose how this bar operates to calculate revenue correctly.'}
                </p>

                {/* Standing Bar Sqft Fields */}
                {newCenter.bar_mode === 'standing' && (
                  <div className="mt-3 pt-3 border-t border-zinc-200 space-y-2">
                    <Label className="text-xs font-medium text-zinc-700">Standing Capacity (Optional)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-zinc-600">Bar Zone Area (sqft)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={newCenter.bar_zone_area_sqft}
                          onChange={(e) => setNewCenter({ ...newCenter, bar_zone_area_sqft: e.target.value })}
                          placeholder="e.g., 800"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-600">Bar Zone Depth (ft)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={newCenter.bar_zone_depth_ft}
                          onChange={(e) => setNewCenter({ ...newCenter, bar_zone_depth_ft: e.target.value })}
                          placeholder="e.g., 12"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Used to calculate standing capacity automatically. Can configure later.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PDR Selection */}
          <div className="space-y-2 pt-2 border-t border-zinc-300">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_pdr"
                checked={newCenter.is_pdr}
                onChange={(e) => setNewCenter({
                  ...newCenter,
                  is_pdr: e.target.checked,
                  is_bar: e.target.checked ? false : newCenter.is_bar // Cannot be both
                })}
                className="w-4 h-4 rounded border-zinc-300"
              />
              <Label htmlFor="is_pdr" className="text-sm font-medium text-zinc-700 cursor-pointer">
                This is a Private Dining Room (PDR)
              </Label>
            </div>

            {newCenter.is_pdr && (
              <div className="ml-6 p-3 bg-white rounded border border-zinc-200 space-y-2">
                <p className="text-xs text-zinc-600">
                  PDRs use event-based math, not seat turnover. Configure events per service in metrics editor.
                </p>
                <div>
                  <Label className="text-xs text-zinc-600">Max Physical Capacity (optional)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newCenter.max_seats}
                    onChange={(e) => setNewCenter({ ...newCenter, max_seats: e.target.value })}
                    placeholder="e.g., 40"
                    className="h-8 text-xs"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Used for validation only (avg guests ≤ max capacity)
                  </p>
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleAddCenter}
            size="sm"
            variant="outline"
            disabled={!newCenter.center_name || !newCenter.seats}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Center
          </Button>
        </div>
      </Card>

      {centers.length === 0 && (
        <div className="text-sm text-zinc-500 italic">
          No revenue centers defined yet. Add your first center above.
        </div>
      )}
    </div>
  );
}
