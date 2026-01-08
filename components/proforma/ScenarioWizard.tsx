"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, ArrowLeft, ArrowRight, Check } from "lucide-react";

interface ScenarioWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
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

export function ScenarioWizard({ open, onOpenChange, projectId }: ScenarioWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Basic Info
  const [basicInfo, setBasicInfo] = useState({
    name: "Base Case",
    months: 60,
    start_month: new Date().toISOString().split("T")[0].substring(0, 7) + "-01",
  });

  // Step 2: Service Periods
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [newService, setNewService] = useState<ServicePeriod>({
    service_name: "",
    days_per_week: 7,
    avg_covers_per_service: 0,
    avg_food_check: 0,
    avg_bev_check: 0,
  });

  // Step 3: Private Dining
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
    if (step === 1) {
      if (!basicInfo.name) {
        alert("Please enter a scenario name");
        return;
      }
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Create scenario
      const scenarioRes = await fetch("/api/proforma/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          name: basicInfo.name,
          months: basicInfo.months,
          start_month: basicInfo.start_month,
          is_base: true,
        }),
      });

      if (!scenarioRes.ok) throw new Error("Failed to create scenario");
      const { scenario } = await scenarioRes.json();

      // 2. Add service periods
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

      // 3. Add PDRs
      for (const pdr of pdrs) {
        await fetch("/api/proforma/pdr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            ...pdr,
            // Convert to 0-1 decimals
            food_pct: pdr.food_pct / 100,
            bev_pct: pdr.bev_pct / 100,
            other_pct: pdr.other_pct / 100,
          }),
        });
      }

      onOpenChange(false);
      router.refresh();
      router.push(`/proforma/${projectId}`);
    } catch (error) {
      console.error("Error creating scenario:", error);
      alert("Failed to create scenario");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Scenario Setup</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 ${step >= 1 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                1
              </div>
              <span className="text-sm font-medium">Basic Info</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-4" />
            <div className={`flex items-center gap-2 ${step >= 2 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                2
              </div>
              <span className="text-sm font-medium">Services</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-4" />
            <div className={`flex items-center gap-2 ${step >= 3 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                3
              </div>
              <span className="text-sm font-medium">Private Dining</span>
            </div>
          </div>

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-zinc-50">Basic Information</h3>
              <div>
                <Label htmlFor="name">Scenario Name *</Label>
                <Input
                  id="name"
                  value={basicInfo.name}
                  onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
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
                    value={basicInfo.months}
                    onChange={(e) => setBasicInfo({ ...basicInfo, months: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="start_month">Start Month *</Label>
                  <Input
                    id="start_month"
                    type="date"
                    value={basicInfo.start_month}
                    onChange={(e) => setBasicInfo({ ...basicInfo, start_month: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Service Periods */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Service Periods</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Define your operating schedule (e.g., Breakfast, Lunch, Dinner). You can skip this and add later.
                </p>
              </div>

              {/* Added services */}
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

              {/* Add new service */}
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

          {/* Step 3: Private Dining */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Private Dining Rooms (Optional)</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Add private event spaces if applicable. You can skip this.
                </p>
              </div>

              {/* Added PDRs */}
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

              {/* Add new PDR */}
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

            {step < 3 ? (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleFinish} disabled={loading}>
                <Check className="w-4 h-4 mr-2" />
                {loading ? "Creating..." : "Create Scenario"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
