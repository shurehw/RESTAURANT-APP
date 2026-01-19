"use client";

import { useState, useEffect } from "react";
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
import { Plus, Trash2, ArrowLeft, ArrowRight, Check, AlertTriangle, Pencil } from "lucide-react";
import {
  SEATING_BENCHMARKS,
  CONCEPT_TYPES,
  calculateSeats,
  validateSpaceConstraints,
  type ValidationResult,
} from "@/lib/proforma/constants";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  editMode?: boolean;
  existingProject?: any;
  existingScenario?: any;
}

interface RevenueCenter {
  center_name: string;
  seats: number;
  is_pdr?: boolean;
  max_seats?: number;
}

interface ServicePeriod {
  service_name: string;
  days_per_week: number;
  selected_days?: string[];
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
  editMode = false,
  existingProject,
  existingScenario,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1: Project basics + Scenario
  const [formData, setFormData] = useState({
    name: "",
    concept_type: "casual-dining",
    density_benchmark: "casual-dining",
    location_city: "",
    location_state: "",
    total_sqft: 0,
    sf_per_seat: 20,
    dining_area_pct: 65,
    boh_pct: 30,
    monthly_rent: 0,
    use_manual_seats: false,
    manual_seats: 0,
    use_manual_splits: false,
    manual_foh: 0,
    manual_boh: 0,
    use_manual_bar_seats: false,
    bar_seats: "",
    bar_area_pct: "",
    // FP&A Standing Capacity Model
    concept_archetype: "balanced_resto_bar",
    bar_zone_pct: 15.00,
    bar_net_to_gross: 0.70,
    standable_pct: 0.60,
    sf_per_standing_guest: 7.0,
    utilization_factor: 0.80,
    code_sf_per_person: 7.00,
    scenario_name: "Base Case",
    months: 60,
    start_month: new Date().toISOString().split("T")[0].substring(0, 7) + "-01",
  });

  const [spaceValidation, setSpaceValidation] = useState<ValidationResult>({
    valid: true,
    warnings: [],
    errors: [],
  });

  // Step 2: Revenue Centers
  const [centers, setCenters] = useState<RevenueCenter[]>([]);
  const [newCenter, setNewCenter] = useState<RevenueCenter>({
    center_name: "",
    seats: 0,
    is_pdr: false,
    max_seats: 0,
  });
  const [editingCenterIndex, setEditingCenterIndex] = useState<number | null>(null);
  const [editingCenter, setEditingCenter] = useState<RevenueCenter | null>(null);

  // Step 3: Service Periods
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [newService, setNewService] = useState<ServicePeriod>({
    service_name: "",
    days_per_week: 7,
    selected_days: [],
  });

  const DAYS_OF_WEEK = [
    { value: "monday", label: "Mon" },
    { value: "tuesday", label: "Tue" },
    { value: "wednesday", label: "Wed" },
    { value: "thursday", label: "Thu" },
    { value: "friday", label: "Fri" },
    { value: "saturday", label: "Sat" },
    { value: "sunday", label: "Sun" },
  ];

  const toggleDay = (day: string) => {
    const currentDays = newService.selected_days || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    setNewService({
      ...newService,
      selected_days: newDays,
      days_per_week: newDays.length,
    });
  };

  // Step 4: Private Dining
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

