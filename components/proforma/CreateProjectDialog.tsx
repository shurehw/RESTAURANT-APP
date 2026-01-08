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
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Check } from "lucide-react";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

interface RevenueCenter {
  center_name: string;
  seats: number;
}

interface ServicePeriod {
  service_name: string;
  days_per_week: number;
  avg_covers_per_service: number;
  avg_food_check: number;
  avg_bev_check: number;
}

interface PDR {
  room_name: string;
  capacity: number;
  events_per_month: number;
  avg_spend_per_person: number;
  avg_party_size: number;
  ramp_months: number;
  food_pct: number;
  bev_pct: number;
  other_pct: number;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  organizationId,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1: Project basics
  const [formData, setFormData] = useState({
    name: "",
    concept_type: "fsr",
    location_city: "",
    location_state: "",
    total_sqft: 0,
    foh_pct: 60,
    seats: "",
    seats_override: false,
    bar_seats: "",
  });

  // Step 2: Scenario basics
  const [scenarioInfo, setScenarioInfo] = useState({
    name: "Base Case",
    months: 60,
    start_month: new Date().toISOString().split("T")[0].substring(0, 7) + "-01",
  });

  // Step 3: Revenue Centers
  const [centers, setCenters] = useState<RevenueCenter[]>([]);
  const [newCenter, setNewCenter] = useState<RevenueCenter>({
    center_name: "",
    seats: 0,
  });

  // Step 4: Service Periods
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [newService, setNewService] = useState<ServicePeriod>({
    service_name: "",
    days_per_week: 7,
    avg_covers_per_service: 0,
    avg_food_check: 0,
    avg_bev_check: 0,
  });

  // Step 5: Private Dining
  const [pdrs, setPdrs] = useState<PDR[]>([]);
  const [newPDR, setNewPDR] = useState<PDR>({
    room_name: "",
    capacity: 20,
    events_per_month: 8,
    avg_spend_per_person: 150,
    avg_party_size: 15,
    ramp_months: 12,
    food_pct: 60,
    bev_pct: 35,
    other_pct: 5,
  });

  // Calculate derived values
  const calculatedFohSqft = Math.round(formData.total_sqft * (formData.foh_pct / 100));
  const calculatedBohSqft = formData.total_sqft - calculatedFohSqft;
  const calculatedSeats = Math.round(calculatedFohSqft / 15);
  const displaySeats = formData.seats_override ? formData.seats : calculatedSeats;

  const handleAddCenter = () => {
    if (!newCenter.center_name) {
      alert("Please enter a center name");
      return;
    }
    if (!newCenter.seats || newCenter.seats <= 0) {
      alert("Please enter a valid seat count");
      return;
    }
    setCenters([...centers, newCenter]);
    setNewCenter({ center_name: "", seats: 0 });
  };

  const handleRemoveCenter = (index: number) => {
    setCenters(centers.filter((_, i) => i !== index));
  };

  const handleAddService = () => {
    if (!newService.service_name) {
      alert("Please enter a service name");
      return;
    }
    setServices([...services, newService]);
    setNewService({
      service_name: "",
      days_per_week: 7,
      avg_covers_per_service: 0,
      avg_food_check: 0,
      avg_bev_check: 0,
    });
  };

  const handleRemoveService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleAddPDR = () => {
    if (!newPDR.room_name) {
      alert("Please enter a room name");
      return;
    }
    const mixSum = newPDR.food_pct + newPDR.bev_pct + newPDR.other_pct;
    if (Math.abs(mixSum - 100) > 0.1) {
      alert("Food + Bev + Other must sum to 100%");
      return;
    }
    setPdrs([...pdrs, newPDR]);
    setNewPDR({
      room_name: "",
      capacity: 20,
      events_per_month: 8,
      avg_spend_per_person: 150,
      avg_party_size: 15,
      ramp_months: 12,
      food_pct: 60,
      bev_pct: 35,
      other_pct: 5,
    });
  };

