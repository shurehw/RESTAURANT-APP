"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface RevenueCenter {
  id: string;
  center_name: string;
  seats: number;
}

interface ServicePeriodCover {
  revenue_center_id: string;
  covers_per_service: number;
}

interface ServicePeriod {
  id: string;
  service_name: string;
  days_per_week: number;
  avg_check: number;
  avg_covers_per_service: number;
  food_pct: number;
  bev_pct: number;
  other_pct: number;
  sort_order: number;
  operating_days?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  day_of_week_distribution?: number[]; // 7 values summing to 100
  covers_by_center?: ServicePeriodCover[];
  service_hours?: number;
  avg_dining_time_hours?: number;
  default_utilization_pct?: number;
}

interface ServicePeriodsManagerProps {
  scenarioId: string;
}

export function ServicePeriodsManager({ scenarioId }: ServicePeriodsManagerProps) {
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [revenueCenters, setRevenueCenters] = useState<RevenueCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ServicePeriod>>({});
  const [newService, setNewService] = useState({
    service_name: "",
    operating_days: [0, 1, 2, 3, 4, 5, 6], // All days by default
    service_hours: 3.0,
    avg_dining_time_hours: 1.5,
    default_utilization_pct: 65,
  });

  useEffect(() => {
    loadServices();
    loadRevenueCenters();
  }, [scenarioId]);

  const loadServices = async () => {
    try {
      const response = await fetch(`/api/proforma/service-periods?scenario_id=${scenarioId}`);
      if (response.ok) {
        const data = await response.json();
        setServices(data.servicePeriods || []);
      }
    } catch (error) {
      console.error("Error loading services:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadRevenueCenters = async () => {
    try {
      const response = await fetch(`/api/proforma/revenue-centers?scenario_id=${scenarioId}`);
      if (response.ok) {
        const data = await response.json();
        setRevenueCenters(data.centers || []);
      }
    } catch (error) {
      console.error("Error loading revenue centers:", error);
    }
  };

  const handleAddService = async () => {
    if (!newService.service_name) {
      alert("Please enter a service name");
      return;
    }

    if (newService.operating_days.length === 0) {
      alert("Please select at least one operating day");
      return;
    }

    try {
      const response = await fetch("/api/proforma/service-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          service_name: newService.service_name,
          operating_days: newService.operating_days,
          days_per_week: newService.operating_days.length,
          avg_covers_per_service: 0,
          avg_check: 0,
          food_pct: 60,
          bev_pct: 35,
          other_pct: 5,
          sort_order: services.length,
          service_hours: newService.service_hours,
          avg_dining_time_hours: newService.avg_dining_time_hours,
          default_utilization_pct: newService.default_utilization_pct,
        }),
      });

      if (!response.ok) throw new Error("Failed to add service");

      setNewService({
        service_name: "",
        operating_days: [0, 1, 2, 3, 4, 5, 6],
        service_hours: 3.0,
        avg_dining_time_hours: 1.5,
        default_utilization_pct: 65,
      });
      loadServices();
    } catch (error) {
      console.error("Error adding service:", error);
      alert("Failed to add service period");
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm("Delete this service period?")) return;

    try {
      const response = await fetch(`/api/proforma/service-periods?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");
      loadServices();
    } catch (error) {
      console.error("Error deleting service:", error);
      alert("Failed to delete service period");
    }
  };

  const handleEdit = (service: ServicePeriod) => {
    setEditingId(service.id);
    setEditValues(service);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    try {
      const response = await fetch("/api/proforma/service-periods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...editValues,
        }),
      });

      if (!response.ok) throw new Error("Failed to update");

      setEditingId(null);
      setEditValues({});
      loadServices();
    } catch (error) {
      console.error("Error updating service:", error);
      alert("Failed to update service period");
    }
  };

  if (loading) {
    return <div className="text-zinc-400">Loading service periods...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-2">
          Service Periods
        </h3>
        <p className="text-sm text-zinc-400">
          Define your operating schedule. Each service period can have different covers and check averages.
        </p>
      </div>

      {/* Existing Services */}
      {services.length > 0 && (
        <div className="space-y-3">
          {services.map((service) => {
            const isEditing = editingId === service.id;

            return (
              <Card key={service.id} className="p-4 bg-white border-zinc-200">
                <div className="space-y-3">
                  {/* Header Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-zinc-600 cursor-move" />
                      {isEditing ? (
                        <Input
                          value={editValues.service_name || ""}
                          onChange={(e) => setEditValues({ ...editValues, service_name: e.target.value })}
                          className="h-8 text-sm w-48"
                          placeholder="Service name"
                        />
                      ) : (
                        <h4 className="font-semibold text-black">{service.service_name}</h4>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={handleSaveEdit} className="text-green-400 hover:text-green-300">
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="text-zinc-400 hover:text-zinc-300">
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(service)} className="text-blue-400 hover:text-blue-300">
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteService(service.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Turns Calculation Fields (Edit Mode) */}
                  {isEditing && (
                    <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
                      <div>
                        <Label className="text-xs text-blue-700">Service Hours</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={editValues.service_hours ?? service.service_hours ?? 3.0}
                          onChange={(e) => setEditValues({ ...editValues, service_hours: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                        <div className="text-[10px] text-blue-600 mt-0.5">Length of service</div>
                      </div>
                      <div>
                        <Label className="text-xs text-blue-700">Avg Dining Time (hrs)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.25"
                          value={editValues.avg_dining_time_hours ?? service.avg_dining_time_hours ?? 1.5}
                          onChange={(e) => setEditValues({ ...editValues, avg_dining_time_hours: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                        <div className="text-[10px] text-blue-600 mt-0.5">How long guests stay</div>
                      </div>
                      <div>
                        <Label className="text-xs text-blue-700">Default Utilization %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="5"
                          value={editValues.default_utilization_pct ?? service.default_utilization_pct ?? 65}
                          onChange={(e) => setEditValues({ ...editValues, default_utilization_pct: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                        <div className="text-[10px] text-blue-600 mt-0.5">% full on average</div>
                      </div>
                    </div>
                  )}

                  {/* Turns Display (View Mode) */}
                  {!isEditing && (
                    <div className="text-xs text-zinc-600 flex gap-4">
                      <div>
                        <span className="font-semibold">Service Length:</span> {service.service_hours ?? 3.0}hrs
                      </div>
                      <div>
                        <span className="font-semibold">Dining Time:</span> {service.avg_dining_time_hours ?? 1.5}hrs
                      </div>
                      <div>
                        <span className="font-semibold">Utilization:</span> {service.default_utilization_pct ?? 65}%
                      </div>
                      <div>
                        <span className="font-semibold">Turns:</span> {((service.service_hours ?? 3.0) / (service.avg_dining_time_hours ?? 1.5)).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Operating Days Display/Edit */}
                  <div className="flex gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                      const currentDays = isEditing
                        ? (editValues.operating_days || service.operating_days || [0,1,2,3,4,5,6])
                        : (service.operating_days || [0,1,2,3,4,5,6]);
                      const isOperating = currentDays.includes(idx);

                      if (isEditing) {
                        return (
                          <label
                            key={day}
                            className={`flex-1 text-center py-2 px-2 rounded cursor-pointer border-2 transition-colors ${
                              isOperating
                                ? 'bg-[#D4AF37] border-[#D4AF37] text-black font-semibold'
                                : 'bg-white border-zinc-300 text-zinc-600 hover:border-zinc-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isOperating}
                              onChange={(e) => {
                                let newDays;
                                if (e.target.checked) {
                                  newDays = [...currentDays, idx].sort();
                                } else {
                                  newDays = currentDays.filter((d: number) => d !== idx);
                                }
                                setEditValues({ ...editValues, operating_days: newDays });
                              }}
                              className="hidden"
                            />
                            <span className="text-xs">{day}</span>
                          </label>
                        );
                      }

                      return (
                        <div
                          key={day}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            isOperating
                              ? 'bg-[#D4AF37] text-black'
                              : 'bg-zinc-200 text-zinc-400'
                          }`}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add New Service */}
      <Card className="p-4 border-dashed">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-zinc-300">Add Service Period</h4>

          <div>
            <Label htmlFor="service_name" className="text-sm font-medium">Service Name *</Label>
            <Input
              id="service_name"
              placeholder="Breakfast, Lunch, Dinner"
              value={newService.service_name}
              onChange={(e) => setNewService({ ...newService, service_name: e.target.value })}
              className="mt-1"
            />
          </div>

          {/* Turns Calculation Inputs */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
            <div>
              <Label className="text-xs text-blue-700">Service Hours</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={newService.service_hours}
                onChange={(e) => setNewService({ ...newService, service_hours: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm"
              />
              <div className="text-[10px] text-blue-600 mt-0.5">Length of service</div>
            </div>
            <div>
              <Label className="text-xs text-blue-700">Avg Dining Time (hrs)</Label>
              <Input
                type="number"
                min="0"
                step="0.25"
                value={newService.avg_dining_time_hours}
                onChange={(e) => setNewService({ ...newService, avg_dining_time_hours: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm"
              />
              <div className="text-[10px] text-blue-600 mt-0.5">How long guests stay</div>
            </div>
            <div>
              <Label className="text-xs text-blue-700">Default Utilization %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="5"
                value={newService.default_utilization_pct}
                onChange={(e) => setNewService({ ...newService, default_utilization_pct: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm"
              />
              <div className="text-[10px] text-blue-600 mt-0.5">% full on average</div>
            </div>
          </div>

          {/* Day of Week Picker */}
          <div>
            <Label className="text-sm font-medium">Operating Days *</Label>
            <div className="flex gap-2 mt-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                <label
                  key={day}
                  className={`flex-1 text-center py-2 px-3 rounded cursor-pointer border-2 transition-colors ${
                    newService.operating_days.includes(idx)
                      ? 'bg-[#D4AF37] border-[#D4AF37] text-black font-semibold'
                      : 'bg-white border-zinc-300 text-zinc-600 hover:border-zinc-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={newService.operating_days.includes(idx)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewService({
                          ...newService,
                          operating_days: [...newService.operating_days, idx].sort(),
                        });
                      } else {
                        setNewService({
                          ...newService,
                          operating_days: newService.operating_days.filter(d => d !== idx),
                        });
                      }
                    }}
                    className="hidden"
                  />
                  <span className="text-sm">{day}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {newService.operating_days.length} day{newService.operating_days.length !== 1 ? 's' : ''} selected
            </p>
          </div>

          <Button onClick={handleAddService} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Service Period
          </Button>
        </div>
      </Card>

      {services.length === 0 && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          No service periods defined. Add your first service period above (e.g., Breakfast, Lunch, Dinner).
        </div>
      )}
    </div>
  );
}
