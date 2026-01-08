"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface ServicePeriod {
  id: string;
  service_name: string;
  days_per_week: number;
  avg_covers_per_service: number;
  avg_food_check: number;
  avg_bev_check: number;
  sort_order: number;
}

interface ServicePeriodsManagerProps {
  scenarioId: string;
}

export function ServicePeriodsManager({ scenarioId }: ServicePeriodsManagerProps) {
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ServicePeriod>>({});
  const [newService, setNewService] = useState({
    service_name: "",
    days_per_week: 7,
    avg_covers_per_service: 0,
    avg_food_check: 0,
    avg_bev_check: 0,
  });

  useEffect(() => {
    loadServices();
  }, [scenarioId]);

  const loadServices = async () => {
    try {
      const response = await fetch(`/api/proforma/service-periods?scenario_id=${scenarioId}`);
      if (response.ok) {
        const data = await response.json();
        setServices(data.services || []);
      }
    } catch (error) {
      console.error("Error loading services:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddService = async () => {
    if (!newService.service_name) {
      alert("Please enter a service name");
      return;
    }

    try {
      const response = await fetch("/api/proforma/service-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          ...newService,
          sort_order: services.length,
        }),
      });

      if (!response.ok) throw new Error("Failed to add service");

      setNewService({
        service_name: "",
        days_per_week: 7,
        avg_covers_per_service: 0,
        avg_food_check: 0,
        avg_bev_check: 0,
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

  const calculateMonthlyRevenue = (service: ServicePeriod) => {
    const monthlyCovers = service.avg_covers_per_service * service.days_per_week * 4.33;
    const foodRevenue = monthlyCovers * service.avg_food_check;
    const bevRevenue = monthlyCovers * service.avg_bev_check;
    return foodRevenue + bevRevenue;
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
            const displayService = isEditing ? editValues : service;

            return (
              <Card key={service.id} className="p-4">
                <div className="flex items-start gap-4">
                  <GripVertical className="w-5 h-5 text-zinc-600 mt-2 cursor-move" />

                  <div className="flex-1 grid grid-cols-5 gap-3">
                    <div>
                      <Label className="text-xs">Service Name</Label>
                      {isEditing ? (
                        <Input
                          value={displayService.service_name || ""}
                          onChange={(e) => setEditValues({ ...editValues, service_name: e.target.value })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <div className="text-sm font-medium text-zinc-50 mt-1">
                          {service.service_name}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Days/Week</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.5"
                          value={displayService.days_per_week || 0}
                          onChange={(e) => setEditValues({ ...editValues, days_per_week: parseFloat(e.target.value) })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <div className="text-sm text-zinc-300 mt-1">
                          {service.days_per_week}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Avg Covers</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          value={displayService.avg_covers_per_service || 0}
                          onChange={(e) => setEditValues({ ...editValues, avg_covers_per_service: parseFloat(e.target.value) })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <div className="text-sm text-zinc-300 mt-1">
                          {service.avg_covers_per_service}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Food Check</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={displayService.avg_food_check || 0}
                          onChange={(e) => setEditValues({ ...editValues, avg_food_check: parseFloat(e.target.value) })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <div className="text-sm text-zinc-300 mt-1">
                          ${service.avg_food_check.toFixed(2)}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Bev Check</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={displayService.avg_bev_check || 0}
                          onChange={(e) => setEditValues({ ...editValues, avg_bev_check: parseFloat(e.target.value) })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <div className="text-sm text-zinc-300 mt-1">
                          ${service.avg_bev_check.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <Label className="text-xs">Est. Monthly</Label>
                    <div className="text-sm font-semibold text-[#D4AF37] mt-1">
                      ${calculateMonthlyRevenue(displayService as ServicePeriod).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
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
              </Card>
            );
          })}
        </div>
      )}

      {/* Add New Service */}
      <Card className="p-4 border-dashed">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-zinc-300">Add Service Period</h4>

          <div className="grid grid-cols-5 gap-3">
            <div>
              <Label htmlFor="service_name">Service Name *</Label>
              <Input
                id="service_name"
                placeholder="Breakfast, Lunch, Dinner"
                value={newService.service_name}
                onChange={(e) => setNewService({ ...newService, service_name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="days_per_week">Days/Week *</Label>
              <Input
                id="days_per_week"
                type="number"
                step="0.5"
                min="0"
                max="7"
                value={newService.days_per_week}
                onChange={(e) => setNewService({ ...newService, days_per_week: parseFloat(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="avg_covers">Avg Covers *</Label>
              <Input
                id="avg_covers"
                type="number"
                step="1"
                min="0"
                placeholder="150"
                value={newService.avg_covers_per_service || ""}
                onChange={(e) => setNewService({ ...newService, avg_covers_per_service: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="food_check">Food Check *</Label>
              <Input
                id="food_check"
                type="number"
                step="0.01"
                min="0"
                placeholder="45.00"
                value={newService.avg_food_check || ""}
                onChange={(e) => setNewService({ ...newService, avg_food_check: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="bev_check">Bev Check *</Label>
              <Input
                id="bev_check"
                type="number"
                step="0.01"
                min="0"
                placeholder="25.00"
                value={newService.avg_bev_check || ""}
                onChange={(e) => setNewService({ ...newService, avg_bev_check: parseFloat(e.target.value) || 0 })}
              />
            </div>
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