  const handleRemovePDR = (index: number) => {
    setPdrs(pdrs.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (step === 1 && !formData.name) {
      alert("Please enter a project name");
      return;
    }
    if (step === 2 && !scenarioInfo.name) {
      alert("Please enter a scenario name");
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Create project
      const projectRes = await fetch("/api/proforma/projects", {
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

      if (!projectRes.ok) throw new Error("Failed to create project");
      const { project } = await projectRes.json();

      // 2. Create scenario
      const scenarioRes = await fetch("/api/proforma/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          name: scenarioInfo.name,
          months: scenarioInfo.months,
          start_month: scenarioInfo.start_month,
          is_base: true,
        }),
      });

      if (!scenarioRes.ok) throw new Error("Failed to create scenario");
      const { scenario } = await scenarioRes.json();

      // 3. Add revenue centers
      for (let i = 0; i < centers.length; i++) {
        await fetch("/api/proforma/revenue-centers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            ...centers[i],
            sort_order: i,
          }),
        });
      }

      // 4. Add service periods
      for (let i = 0; i < services.length; i++) {
        await fetch("/api/proforma/service-periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            ...services[i],
            sort_order: i,
          }),
        });
      }

      // 5. Add PDRs
      for (const pdr of pdrs) {
        await fetch("/api/proforma/pdr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            ...pdr,
            food_pct: pdr.food_pct / 100,
            bev_pct: pdr.bev_pct / 100,
            other_pct: pdr.other_pct / 100,
          }),
        });
      }

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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Proforma Project</DialogTitle>
          <DialogDescription>
            Set up your new project with initial scenario and revenue streams
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 ${step >= 1 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${step >= 1 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                1
              </div>
              <span className="text-xs font-medium hidden sm:inline">Project</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 2 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${step >= 2 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                2
              </div>
              <span className="text-xs font-medium hidden sm:inline">Scenario</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 3 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${step >= 3 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                3
              </div>
              <span className="text-xs font-medium hidden sm:inline">Centers</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 4 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${step >= 4 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                4
              </div>
              <span className="text-xs font-medium hidden sm:inline">Services</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 5 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${step >= 5 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                5
              </div>
              <span className="text-xs font-medium hidden sm:inline">PDR</span>
            </div>
          </div>

          {/* Step 1: Project Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Project Information</h3>
                <p className="text-sm text-zinc-400 mt-1">Define your concept and space</p>
              </div>

              <div>
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. New Nightclub Downtown"
                />
              </div>

              <div>
                <Label htmlFor="concept_type">Concept Type *</Label>
                <Select
                  value={formData.concept_type}
                  onValueChange={(value) => setFormData({ ...formData, concept_type: value })}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location_city">City</Label>
                  <Input
                    id="location_city"
                    value={formData.location_city}
                    onChange={(e) => setFormData({ ...formData, location_city: e.target.value })}
                    placeholder="Los Angeles"
                  />
                </div>
                <div>
                  <Label htmlFor="location_state">State</Label>
                  <Input
                    id="location_state"
                    value={formData.location_state}
                    onChange={(e) => setFormData({ ...formData, location_state: e.target.value })}
                    placeholder="CA"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4 space-y-4">
                <h4 className="font-medium text-zinc-50">Space Planning</h4>

                <div>
                  <Label htmlFor="total_sqft">Total Square Feet</Label>
                  <Input
                    id="total_sqft"
                    type="number"
                    min="0"
                    value={formData.total_sqft || ""}
                    onChange={(e) => setFormData({ ...formData, total_sqft: parseInt(e.target.value) || 0 })}
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
                    onChange={(e) => setFormData({ ...formData, foh_pct: parseInt(e.target.value) || 60 })}
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    FOH: {calculatedFohSqft.toLocaleString()} sqft | BOH: {calculatedBohSqft.toLocaleString()} sqft
                  </p>
                </div>

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
                      onChange={(e) => setFormData({ ...formData, seats: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, bar_seats: e.target.value })}
                    placeholder="20"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Scenario Info */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Scenario Setup</h3>
                <p className="text-sm text-zinc-400 mt-1">Configure your initial projection scenario</p>
              </div>

              <div>
                <Label htmlFor="scenario_name">Scenario Name *</Label>
                <Input
                  id="scenario_name"
                  value={scenarioInfo.name}
                  onChange={(e) => setScenarioInfo({ ...scenarioInfo, name: e.target.value })}
                  placeholder="Base Case, Upside, Downside"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="months">Projection Months *</Label>
                  <Input
                    id="months"
                    type="number"
                    min="12"
                    max="120"
                    value={scenarioInfo.months}
                    onChange={(e) => setScenarioInfo({ ...scenarioInfo, months: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="start_month">Start Month *</Label>
                  <Input
                    id="start_month"
                    type="date"
                    value={scenarioInfo.start_month}
                    onChange={(e) => setScenarioInfo({ ...scenarioInfo, start_month: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Revenue Centers */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Revenue Centers</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Define revenue centers like Main Dining, Bar, Patio, etc. You can skip this and add later.
                </p>
              </div>

              {centers.length > 0 && (
                <div className="space-y-2">
                  {centers.map((center, index) => (
                    <Card key={index} className="p-3 flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                        <span className="font-medium text-zinc-50">{center.center_name}</span>
                        <span className="text-zinc-400">{center.seats} seats</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveCenter(index)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="p-4 border-dashed">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Center name (e.g., Main Dining)"
                      value={newCenter.center_name}
                      onChange={(e) => setNewCenter({ ...newCenter, center_name: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Seats"
                      min="0"
                      value={newCenter.seats || ""}
                      onChange={(e) => setNewCenter({ ...newCenter, seats: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <Button onClick={handleAddCenter} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Revenue Center
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Step 4: Service Periods */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Service Periods</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Define your operating schedule (e.g., Breakfast, Lunch, Dinner). You can skip this and add later.
                </p>
              </div>

              {services.length > 0 && (
                <div className="space-y-2">
                  {services.map((service, index) => (
                    <Card key={index} className="p-3 flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-5 gap-2 text-sm">
                        <span className="font-medium text-zinc-50">{service.service_name}</span>
                        <span className="text-zinc-400">{service.days_per_week} days/wk</span>
                        <span className="text-zinc-400">{service.avg_covers_per_service} covers</span>
                        <span className="text-zinc-400">${service.avg_food_check} food</span>
                        <span className="text-zinc-400">${service.avg_bev_check} bev</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveService(index)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="p-4 border-dashed">
                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    <Input
                      placeholder="Service name"
                      value={newService.service_name}
                      onChange={(e) => setNewService({ ...newService, service_name: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Days/week"
                      step="0.5"
                      value={newService.days_per_week}
                      onChange={(e) => setNewService({ ...newService, days_per_week: parseFloat(e.target.value) })}
                    />
                    <Input
                      type="number"
                      placeholder="Avg covers"
                      value={newService.avg_covers_per_service || ""}
                      onChange={(e) => setNewService({ ...newService, avg_covers_per_service: parseFloat(e.target.value) || 0 })}
                    />
                    <Input
                      type="number"
                      placeholder="Food check"
                      step="0.01"
                      value={newService.avg_food_check || ""}
                      onChange={(e) => setNewService({ ...newService, avg_food_check: parseFloat(e.target.value) || 0 })}
                    />
                    <Input
                      type="number"
                      placeholder="Bev check"
                      step="0.01"
                      value={newService.avg_bev_check || ""}
                      onChange={(e) => setNewService({ ...newService, avg_bev_check: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <Button onClick={handleAddService} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Service Period
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Step 5: Private Dining */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Private Dining Rooms (Optional)</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Add private event spaces if applicable. You can skip this.
                </p>
              </div>

              {pdrs.length > 0 && (
                <div className="space-y-2">
                  {pdrs.map((pdr, index) => (
                    <Card key={index} className="p-3 flex items-center justify-between">
                      <div className="flex-1 text-sm">
                        <span className="font-medium text-zinc-50">{pdr.room_name}</span>
                        <span className="text-zinc-400 ml-4">
                          Cap: {pdr.capacity} | {pdr.events_per_month} events/mo | ${pdr.avg_spend_per_person}/person
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemovePDR(index)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="p-4 border-dashed">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Room name"
                      value={newPDR.room_name}
                      onChange={(e) => setNewPDR({ ...newPDR, room_name: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Capacity"
                      value={newPDR.capacity}
                      onChange={(e) => setNewPDR({ ...newPDR, capacity: parseInt(e.target.value) })}
                    />
                    <Input
                      type="number"
                      placeholder="Events/month"
                      step="0.1"
                      value={newPDR.events_per_month}
                      onChange={(e) => setNewPDR({ ...newPDR, events_per_month: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Avg spend/person"
                      step="0.01"
                      value={newPDR.avg_spend_per_person}
                      onChange={(e) => setNewPDR({ ...newPDR, avg_spend_per_person: parseFloat(e.target.value) })}
                    />
                    <Input
                      type="number"
                      placeholder="Avg party size"
                      step="0.1"
                      value={newPDR.avg_party_size}
                      onChange={(e) => setNewPDR({ ...newPDR, avg_party_size: parseFloat(e.target.value) })}
                    />
                  </div>
                  <Button onClick={handleAddPDR} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Private Room
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={handleBack} disabled={step === 1}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {step < 5 ? (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleFinish} disabled={loading}>
                <Check className="w-4 h-4 mr-2" />
                {loading ? "Creating..." : "Create Project"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