  // Load existing project data in edit mode
  useEffect(() => {
    if (editMode && existingProject && open) {
      setFormData({
        name: existingProject.name || "",
        concept_type: existingProject.concept_type || "casual-dining",
        density_benchmark: existingProject.density_benchmark || "casual-dining",
        location_city: existingProject.location_city || "",
        location_state: existingProject.location_state || "",
        total_sqft: existingProject.total_sf || 0,
        sf_per_seat: existingProject.sf_per_seat || 20,
        dining_area_pct: existingProject.dining_area_pct || 65,
        boh_pct: existingProject.boh_pct || 30,
        monthly_rent: existingProject.monthly_rent || 0,
        use_manual_seats: existingProject.use_manual_seats || false,
        manual_seats: existingProject.manual_seats || 0,
        use_manual_splits: existingProject.use_manual_splits || false,
        manual_foh: existingProject.square_feet_foh || 0,
        manual_boh: existingProject.square_feet_boh || 0,
        use_manual_bar_seats: existingProject.bar_seats ? true : false,
        bar_seats: existingProject.bar_seats?.toString() || "",
        bar_area_pct: existingProject.bar_area_pct?.toString() || "",
        concept_archetype: existingProject.concept_archetype || "balanced_resto_bar",
        bar_zone_pct: existingProject.bar_zone_pct || 15.00,
        bar_net_to_gross: existingProject.bar_net_to_gross || 0.70,
        standable_pct: existingProject.standable_pct || 0.60,
        sf_per_standing_guest: existingProject.sf_per_standing_guest || 7.0,
        utilization_factor: existingProject.utilization_factor || 0.80,
        code_sf_per_person: existingProject.code_sf_per_person || 7.00,
        scenario_name: existingScenario?.scenario_name || "Base Case",
        months: existingScenario?.months || 60,
        start_month: existingScenario?.start_month || new Date().toISOString().split("T")[0].substring(0, 7) + "-01",
      });
    }
  }, [editMode, existingProject, existingScenario, open]);

  // Calculate derived values
  const calculatedSeats = formData.use_manual_seats
    ? formData.manual_seats
    : formData.total_sqft > 0
    ? calculateSeats(formData.total_sqft, formData.dining_area_pct, formData.sf_per_seat)
    : 0;

  // Calculate bar seats
  const calculateBarSeats = () => {
    if (formData.total_sqft === 0) return 0;

    const fohSqFt = formData.total_sqft * (formData.dining_area_pct / 100);

    // Step 1: FOH → Bar Linear Feet (dampened ratio)
    let barLinearFeet = fohSqFt * 0.012; // 1.2 LF per 100 sq ft

    // Guardrails
    if (barLinearFeet < 15) barLinearFeet = 15;
    if (barLinearFeet > 35) barLinearFeet = 35;

    // Step 2: Bar LF → Bar Seats
    const inchesPerSeat = 24; // Comfort default
    let barSeats = Math.floor((barLinearFeet * 12) / inchesPerSeat);

    // Step 3: Enforce 25% cap
    const maxBarSeats = Math.floor(calculatedSeats * 0.25);
    if (barSeats > maxBarSeats) barSeats = maxBarSeats;

    return barSeats;
  };

  const calculatedBarSeats = calculateBarSeats();

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

  const handleEditCenter = (index: number) => {
    setEditingCenterIndex(index);
    setEditingCenter({ ...centers[index] });
  };

  const handleSaveCenter = () => {
    if (editingCenterIndex !== null && editingCenter) {
      const updated = [...centers];
      updated[editingCenterIndex] = editingCenter;
      setCenters(updated);
      setEditingCenterIndex(null);
      setEditingCenter(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingCenterIndex(null);
    setEditingCenter(null);
  };

  const handleAddService = () => {
    if (!newService.service_name) {
      alert("Please enter a service name");
      return;
    }
    if (!newService.selected_days || newService.selected_days.length === 0) {
      alert("Please select at least one day of the week");
      return;
    }
    setServices([...services, newService]);
    setNewService({
      service_name: "",
      days_per_week: 7,
      selected_days: [],
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
      if (!formData.name) {
        alert("Please enter a project name");
        return;
      }

      // Validate space planning
      const finalSeats = formData.use_manual_seats
        ? formData.manual_seats
        : formData.total_sqft > 0
        ? calculateSeats(formData.total_sqft, formData.dining_area_pct, formData.sf_per_seat)
        : 0;

      const validation = validateSpaceConstraints({
        totalSF: formData.total_sqft,
        sfPerSeat: formData.use_manual_seats ? 0 : formData.sf_per_seat,
        bohPct: formData.use_manual_splits ? 0 : formData.boh_pct,
        rentPerSeatPerMonth: 0,
        conceptType: formData.density_benchmark,
      });

      setSpaceValidation(validation);

      if (!validation.valid) {
        return;
      }

      // Pre-populate bar as revenue center if bar seats exist
      const barSeats = formData.use_manual_bar_seats && formData.bar_seats
        ? parseInt(formData.bar_seats)
        : calculatedBarSeats;

      if (barSeats > 0 && !centers.some(c => c.center_name.toLowerCase() === 'bar')) {
        setCenters(prev => [...prev, { center_name: "Bar", seats: barSeats }]);
      }
    }

    // Step 2 validation removed - allow flexible seat allocation

    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      let project, scenario;

      if (editMode && existingProject) {
        // EDIT MODE: Update existing project
        const projectRes = await fetch(`/api/proforma/projects?id=${existingProject.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            concept_type: formData.concept_type,
            density_benchmark: formData.density_benchmark,
            location_city: formData.location_city || null,
            location_state: formData.location_state || null,
            total_sf: formData.total_sqft || null,
            sf_per_seat: formData.sf_per_seat,
            dining_area_pct: formData.dining_area_pct,
            boh_pct: formData.boh_pct,
            use_manual_seats: formData.use_manual_seats,
            manual_seats: formData.use_manual_seats ? formData.manual_seats : null,
            use_manual_splits: formData.use_manual_splits,
            square_feet_foh: formData.use_manual_splits ? formData.manual_foh : null,
            square_feet_boh: formData.use_manual_splits ? formData.manual_boh : null,
            bar_seats: formData.bar_seats ? parseInt(formData.bar_seats) : null,
            concept_archetype: formData.concept_archetype || null,
            bar_zone_pct: formData.bar_zone_pct || null,
            bar_net_to_gross: formData.bar_net_to_gross || null,
            standable_pct: formData.standable_pct || null,
            sf_per_standing_guest: formData.sf_per_standing_guest || null,
            utilization_factor: formData.utilization_factor || null,
            code_sf_per_person: formData.code_sf_per_person || null,
          }),
        });

        if (!projectRes.ok) {
          const errorData = await projectRes.json().catch(() => ({}));
          console.error("PATCH error response:", errorData);
          throw new Error(`Failed to update project: ${errorData.error || projectRes.statusText}`);
        }
        project = existingProject;
        scenario = existingScenario;

        // In edit mode, if user went to steps 2-3, add new centers/services
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


      } else {
        // CREATE MODE: Create new project
        const projectRes = await fetch("/api/proforma/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            concept_type: formData.concept_type,
            density_benchmark: formData.density_benchmark,
            location_city: formData.location_city || null,
            location_state: formData.location_state || null,
            org_id: organizationId,
            total_sf: formData.total_sqft || null,
            sf_per_seat: formData.sf_per_seat,
            dining_area_pct: formData.dining_area_pct,
            boh_pct: formData.boh_pct,
            use_manual_seats: formData.use_manual_seats,
            manual_seats: formData.use_manual_seats ? formData.manual_seats : null,
            use_manual_splits: formData.use_manual_splits,
            square_feet_foh: formData.use_manual_splits ? formData.manual_foh : null,
            square_feet_boh: formData.use_manual_splits ? formData.manual_boh : null,
            bar_seats: formData.bar_seats ? parseInt(formData.bar_seats) : null,
            // FP&A Standing Capacity Model
            concept_archetype: formData.concept_archetype || null,
            bar_zone_pct: formData.bar_zone_pct || null,
            bar_net_to_gross: formData.bar_net_to_gross || null,
            standable_pct: formData.standable_pct || null,
            sf_per_standing_guest: formData.sf_per_standing_guest || null,
            utilization_factor: formData.utilization_factor || null,
            code_sf_per_person: formData.code_sf_per_person || null,
          }),
        });

        if (!projectRes.ok) throw new Error("Failed to create project");
        const projectData = await projectRes.json();
        project = projectData.project;

        // 2. Create scenario
        const scenarioRes = await fetch("/api/proforma/scenarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            name: formData.scenario_name,
            months: formData.months,
            start_month: formData.start_month,
            is_base: true,
          }),
        });

        if (!scenarioRes.ok) throw new Error("Failed to create scenario");
        const scenarioData = await scenarioRes.json();
        scenario = scenarioData.scenario;

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

      }

      onOpenChange(false);
      if (editMode) {
        // In edit mode, just refresh the current page
        router.refresh();
      } else {
        // In create mode, navigate to the new project
        router.push(`/proforma/${project.id}`);
        router.refresh();
      }
    } catch (error) {
      console.error(editMode ? "Error updating project:" : "Error creating project:", error);
      alert(editMode ? `Failed to update project: ${error}` : `Failed to create project: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? "Edit Project Details" : "Create New Proforma Project"}</DialogTitle>
          <DialogDescription>
            {editMode
              ? "Update project space planning and configuration settings"
              : "Set up your new project with initial scenario and revenue streams"
            }
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
              <span className="text-xs font-medium hidden sm:inline">Centers</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 3 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${step >= 3 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                3
              </div>
              <span className="text-xs font-medium hidden sm:inline">Services</span>
            </div>
          </div>

          {/* Step 1: Project Info + Scenario */}
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
                  <SelectTrigger id="concept_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONCEPT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
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

                <div className="grid grid-cols-2 gap-4">
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
                    <Label htmlFor="density_benchmark">Seating Density Benchmark</Label>
                    <Select
                      value={formData.density_benchmark}
                      onValueChange={(value) => {
                        const benchmark = SEATING_BENCHMARKS[value];
                        const avgSFPerSeat = benchmark ? (benchmark.sfPerSeat[0] + benchmark.sfPerSeat[1]) / 2 : 20;
                        const avgDiningPct = benchmark ? (benchmark.diningAreaPct[0] + benchmark.diningAreaPct[1]) / 2 : 65;
                        setFormData({
                          ...formData,
                          density_benchmark: value,
                          sf_per_seat: avgSFPerSeat,
                          dining_area_pct: avgDiningPct,
                        });
                      }}
                    >
                      <SelectTrigger id="density_benchmark">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONCEPT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.density_benchmark && SEATING_BENCHMARKS[formData.density_benchmark] && (
                  <Card className="p-4 bg-zinc-900/50 border-zinc-800">
                    <div className="text-xs text-zinc-400 space-y-2">
                      <div className="font-semibold text-zinc-300 mb-2">
                        Industry Benchmarks ({CONCEPT_TYPES.find(t => t.value === formData.density_benchmark)?.label}):
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-zinc-500">SF/Seat:</span>{" "}
                          <span className="text-[#D4AF37]">
                            {SEATING_BENCHMARKS[formData.density_benchmark].sfPerSeat.join("–")}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Seats/1K SF:</span>{" "}
                          <span className="text-[#D4AF37]">
                            {SEATING_BENCHMARKS[formData.density_benchmark].seatsPerThousandSF.join("–")}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Dining %:</span>{" "}
                          <span className="text-[#D4AF37]">
                            {SEATING_BENCHMARKS[formData.density_benchmark].diningAreaPct.join("–")}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Dining Room Seats */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="dining_seats">Dining Room Seats</Label>
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.use_manual_seats}
                        onChange={(e) => setFormData({ ...formData, use_manual_seats: e.target.checked })}
                        className="rounded border-zinc-700 bg-zinc-900 text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      Override calculation
                    </label>
                  </div>
                  {formData.use_manual_seats ? (
                    <Input
                      id="dining_seats"
                      type="number"
                      min="0"
                      value={formData.manual_seats || ""}
                      onChange={(e) => setFormData({ ...formData, manual_seats: parseInt(e.target.value) || 0 })}
                      placeholder="Enter dining seats"
                    />
                  ) : (
                    <div className="h-10 px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900/50 flex items-center text-sm text-zinc-300">
                      {calculatedSeats} seats (Calculated: {formData.total_sqft} SF × {formData.dining_area_pct}% ÷ {formData.sf_per_seat} SF/seat)
                    </div>
                  )}
                </div>

                {/* Bar Seats */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="bar_seats">Bar Seats</Label>
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.use_manual_bar_seats || false}
                        onChange={(e) => {
                          const useManual = e.target.checked;
                          setFormData({
                            ...formData,
                            use_manual_bar_seats: useManual,
                            bar_seats: useManual ? formData.bar_seats : String(calculatedBarSeats),
                          });
                        }}
                        className="rounded border-zinc-700 bg-zinc-900 text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      Override calculation
                    </label>
                  </div>
                  {formData.use_manual_bar_seats ? (
                    <Input
                      id="bar_seats"
                      type="number"
                      min="0"
                      value={formData.bar_seats || ""}
                      onChange={(e) => setFormData({ ...formData, bar_seats: e.target.value })}
                      placeholder="Enter bar seats"
                    />
                  ) : (
                    <div className="h-10 px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900/50 flex items-center text-sm text-zinc-300">
                      {calculatedBarSeats} seats (Pre-Design Baseline: ≤25% of dining)
                    </div>
                  )}
                  <p className="text-xs text-zinc-500 mt-1">
                    Formula: FOH × 2% = bar LF (capped 22-50 LF) → ÷24" per seat → ≤25% dining seats
                  </p>
                </div>
                {/* FP&A Standing Capacity Model */}
                <div className="border-t border-zinc-800 pt-4">
                  <h5 className="font-medium text-zinc-50 mb-3">Standing Bar Capacity (FP&A Model)</h5>

                  <div className="mb-4">
                    <Label htmlFor="concept_archetype">Concept Archetype</Label>
                    <Select
                      value={formData.concept_archetype}
                      onValueChange={(value) => {
                        // Apply FP&A presets based on archetype
                        // Note: code_sf_per_person set to 7 SF (IBC A-2 unconcentrated assembly)
                        // This is appropriate for bar standing areas vs 15 SF for dining
                        const presets = {
                          balanced_resto_bar: {
                            bar_zone_pct: 15,
                            bar_net_to_gross: 0.70,
                            standable_pct: 0.60,
                            sf_per_standing_guest: 7.0,
                            utilization_factor: 0.80,
                            code_sf_per_person: 7.0
                          },
                          bar_forward: {
                            bar_zone_pct: 22,
                            bar_net_to_gross: 0.72,
                            standable_pct: 0.70,
                            sf_per_standing_guest: 6.0,
                            utilization_factor: 0.85,
                            code_sf_per_person: 7.0
                          },
                          lounge_nightlife: {
                            bar_zone_pct: 30,
                            bar_net_to_gross: 0.75,
                            standable_pct: 0.80,
                            sf_per_standing_guest: 5.5,
                            utilization_factor: 0.90,
                            code_sf_per_person: 7.0
                          },
                        };
                        const preset = presets[value as keyof typeof presets];
                        setFormData({
                          ...formData,
                          concept_archetype: value,
                          bar_zone_pct: preset.bar_zone_pct,
                          bar_net_to_gross: preset.bar_net_to_gross,
                          standable_pct: preset.standable_pct,
                          sf_per_standing_guest: preset.sf_per_standing_guest,
                          utilization_factor: preset.utilization_factor,
                          code_sf_per_person: preset.code_sf_per_person,
                        });
                      }}
                    >
                      <SelectTrigger id="concept_archetype">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced_resto_bar">Balanced Resto-Bar (15% bar zone, 7 SF/guest, 80% util) — DEFAULT</SelectItem>
                        <SelectItem value="bar_forward">Bar-Forward (22% bar zone, 6 SF/guest, 85% util)</SelectItem>
                        <SelectItem value="lounge_nightlife">Lounge/Nightlife (30% bar zone, 5.5 SF/guest, 90% util)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>


                  {formData.total_sqft > 0 && (
                    <Card className="mt-3 p-3 bg-zinc-900 border-[#D4AF37]/30">
                      <div className="text-xs space-y-2">
                        <div className="font-semibold text-[#D4AF37]">Standing Capacity Calculation:</div>
                        {(() => {
                          const barZoneGrossSF = formData.total_sqft * (formData.bar_zone_pct / 100);
                          const barZoneNetSF = barZoneGrossSF * formData.bar_net_to_gross;
                          const standableSF = barZoneNetSF * formData.standable_pct;
                          const rawGuests = standableSF / formData.sf_per_standing_guest;
                          const effectiveGuests = rawGuests * formData.utilization_factor;
                          const codeCap = standableSF / formData.code_sf_per_person;
                          const finalCapacity = Math.min(Math.floor(effectiveGuests), Math.floor(codeCap));

                          return (
                            <>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-400">
                                <div>Bar Zone Gross:</div>
                                <div className="text-zinc-300">{barZoneGrossSF.toFixed(0)} SF</div>
                                <div>Bar Zone Net:</div>
                                <div className="text-zinc-300">{barZoneNetSF.toFixed(0)} SF</div>
                                <div>Standable Area:</div>
                                <div className="text-zinc-300">{standableSF.toFixed(0)} SF</div>
                                <div>Raw Capacity:</div>
                                <div className="text-zinc-300">{rawGuests.toFixed(1)} guests</div>
                                <div>Effective (w/ util):</div>
                                <div className="text-zinc-300">{Math.floor(effectiveGuests)} guests</div>
                                <div>Code Cap:</div>
                                <div className="text-zinc-300">{Math.floor(codeCap)} guests</div>
                              </div>
                              <div className="border-t border-zinc-800 pt-2 mt-2 flex items-center justify-between">
                                <span className="font-semibold text-zinc-300">Final Standing Capacity:</span>
                                <span className="text-lg font-bold text-[#D4AF37]">{finalCapacity} guests</span>
                              </div>
                              {Math.floor(effectiveGuests) > Math.floor(codeCap) && (
                                <div className="flex items-start gap-2 mt-2 text-red-400 text-xs">
                                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  <span>Code cap binding — operational exceeds life-safety limit</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </Card>
                  )}
                </div>

                {/* Calculated Capacity */}
                {formData.total_sqft > 0 && (
                  <Card className="p-4 bg-zinc-900 border-[#D4AF37]/30">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-[#D4AF37]">
                        {formData.use_manual_seats ? "Manual" : "Calculated"} Capacity
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-400">Dining Room:</span>
                          <span className="text-xl font-bold text-zinc-50">{calculatedSeats} seats</span>
                        </div>
                        {calculatedBarSeats > 0 && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-zinc-400">Bar:</span>
                              <span className="text-xl font-bold text-zinc-50">
                                {formData.use_manual_bar_seats && formData.bar_seats
                                  ? formData.bar_seats
                                  : calculatedBarSeats} seats
                              </span>
                            </div>
                            <div className="border-t border-zinc-800 pt-2 mt-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-zinc-300">Total:</span>
                                <span className="text-2xl font-bold text-[#D4AF37]">
                                  {calculatedSeats + (formData.use_manual_bar_seats && formData.bar_seats
                                    ? parseInt(formData.bar_seats)
                                    : calculatedBarSeats)} seats
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                )}

                {(spaceValidation.errors.length > 0 || spaceValidation.warnings.length > 0) && (
                  <div className="space-y-2">
                    {spaceValidation.errors.map((error, i) => (
                      <Card key={`error-${i}`} className="p-3 bg-red-950/30 border-red-800/50">
                        <div className="flex items-start gap-2 text-sm text-red-400">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{error}</span>
                        </div>
                      </Card>
                    ))}
                    {spaceValidation.warnings.map((warning, i) => (
                      <Card key={`warning-${i}`} className="p-3 bg-yellow-950/30 border-yellow-800/50">
                        <div className="flex items-start gap-2 text-sm text-yellow-400">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{warning}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-800 pt-4 space-y-4">
                <h4 className="font-medium text-zinc-50">Projection Timeline</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="projection_months">Projection Period *</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Select
                          value={String(Math.floor(formData.months / 12))}
                          onValueChange={(value) => {
                            const years = parseInt(value);
                            const remainingMonths = formData.months % 12;
                            setFormData({ ...formData, months: years * 12 + remainingMonths });
                          }}
                        >
                          <SelectTrigger id="projection_years">
                            <SelectValue placeholder="Years" />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((years) => (
                              <SelectItem key={years} value={String(years)}>
                                {years} {years === 1 ? "Year" : "Years"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Select
                          value={String(formData.months % 12)}
                          onValueChange={(value) => {
                            const years = Math.floor(formData.months / 12);
                            const additionalMonths = parseInt(value);
                            setFormData({ ...formData, months: years * 12 + additionalMonths });
                          }}
                        >
                          <SelectTrigger id="projection_additional_months">
                            <SelectValue placeholder="Months" />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((months) => (
                              <SelectItem key={months} value={String(months)}>
                                {months} {months === 1 ? "Month" : "Months"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Total: {formData.months} months
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="start_month">Opening Month *</Label>
                    <Input
                      id="start_month"
                      type="month"
                      value={formData.start_month.substring(0, 7)}
                      onChange={(e) => setFormData({ ...formData, start_month: e.target.value + "-01" })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Revenue Centers */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Revenue Centers</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Define revenue centers like Main Dining, Patio, etc.
                </p>
              </div>

              {/* Total Capacity Summary */}
              <Card className="p-4 bg-zinc-900 border-[#D4AF37]/30">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-[#D4AF37]">Total Project Capacity</div>

                  {/* Dining Seats Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Dining Seats (to allocate):</span>
                      <span className="font-bold text-zinc-100 text-lg">{calculatedSeats}</span>
                    </div>
                  </div>

                  {/* Bar Seats Section - Separate */}
                  {calculatedBarSeats > 0 && (
                    <div className="pt-3 border-t border-zinc-700 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">Bar Seats (separate):</span>
                        <span className="font-bold text-zinc-100">
                          {formData.use_manual_bar_seats && formData.bar_seats
                            ? formData.bar_seats
                            : calculatedBarSeats}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#D4AF37]/20">
                    <span className="font-semibold text-zinc-200">Total Project Seats:</span>
                    <span className="text-xl font-bold text-[#D4AF37]">
                      {calculatedSeats + (formData.use_manual_bar_seats && formData.bar_seats
                        ? parseInt(formData.bar_seats)
                        : calculatedBarSeats)}
                    </span>
                  </div>
                </div>
              </Card>

              {centers.length > 0 && (
                <div className="space-y-2">
                  {centers.map((center, index) => (
                    <Card key={index} className="p-4 bg-zinc-900/50 border-zinc-800">
                      {editingCenterIndex === index && editingCenter ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingCenter.center_name}
                            onChange={(e) => setEditingCenter({ ...editingCenter, center_name: e.target.value })}
                            placeholder="Center name"
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            value={editingCenter.seats || ""}
                            onChange={(e) => setEditingCenter({ ...editingCenter, seats: parseInt(e.target.value) || 0 })}
                            placeholder="Seats"
                            className="w-24"
                          />
                          <Button variant="ghost" size="sm" onClick={handleSaveCenter}>
                            <Check className="w-4 h-4 text-green-400" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                            <Trash2 className="w-4 h-4 text-zinc-400" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-50 text-base">{center.center_name || "Unnamed Center"}</span>
                              {center.is_pdr && (
                                <span className="text-xs font-normal text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">PDR</span>
                              )}
                            </div>
                            <span className="text-zinc-300 font-medium">{center.seats} {center.is_pdr ? "capacity" : "seats"}</span>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <Button variant="ghost" size="sm" onClick={() => handleEditCenter(index)}>
                              <Pencil className="w-4 h-4 text-zinc-400" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveCenter(index)}>
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                  <Card className="p-3 bg-zinc-900/50 border-zinc-800">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-zinc-300">Dining Seats Allocated:</span>
                      <span className={`font-bold ${centers.filter(c => c.center_name.toLowerCase() !== 'bar').reduce((sum, c) => sum + c.seats, 0) === calculatedSeats ? 'text-[#D4AF37]' : 'text-red-400'}`}>
                        {centers.filter(c => c.center_name.toLowerCase() !== 'bar').reduce((sum, c) => sum + c.seats, 0)} / {calculatedSeats} seats
                      </span>
                    </div>
                  </Card>
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
                      placeholder={newCenter.is_pdr ? "Avg capacity" : "Seats"}
                      min="0"
                      value={newCenter.seats || ""}
                      onChange={(e) => setNewCenter({ ...newCenter, seats: parseInt(e.target.value) || 0 })}
                    />
                  </div>

                  {/* PDR Checkbox */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_pdr_new"
                      checked={newCenter.is_pdr || false}
                      onChange={(e) => setNewCenter({
                        ...newCenter,
                        is_pdr: e.target.checked,
                        max_seats: e.target.checked ? newCenter.seats : 0
                      })}
                      className="w-4 h-4 rounded border-zinc-700"
                    />
                    <Label htmlFor="is_pdr_new" className="text-sm text-zinc-300 cursor-pointer">
                      This is a Private Dining Room (PDR)
                    </Label>
                  </div>

                  {newCenter.is_pdr && (
                    <div className="ml-6 p-3 bg-zinc-900 rounded border border-zinc-700">
                      <p className="text-xs text-zinc-400 mb-2">
                        PDRs are event-based and don't use seat-turnover math like regular dining
                      </p>
                      <div>
                        <Label className="text-xs text-zinc-500">Max Capacity (optional)</Label>
                        <Input
                          type="number"
                          placeholder="Max party size"
                          min="0"
                          value={newCenter.max_seats || ""}
                          onChange={(e) => setNewCenter({ ...newCenter, max_seats: parseInt(e.target.value) || 0 })}
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  )}

                  <Button onClick={handleAddCenter} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Revenue Center
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Step 3: Service Periods */}
          {step === 3 && (
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
                    <Card key={index} className="p-4 bg-zinc-900/50 border-zinc-800">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-2">
                            <span className="font-semibold text-zinc-50 text-base">{service.service_name}</span>
                            <span className="text-zinc-400 text-sm">{service.days_per_week} days/week</span>
                          </div>
                          {service.selected_days && service.selected_days.length > 0 && (
                            <div className="flex gap-1">
                              {DAYS_OF_WEEK.map((day) => (
                                <div
                                  key={day.value}
                                  className={`px-2 py-1 text-xs rounded ${
                                    service.selected_days?.includes(day.value)
                                      ? "bg-[#D4AF37] text-black font-semibold"
                                      : "bg-zinc-800 text-zinc-600"
                                  }`}
                                >
                                  {day.label}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveService(index)}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="p-4 border-dashed">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="service_name" className="text-xs text-zinc-500">Service name</Label>
                    <Input
                      id="service_name"
                      placeholder="e.g., Breakfast, Lunch, Dinner"
                      value={newService.service_name}
                      onChange={(e) => setNewService({ ...newService, service_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500 mb-2 block">Days/week</Label>
                    <div className="flex gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                            newService.selected_days?.includes(day.value)
                              ? "bg-[#D4AF37] text-black border-[#D4AF37] font-semibold"
                              : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-600"
                          }`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleAddService} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Service Period
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
              editMode && step === 1 ? (
                <Button onClick={handleFinish} disabled={loading}>
                  <Check className="w-4 h-4 mr-2" />
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )
            ) : (
              <Button onClick={handleFinish} disabled={loading}>
                <Check className="w-4 h-4 mr-2" />
                {loading
                  ? (editMode ? "Saving..." : "Creating...")
                  : (editMode ? "Save Changes" : "Create Project")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
