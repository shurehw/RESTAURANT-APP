"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CONCEPT_TYPES } from "@/lib/proforma/constants";
import { Save, Download, Upload, Trash2, Star, ArrowLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface ProformaSettingsClientProps {
  settings: any;
  orgId: string;
}

export function ProformaSettingsClient({ settings, orgId }: ProformaSettingsClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Preset management state
  const [presets, setPresets] = useState<any[]>([]);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [loadPresetDialogOpen, setLoadPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [setAsOrgDefault, setSetAsOrgDefault] = useState(false);
  const [currentPresetName, setCurrentPresetName] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    // Seating & Space
    default_density_benchmark: settings?.default_density_benchmark || "casual-dining",
    default_sf_per_seat: settings?.default_sf_per_seat || 20,
    default_dining_area_pct: settings?.default_dining_area_pct || 65,
    default_boh_pct: settings?.default_boh_pct || 30,

    // Bar Calculations (Seated)
    bar_lf_ratio: settings?.bar_lf_ratio || 0.0120,
    bar_min_lf: settings?.bar_min_lf || 15,
    bar_max_lf: settings?.bar_max_lf || 35,
    bar_inches_per_seat: settings?.bar_inches_per_seat || 24,
    bar_max_pct_of_dining: settings?.bar_max_pct_of_dining || 25,

    // FP&A Standing Capacity Model
    default_concept_archetype: settings?.default_concept_archetype || "balanced_resto_bar",
    default_bar_zone_pct: settings?.default_bar_zone_pct || 15.00,
    default_bar_net_to_gross: settings?.default_bar_net_to_gross || 0.70,
    default_standable_pct: settings?.default_standable_pct || 0.60,
    default_sf_per_standing_guest: settings?.default_sf_per_standing_guest || 7.00,
    default_utilization_factor: settings?.default_utilization_factor || 0.80,
    default_code_sf_per_person: settings?.default_code_sf_per_person || 7.00,

    // Revenue Mix
    default_food_mix_pct: settings?.default_food_mix_pct || 60,
    default_bev_mix_pct: settings?.default_bev_mix_pct || 35,
    default_other_mix_pct: settings?.default_other_mix_pct || 5,

    // Ramp
    default_ramp_months: settings?.default_ramp_months || 12,
    default_ramp_start_pct: settings?.default_ramp_start_pct || 80,
    default_ramp_curve: settings?.default_ramp_curve || "linear",

    // Day of Week Distribution
    default_dow_monday_pct: settings?.default_dow_monday_pct || 14.3,
    default_dow_tuesday_pct: settings?.default_dow_tuesday_pct || 14.3,
    default_dow_wednesday_pct: settings?.default_dow_wednesday_pct || 14.3,
    default_dow_thursday_pct: settings?.default_dow_thursday_pct || 14.3,
    default_dow_friday_pct: settings?.default_dow_friday_pct || 14.3,
    default_dow_saturday_pct: settings?.default_dow_saturday_pct || 14.3,
    default_dow_sunday_pct: settings?.default_dow_sunday_pct || 14.2,

    // PDR (Private Dining Room)
    default_pdr_capacity: settings?.default_pdr_capacity || 20,
    default_pdr_events_per_month: settings?.default_pdr_events_per_month || 8,
    default_pdr_avg_spend_per_person: settings?.default_pdr_avg_spend_per_person || 150,
    default_pdr_avg_party_size: settings?.default_pdr_avg_party_size || 15,
    default_pdr_ramp_months: settings?.default_pdr_ramp_months || 12,
    default_pdr_food_pct: settings?.default_pdr_food_pct || 60,
    default_pdr_bev_pct: settings?.default_pdr_bev_pct || 35,
    default_pdr_other_pct: settings?.default_pdr_other_pct || 5,

    // Service Periods
    default_service_days_per_week: settings?.default_service_days_per_week || 7,
    default_services_per_day: settings?.default_services_per_day || 2,
    default_service_hours: settings?.default_service_hours || 3.0,
    default_avg_dining_time_hours: settings?.default_avg_dining_time_hours || 1.5,
    default_utilization_pct: settings?.default_utilization_pct || 65,

    // Bar Operations
    default_bar_rail_ft_per_guest: settings?.default_bar_rail_ft_per_guest || 2.0,
    default_realization_rate: settings?.default_realization_rate || 0.90,

    // Concept Benchmarks - Fast Casual
    fast_casual_sf_per_seat_min: settings?.fast_casual_sf_per_seat_min || 12,
    fast_casual_sf_per_seat_max: settings?.fast_casual_sf_per_seat_max || 18,
    fast_casual_dining_area_pct_min: settings?.fast_casual_dining_area_pct_min || 55,
    fast_casual_dining_area_pct_max: settings?.fast_casual_dining_area_pct_max || 65,

    // Casual Dining
    casual_dining_sf_per_seat_min: settings?.casual_dining_sf_per_seat_min || 18,
    casual_dining_sf_per_seat_max: settings?.casual_dining_sf_per_seat_max || 22,
    casual_dining_dining_area_pct_min: settings?.casual_dining_dining_area_pct_min || 60,
    casual_dining_dining_area_pct_max: settings?.casual_dining_dining_area_pct_max || 70,

    // Premium Casual
    premium_casual_sf_per_seat_min: settings?.premium_casual_sf_per_seat_min || 22,
    premium_casual_sf_per_seat_max: settings?.premium_casual_sf_per_seat_max || 26,
    premium_casual_dining_area_pct_min: settings?.premium_casual_dining_area_pct_min || 65,
    premium_casual_dining_area_pct_max: settings?.premium_casual_dining_area_pct_max || 75,

    // Fine Dining
    fine_dining_sf_per_seat_min: settings?.fine_dining_sf_per_seat_min || 28,
    fine_dining_sf_per_seat_max: settings?.fine_dining_sf_per_seat_max || 40,
    fine_dining_dining_area_pct_min: settings?.fine_dining_dining_area_pct_min || 70,
    fine_dining_dining_area_pct_max: settings?.fine_dining_dining_area_pct_max || 80,

    // Bar Lounge
    bar_lounge_sf_per_seat_min: settings?.bar_lounge_sf_per_seat_min || 14,
    bar_lounge_sf_per_seat_max: settings?.bar_lounge_sf_per_seat_max || 20,
    bar_lounge_dining_area_pct_min: settings?.bar_lounge_dining_area_pct_min || 50,
    bar_lounge_dining_area_pct_max: settings?.bar_lounge_dining_area_pct_max || 65,

    // Nightclub
    nightclub_sf_per_seat_min: settings?.nightclub_sf_per_seat_min || 7,
    nightclub_sf_per_seat_max: settings?.nightclub_sf_per_seat_max || 10,
    nightclub_dining_area_pct_min: settings?.nightclub_dining_area_pct_min || 60,
    nightclub_dining_area_pct_max: settings?.nightclub_dining_area_pct_max || 80,

    // Validation Thresholds
    min_boh_pct: settings?.min_boh_pct || 25,
    max_rent_per_seat_warning: settings?.max_rent_per_seat_warning || 250,

    // Calendar Constants
    days_per_year: settings?.days_per_year || 360,
    weeks_per_year: settings?.weeks_per_year || 52,
    avg_days_per_month: settings?.avg_days_per_month || 30,

    // Projections
    default_projection_years: settings?.default_projection_years || 5,

    // COGS
    default_food_cogs_pct: settings?.default_food_cogs_pct || 28,
    default_bev_cogs_pct: settings?.default_bev_cogs_pct || 22,
    default_other_cogs_pct: settings?.default_other_cogs_pct || 20,

    // Labor
    default_foh_hours_per_100_covers: settings?.default_foh_hours_per_100_covers || 12,
    default_boh_hours_per_100_covers: settings?.default_boh_hours_per_100_covers || 8,
    default_foh_hourly_rate: settings?.default_foh_hourly_rate || 18,
    default_boh_hourly_rate: settings?.default_boh_hourly_rate || 20,
    default_payroll_burden_pct: settings?.default_payroll_burden_pct || 25,

    // OpEx
    default_linen_pct: settings?.default_linen_pct || 1.5,
    default_smallwares_pct: settings?.default_smallwares_pct || 1.0,
    default_cleaning_pct: settings?.default_cleaning_pct || 0.5,
    default_cc_fees_pct: settings?.default_cc_fees_pct || 2.5,
    default_marketing_pct: settings?.default_marketing_pct || 3.0,
    default_gna_pct: settings?.default_gna_pct || 5.0,
  });

  // Fetch presets on mount
  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const response = await fetch("/api/settings/proforma/presets");
        if (response.ok) {
          const data = await response.json();
          setPresets(data);
        }
      } catch (error) {
        console.error("Error fetching presets:", error);
      }
    };
    fetchPresets();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/proforma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, ...formData }),
      });

      if (!response.ok) throw new Error("Failed to save settings");

      router.refresh();
      alert("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentAsPreset = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/proforma/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset_name: newPresetName,
          description: newPresetDescription,
          settings: formData,
          is_org_default: setAsOrgDefault,
        }),
      });

      if (!response.ok) throw new Error("Failed to save preset");

      // Refresh presets list
      const presetsResponse = await fetch("/api/settings/proforma/presets");
      if (presetsResponse.ok) {
        const data = await presetsResponse.json();
        setPresets(data);
      }

      // Close dialog and reset form
      setSavePresetDialogOpen(false);
      setNewPresetName("");
      setNewPresetDescription("");
      setSetAsOrgDefault(false);
      setCurrentPresetName(newPresetName);
      alert("Preset saved successfully");
    } catch (error) {
      console.error("Error saving preset:", error);
      alert("Failed to save preset");
    } finally {
      setLoading(false);
    }
  };

  const loadPreset = async (presetId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/settings/proforma/presets?id=${presetId}`);
      if (!response.ok) throw new Error("Failed to load preset");

      const preset = await response.json();
      setFormData(preset.settings);
      setCurrentPresetName(preset.preset_name);
      setLoadPresetDialogOpen(false);
      alert(`Loaded preset: ${preset.preset_name}`);
    } catch (error) {
      console.error("Error loading preset:", error);
      alert("Failed to load preset");
    } finally {
      setLoading(false);
    }
  };

  const deletePreset = async (presetId: string) => {
    if (!confirm("Are you sure you want to delete this preset?")) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/settings/proforma/presets?id=${presetId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete preset");

      // Refresh presets list
      const presetsResponse = await fetch("/api/settings/proforma/presets");
      if (presetsResponse.ok) {
        const data = await presetsResponse.json();
        setPresets(data);
      }

      alert("Preset deleted successfully");
    } catch (error) {
      console.error("Error deleting preset:", error);
      alert("Failed to delete preset");
    } finally {
      setLoading(false);
    }
  };

  const resetToSystemDefaults = async () => {
    if (!confirm("Reset all settings to baseline defaults? This will load standard industry benchmarks.")) return;

    setLoading(true);
    try {
      // Find the Premium Casual preset as the baseline (most common/balanced)
      const baselinePreset = presets.find(p => p.preset_name === 'Premium Casual / Full Service' && p.is_system);

      if (!baselinePreset) {
        alert("System default preset not found");
        return;
      }

      // Load the preset values
      setFormData(baselinePreset.settings);
      setCurrentPresetName(null); // Clear current preset name
      alert("Reset to baseline defaults (Premium Casual). Click 'Save Changes' to apply.");
    } catch (error) {
      console.error("Error resetting to defaults:", error);
      alert("Failed to reset to defaults");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/proforma')}
              className="text-zinc-400 hover:text-zinc-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Proforma
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-zinc-50">Proforma Settings</h1>
              <p className="text-sm text-zinc-400 mt-1">
                Configure default assumptions for new proforma projects
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {/* Configuration Presets */}
        <Card className="p-6 bg-white border-gray-300">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Configuration Presets</h2>
          <p className="text-sm text-gray-700 mb-4">Save and load configuration templates for different use cases</p>

          {/* Current Preset Status */}
          <div className="bg-gray-100 p-4 rounded border border-gray-300 mb-4">
            <Label className="text-base font-semibold text-gray-900">Current Configuration</Label>
            <p className="text-sm text-gray-700 mt-1">
              {currentPresetName ? (
                <span className="text-gray-900 font-medium">{currentPresetName}</span>
              ) : (
                <span className="text-gray-600">Custom Configuration</span>
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button
              variant="outline"
              onClick={resetToSystemDefaults}
              disabled={loading}
              className="bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-900"
            >
              Reset to System Defaults
            </Button>

            <Dialog open={savePresetDialogOpen} onOpenChange={setSavePresetDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="bg-white border-gray-300 hover:bg-gray-50 text-gray-900">
                  <Save className="w-4 h-4 mr-2" />
                  Save Current Settings As...
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader>
                  <DialogTitle className="text-zinc-50">Save Configuration Preset</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    Save your current settings as a reusable preset
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="preset-name" className="text-zinc-300">Preset Name</Label>
                    <Input
                      id="preset-name"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g., Fine Dining Default"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                    />
                  </div>
                  <div>
                    <Label htmlFor="preset-description" className="text-zinc-300">Description</Label>
                    <Textarea
                      id="preset-description"
                      value={newPresetDescription}
                      onChange={(e) => setNewPresetDescription(e.target.value)}
                      placeholder="Brief description of this preset..."
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="org-default"
                      checked={setAsOrgDefault}
                      onChange={(e) => setSetAsOrgDefault(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800"
                    />
                    <Label htmlFor="org-default" className="text-zinc-300 text-sm cursor-pointer">
                      Set as organization default
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSavePresetDialogOpen(false)}
                    className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveCurrentAsPreset}
                    disabled={!newPresetName.trim() || loading}
                    className="bg-zinc-700 hover:bg-zinc-600"
                  >
                    Save Preset
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={loadPresetDialogOpen} onOpenChange={setLoadPresetDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="bg-white border-gray-300 hover:bg-gray-50 text-gray-900">
                  <Upload className="w-4 h-4 mr-2" />
                  Load Preset...
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-zinc-50">Load Configuration Preset</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    Select a preset to load its settings
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 max-h-96 overflow-y-auto">
                  {presets.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-8">No presets available</p>
                  ) : (
                    <div className="space-y-2">
                      {presets.map((preset) => (
                        <div
                          key={preset.id}
                          className={`p-4 rounded border ${
                            preset.is_org_default
                              ? "bg-[#D4AF37]/10 border-[#D4AF37]/30"
                              : "bg-zinc-800/30 border-zinc-700"
                          } hover:bg-zinc-800/50 transition-colors`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {preset.is_system && (
                                  <Star className="w-4 h-4 text-[#D4AF37]" fill="#D4AF37" />
                                )}
                                <h3 className="font-semibold text-zinc-200">{preset.preset_name}</h3>
                                {preset.is_org_default && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                                    Org Default
                                  </span>
                                )}
                              </div>
                              {preset.description && (
                                <p className="text-sm text-zinc-400 mt-1">{preset.description}</p>
                              )}
                              <p className="text-xs text-zinc-500 mt-2">
                                Created: {new Date(preset.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex gap-2 ml-4">
                              <Button
                                size="sm"
                                onClick={() => loadPreset(preset.id)}
                                disabled={loading}
                                className="bg-zinc-700 hover:bg-zinc-600"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Load
                              </Button>
                              {!preset.is_system && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deletePreset(preset.id)}
                                  disabled={loading}
                                  className="bg-zinc-800 border-zinc-700 hover:bg-red-900/20 hover:border-red-700"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setLoadPresetDialogOpen(false)}
                    className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Available Presets List */}
          {presets.length > 0 && (
            <div className="bg-gray-100 p-4 rounded border border-gray-300">
              <Label className="text-base font-semibold text-gray-900 mb-3 block">Available Presets</Label>
              <div className="space-y-2">
                {presets.slice(0, 3).map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-3 rounded bg-white border border-gray-300"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {preset.is_system && (
                        <Star className="w-4 h-4 text-[#D4AF37]" fill="#D4AF37" />
                      )}
                      <span className="text-base text-gray-900 font-medium">{preset.preset_name}</span>
                      {preset.is_org_default && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#D4AF37]/20 text-[#D4AF37]">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => loadPreset(preset.id)}
                        disabled={loading}
                        className="h-7 px-2 text-xs hover:bg-zinc-700"
                      >
                        Load
                      </Button>
                      {!preset.is_system && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deletePreset(preset.id)}
                          disabled={loading}
                          className="h-7 px-2 text-xs hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {presets.length > 3 && (
                  <button
                    onClick={() => setLoadPresetDialogOpen(true)}
                    className="text-xs text-zinc-400 hover:text-zinc-300 mt-2"
                  >
                    View all {presets.length} presets...
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Space Planning & Seating with Industry Benchmarks */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Space Planning & Industry Benchmarks</h2>
          <p className="text-xs text-zinc-400 mb-4">Default seating assumptions and industry-standard SF/seat ranges by concept type</p>

          <div className="space-y-6">
            {/* Concept Selection */}
            <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
              <Label htmlFor="default_density_benchmark" className="text-sm font-semibold text-zinc-300">Concept Type</Label>
              <p className="text-xs text-zinc-400 mb-3 mt-1">Select concept to configure industry benchmarks and default ranges</p>
              <Select
                value={formData.default_density_benchmark}
                onValueChange={(value) => setFormData({ ...formData, default_density_benchmark: value })}
              >
                <SelectTrigger id="default_density_benchmark">
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

            {/* Industry Benchmarks for Selected Concept */}
            <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                {formData.default_density_benchmark === 'fast-casual' && 'Fast Casual / QSR Benchmarks'}
                {formData.default_density_benchmark === 'casual-dining' && 'Casual Dining Benchmarks'}
                {formData.default_density_benchmark === 'premium-casual' && 'Premium Casual / Full Service Benchmarks'}
                {formData.default_density_benchmark === 'fine-dining' && 'Fine Dining Benchmarks'}
                {formData.default_density_benchmark === 'bar-lounge' && 'Bar / Cocktail Lounge Benchmarks'}
                {formData.default_density_benchmark === 'nightclub' && 'Nightclub / Standing Benchmarks'}
              </h3>
              <p className="text-xs text-zinc-400 mb-3">
                {formData.default_density_benchmark === 'fast-casual' && 'Recommended: 12-18 SF/seat, 55-65% dining area'}
                {formData.default_density_benchmark === 'casual-dining' && 'Recommended: 18-22 SF/seat, 60-70% dining area'}
                {formData.default_density_benchmark === 'premium-casual' && 'Recommended: 22-26 SF/seat, 65-75% dining area'}
                {formData.default_density_benchmark === 'fine-dining' && 'Recommended: 28-40 SF/seat, 70-80% dining area'}
                {formData.default_density_benchmark === 'bar-lounge' && 'Recommended: 14-20 SF/seat, 50-65% dining area'}
                {formData.default_density_benchmark === 'nightclub' && 'Recommended: 7-10 SF/seat, 60-80% dining area'}
              </p>

              {/* Benchmark Inputs for Selected Concept */}
              <div className="grid grid-cols-2 gap-3">
                {formData.default_density_benchmark === 'fast-casual' && (
                  <>
                    <div>
                      <Label className="text-xs">SF/Seat Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.fast_casual_sf_per_seat_min} onChange={(e) => setFormData({ ...formData, fast_casual_sf_per_seat_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.fast_casual_sf_per_seat_min + formData.fast_casual_sf_per_seat_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.fast_casual_sf_per_seat_max} onChange={(e) => setFormData({ ...formData, fast_casual_sf_per_seat_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Dining Area % Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.fast_casual_dining_area_pct_min} onChange={(e) => setFormData({ ...formData, fast_casual_dining_area_pct_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.fast_casual_dining_area_pct_min + formData.fast_casual_dining_area_pct_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.fast_casual_dining_area_pct_max} onChange={(e) => setFormData({ ...formData, fast_casual_dining_area_pct_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {formData.default_density_benchmark === 'casual-dining' && (
                  <>
                    <div>
                      <Label className="text-xs">SF/Seat Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.casual_dining_sf_per_seat_min} onChange={(e) => setFormData({ ...formData, casual_dining_sf_per_seat_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.casual_dining_sf_per_seat_min + formData.casual_dining_sf_per_seat_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.casual_dining_sf_per_seat_max} onChange={(e) => setFormData({ ...formData, casual_dining_sf_per_seat_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Dining Area % Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.casual_dining_dining_area_pct_min} onChange={(e) => setFormData({ ...formData, casual_dining_dining_area_pct_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.casual_dining_dining_area_pct_min + formData.casual_dining_dining_area_pct_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.casual_dining_dining_area_pct_max} onChange={(e) => setFormData({ ...formData, casual_dining_dining_area_pct_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {formData.default_density_benchmark === 'premium-casual' && (
                  <>
                    <div>
                      <Label className="text-xs">SF/Seat Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.premium_casual_sf_per_seat_min} onChange={(e) => setFormData({ ...formData, premium_casual_sf_per_seat_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.premium_casual_sf_per_seat_min + formData.premium_casual_sf_per_seat_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.premium_casual_sf_per_seat_max} onChange={(e) => setFormData({ ...formData, premium_casual_sf_per_seat_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Dining Area % Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.premium_casual_dining_area_pct_min} onChange={(e) => setFormData({ ...formData, premium_casual_dining_area_pct_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.premium_casual_dining_area_pct_min + formData.premium_casual_dining_area_pct_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.premium_casual_dining_area_pct_max} onChange={(e) => setFormData({ ...formData, premium_casual_dining_area_pct_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {formData.default_density_benchmark === 'fine-dining' && (
                  <>
                    <div>
                      <Label className="text-xs">SF/Seat Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.fine_dining_sf_per_seat_min} onChange={(e) => setFormData({ ...formData, fine_dining_sf_per_seat_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.fine_dining_sf_per_seat_min + formData.fine_dining_sf_per_seat_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.fine_dining_sf_per_seat_max} onChange={(e) => setFormData({ ...formData, fine_dining_sf_per_seat_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Dining Area % Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.fine_dining_dining_area_pct_min} onChange={(e) => setFormData({ ...formData, fine_dining_dining_area_pct_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.fine_dining_dining_area_pct_min + formData.fine_dining_dining_area_pct_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.fine_dining_dining_area_pct_max} onChange={(e) => setFormData({ ...formData, fine_dining_dining_area_pct_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {formData.default_density_benchmark === 'bar-lounge' && (
                  <>
                    <div>
                      <Label className="text-xs">SF/Seat Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.bar_lounge_sf_per_seat_min} onChange={(e) => setFormData({ ...formData, bar_lounge_sf_per_seat_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.bar_lounge_sf_per_seat_min + formData.bar_lounge_sf_per_seat_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.bar_lounge_sf_per_seat_max} onChange={(e) => setFormData({ ...formData, bar_lounge_sf_per_seat_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Dining Area % Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.bar_lounge_dining_area_pct_min} onChange={(e) => setFormData({ ...formData, bar_lounge_dining_area_pct_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.bar_lounge_dining_area_pct_min + formData.bar_lounge_dining_area_pct_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.bar_lounge_dining_area_pct_max} onChange={(e) => setFormData({ ...formData, bar_lounge_dining_area_pct_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {formData.default_density_benchmark === 'nightclub' && (
                  <>
                    <div>
                      <Label className="text-xs">SF/Seat Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.nightclub_sf_per_seat_min} onChange={(e) => setFormData({ ...formData, nightclub_sf_per_seat_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.nightclub_sf_per_seat_min + formData.nightclub_sf_per_seat_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.nightclub_sf_per_seat_max} onChange={(e) => setFormData({ ...formData, nightclub_sf_per_seat_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Dining Area % Range</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <Input type="number" step="0.1" value={formData.nightclub_dining_area_pct_min} onChange={(e) => setFormData({ ...formData, nightclub_dining_area_pct_min: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Min</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={((formData.nightclub_dining_area_pct_min + formData.nightclub_dining_area_pct_max) / 2).toFixed(1)} className="h-8 text-xs bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37] font-semibold" disabled />
                          <p className="text-xs text-[#D4AF37] mt-0.5">Suggested</p>
                        </div>
                        <div>
                          <Input type="number" step="0.1" value={formData.nightclub_dining_area_pct_max} onChange={(e) => setFormData({ ...formData, nightclub_dining_area_pct_max: parseFloat(e.target.value) })} className="h-8 text-xs" />
                          <p className="text-xs text-zinc-400 mt-0.5">Max</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Bar Seat Calculation Formula (Seated Bars) */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Bar Seat Calculation (Seated Bars)</h2>
          <p className="text-xs text-zinc-400 mb-4">Pre-Design Constrained Baseline (Conservative)</p>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="bar_lf_ratio">FOH → Bar Linear Feet Ratio (%)</Label>
                <Input
                  id="bar_lf_ratio"
                  type="number"
                  step="0.01"
                  value={(formData.bar_lf_ratio * 100).toFixed(2)}
                  onChange={(e) => setFormData({ ...formData, bar_lf_ratio: parseFloat(e.target.value) / 100 })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 2.0% of FOH square footage</p>
              </div>
              <div>
                <Label htmlFor="bar_min_lf">Min Bar Linear Feet</Label>
                <Input
                  id="bar_min_lf"
                  type="number"
                  value={formData.bar_min_lf}
                  onChange={(e) => setFormData({ ...formData, bar_min_lf: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 22 LF</p>
              </div>
              <div>
                <Label htmlFor="bar_max_lf">Max Bar Linear Feet</Label>
                <Input
                  id="bar_max_lf"
                  type="number"
                  value={formData.bar_max_lf}
                  onChange={(e) => setFormData({ ...formData, bar_max_lf: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 50 LF</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bar_inches_per_seat">Inches per Bar Seat</Label>
                <Input
                  id="bar_inches_per_seat"
                  type="number"
                  value={formData.bar_inches_per_seat}
                  onChange={(e) => setFormData({ ...formData, bar_inches_per_seat: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 24" (comfort spacing)</p>
              </div>
              <div>
                <Label htmlFor="bar_max_pct_of_dining">Max Bar % of Dining Seats</Label>
                <Input
                  id="bar_max_pct_of_dining"
                  type="number"
                  value={formData.bar_max_pct_of_dining}
                  onChange={(e) => setFormData({ ...formData, bar_max_pct_of_dining: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 25% (prevents over-allocation)</p>
              </div>
            </div>

            {/* Calculation Chain Reference */}
            <div className="bg-zinc-900/50 p-4 rounded border border-zinc-700">
              <div className="text-xs text-zinc-400 space-y-2">
                <div className="text-[#D4AF37] font-semibold mb-2">How Bar Seats Are Calculated:</div>
                <div><span className="text-zinc-300 font-semibold">Step 1:</span> Calculate bar length from FOH square footage using the ratio (2% of FOH SF)</div>
                <div><span className="text-zinc-300 font-semibold">Step 2:</span> Keep bar length within min/max bounds (22-50 LF)</div>
                <div><span className="text-zinc-300 font-semibold">Step 3:</span> Convert bar length to seats (bar LF × 12 inches ÷ inches per seat)</div>
                <div><span className="text-zinc-300 font-semibold">Step 4:</span> Cap bar seats at max % of dining seats (prevents too many bar seats)</div>

                <div className="text-[#D4AF37] font-semibold mt-4 mb-2">Example Walkthrough (2,000 SF FOH):</div>
                <div className="pl-3 space-y-1">
                  <div>• FOH is 2,000 SF → Bar gets 2,000 × 2% = <span className="text-zinc-200">40 linear feet</span></div>
                  <div>• 40 LF is within 22-50 range → Keep at <span className="text-zinc-200">40 LF</span></div>
                  <div>• 40 LF × 12 inches = 480 inches ÷ 24" per seat = <span className="text-zinc-200">20 bar seats</span></div>
                  <div>• If you have 100 dining seats, max bar seats = 100 × 25% = 25 seats</div>
                  <div>• Final: <span className="text-[#D4AF37] font-semibold">20 bar seats</span> (under the 25-seat cap ✓)</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* FP&A Standing Bar Capacity Model */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Standing Bar Capacity (FP&A Model)</h2>
          <p className="text-xs text-zinc-400 mb-4">
            Deterministic, auditable calculation chain for IC/partner reviews
          </p>

          <div className="space-y-6">
            {/* Concept Archetype Selector */}
            <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
              <Label htmlFor="default_concept_archetype" className="text-sm font-semibold text-zinc-300">Concept Archetype</Label>
              <p className="text-xs text-zinc-400 mb-3 mt-1">Select archetype to configure standing bar capacity calculations</p>
              <Select
                value={formData.default_concept_archetype}
                onValueChange={(value) => {
                  // Apply preset values when archetype changes
                  const presets = {
                    balanced_resto_bar: { bar_zone_pct: 15, bar_net_to_gross: 0.70, standable_pct: 0.60, sf_per_standing_guest: 7.0, utilization_factor: 0.80, code_sf_per_person: 7.0 },
                    bar_forward: { bar_zone_pct: 22, bar_net_to_gross: 0.72, standable_pct: 0.70, sf_per_standing_guest: 6.0, utilization_factor: 0.85, code_sf_per_person: 7.0 },
                    lounge_nightlife: { bar_zone_pct: 30, bar_net_to_gross: 0.75, standable_pct: 0.80, sf_per_standing_guest: 5.5, utilization_factor: 0.90, code_sf_per_person: 7.0 },
                  };
                  const preset = presets[value as keyof typeof presets];
                  setFormData({
                    ...formData,
                    default_concept_archetype: value,
                    default_bar_zone_pct: preset.bar_zone_pct,
                    default_bar_net_to_gross: preset.bar_net_to_gross,
                    default_standable_pct: preset.standable_pct,
                    default_sf_per_standing_guest: preset.sf_per_standing_guest,
                    default_utilization_factor: preset.utilization_factor,
                    default_code_sf_per_person: preset.code_sf_per_person,
                  });
                }}
              >
                <SelectTrigger id="default_concept_archetype">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced_resto_bar">Balanced Resto-Bar</SelectItem>
                  <SelectItem value="bar_forward">Bar-Forward</SelectItem>
                  <SelectItem value="lounge_nightlife">Lounge/Nightlife</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* FP&A Calculation Inputs */}
            <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_bar_zone_pct">Bar Zone % of Gross SF</Label>
                <Input
                  id="default_bar_zone_pct"
                  type="number"
                  step="0.01"
                  value={formData.default_bar_zone_pct}
                  onChange={(e) => setFormData({ ...formData, default_bar_zone_pct: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  {formData.default_concept_archetype === 'balanced_resto_bar' && 'Recommended: 15%'}
                  {formData.default_concept_archetype === 'bar_forward' && 'Recommended: 22%'}
                  {formData.default_concept_archetype === 'lounge_nightlife' && 'Recommended: 30%'}
                </p>
              </div>
              <div>
                <Label htmlFor="default_bar_net_to_gross">Net-to-Gross Ratio</Label>
                <Input
                  id="default_bar_net_to_gross"
                  type="number"
                  step="0.01"
                  value={formData.default_bar_net_to_gross}
                  onChange={(e) => setFormData({ ...formData, default_bar_net_to_gross: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  {formData.default_concept_archetype === 'balanced_resto_bar' && 'Recommended: 0.70 (70%)'}
                  {formData.default_concept_archetype === 'bar_forward' && 'Recommended: 0.72 (72%)'}
                  {formData.default_concept_archetype === 'lounge_nightlife' && 'Recommended: 0.75 (75%)'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_standable_pct">Standable % of Net</Label>
                <Input
                  id="default_standable_pct"
                  type="number"
                  step="0.01"
                  value={formData.default_standable_pct}
                  onChange={(e) => setFormData({ ...formData, default_standable_pct: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  {formData.default_concept_archetype === 'balanced_resto_bar' && 'Recommended: 0.60 (60%)'}
                  {formData.default_concept_archetype === 'bar_forward' && 'Recommended: 0.70 (70%)'}
                  {formData.default_concept_archetype === 'lounge_nightlife' && 'Recommended: 0.80 (80%)'}
                </p>
              </div>
              <div>
                <Label htmlFor="default_sf_per_standing_guest">SF per Standing Guest</Label>
                <Input
                  id="default_sf_per_standing_guest"
                  type="number"
                  step="0.1"
                  value={formData.default_sf_per_standing_guest}
                  onChange={(e) => setFormData({ ...formData, default_sf_per_standing_guest: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  {formData.default_concept_archetype === 'balanced_resto_bar' && 'Recommended: 7.0 SF/guest'}
                  {formData.default_concept_archetype === 'bar_forward' && 'Recommended: 6.0 SF/guest'}
                  {formData.default_concept_archetype === 'lounge_nightlife' && 'Recommended: 5.5 SF/guest'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_utilization_factor">Utilization Factor</Label>
                <Input
                  id="default_utilization_factor"
                  type="number"
                  step="0.01"
                  value={formData.default_utilization_factor}
                  onChange={(e) => setFormData({ ...formData, default_utilization_factor: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  {formData.default_concept_archetype === 'balanced_resto_bar' && 'Recommended: 0.80 (80%)'}
                  {formData.default_concept_archetype === 'bar_forward' && 'Recommended: 0.85 (85%)'}
                  {formData.default_concept_archetype === 'lounge_nightlife' && 'Recommended: 0.90 (90%)'}
                </p>
              </div>
              <div>
                <Label htmlFor="default_code_sf_per_person">Code SF/Person (Life Safety)</Label>
                <Input
                  id="default_code_sf_per_person"
                  type="number"
                  step="0.1"
                  value={formData.default_code_sf_per_person}
                  onChange={(e) => setFormData({ ...formData, default_code_sf_per_person: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 7 SF/person (verify with AHJ)</p>
              </div>
            </div>
            </div>

            {/* Calculation Chain Reference */}
            <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
              <div className="text-xs text-zinc-400 space-y-2">
                <div className="text-[#D4AF37] font-semibold mb-2">How Standing Bar Capacity Is Calculated:</div>
                <div><span className="text-zinc-300 font-semibold">Step 1:</span> Calculate total bar zone area from building SF (15% of total SF)</div>
                <div><span className="text-zinc-300 font-semibold">Step 2:</span> Convert to usable space after walls/circulation (net-to-gross ratio of 70%)</div>
                <div><span className="text-zinc-300 font-semibold">Step 3:</span> Find standable area excluding bar structure, POS, storage (60% of net SF)</div>
                <div><span className="text-zinc-300 font-semibold">Step 4:</span> Calculate theoretical capacity (standable SF ÷ 8 SF per guest)</div>
                <div><span className="text-zinc-300 font-semibold">Step 5:</span> Apply utilization factor for realistic peak capacity (85% of theoretical)</div>
                <div><span className="text-zinc-300 font-semibold">Step 6:</span> Cap at code-required max (whichever is lower: our calc or code limit)</div>

                <div className="text-[#D4AF37] font-semibold mt-4 mb-2">Example Walkthrough (5,000 SF Building):</div>
                <div className="pl-3 space-y-1">
                  <div>• Building is 5,000 SF → Bar zone gets 5,000 × 15% = <span className="text-zinc-200">750 SF gross</span></div>
                  <div>• After walls/circulation: 750 × 70% = <span className="text-zinc-200">525 SF net</span></div>
                  <div>• Standable area (excludes bar, POS): 525 × 60% = <span className="text-zinc-200">315 SF</span></div>
                  <div>• Theoretical capacity: 315 ÷ 8 SF per guest = <span className="text-zinc-200">39 guests</span></div>
                  <div>• Realistic peak: 39 × 85% = <span className="text-zinc-200">33 standing guests</span></div>
                  <div>• Code max (if 15 SF/person): 5,000 ÷ 15 = 333 total occupancy</div>
                  <div>• Final: <span className="text-[#D4AF37] font-semibold">33 standing guests</span> (well under code limit ✓)</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Default Projection Period */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Projection Defaults</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
            <Label htmlFor="default_projection_years">Default Projection Period (Years)</Label>
            <Select
              value={String(formData.default_projection_years)}
              onValueChange={(value) => setFormData({ ...formData, default_projection_years: parseInt(value) })}
            >
              <SelectTrigger id="default_projection_years">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((years) => (
                  <SelectItem key={years} value={String(years)}>
                    {years} {years === 1 ? "Year" : "Years"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* COGS Defaults */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Default COGS Percentages</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="default_food_cogs_pct">Food COGS %</Label>
              <Input
                id="default_food_cogs_pct"
                type="number"
                step="0.1"
                value={formData.default_food_cogs_pct}
                onChange={(e) => setFormData({ ...formData, default_food_cogs_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 28%</p>
            </div>
            <div>
              <Label htmlFor="default_bev_cogs_pct">Beverage COGS %</Label>
              <Input
                id="default_bev_cogs_pct"
                type="number"
                step="0.1"
                value={formData.default_bev_cogs_pct}
                onChange={(e) => setFormData({ ...formData, default_bev_cogs_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 22%</p>
            </div>
            <div>
              <Label htmlFor="default_other_cogs_pct">Other COGS %</Label>
              <Input
                id="default_other_cogs_pct"
                type="number"
                step="0.1"
                value={formData.default_other_cogs_pct}
                onChange={(e) => setFormData({ ...formData, default_other_cogs_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 20%</p>
            </div>
          </div>
        </Card>

        {/* Labor Defaults */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Default Labor Productivity</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_foh_hours_per_100_covers">FOH Hours per 100 Covers</Label>
                <Input
                  id="default_foh_hours_per_100_covers"
                  type="number"
                  step="0.1"
                  value={formData.default_foh_hours_per_100_covers}
                  onChange={(e) => setFormData({ ...formData, default_foh_hours_per_100_covers: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 12 hours</p>
              </div>
              <div>
                <Label htmlFor="default_boh_hours_per_100_covers">BOH Hours per 100 Covers</Label>
                <Input
                  id="default_boh_hours_per_100_covers"
                  type="number"
                  step="0.1"
                  value={formData.default_boh_hours_per_100_covers}
                  onChange={(e) => setFormData({ ...formData, default_boh_hours_per_100_covers: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 8 hours</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="default_foh_hourly_rate">FOH Hourly Rate ($)</Label>
                <Input
                  id="default_foh_hourly_rate"
                  type="number"
                  step="0.01"
                  value={formData.default_foh_hourly_rate}
                  onChange={(e) => setFormData({ ...formData, default_foh_hourly_rate: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: $18/hr</p>
              </div>
              <div>
                <Label htmlFor="default_boh_hourly_rate">BOH Hourly Rate ($)</Label>
                <Input
                  id="default_boh_hourly_rate"
                  type="number"
                  step="0.01"
                  value={formData.default_boh_hourly_rate}
                  onChange={(e) => setFormData({ ...formData, default_boh_hourly_rate: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: $20/hr</p>
              </div>
              <div>
                <Label htmlFor="default_payroll_burden_pct">Payroll Burden %</Label>
                <Input
                  id="default_payroll_burden_pct"
                  type="number"
                  step="0.1"
                  value={formData.default_payroll_burden_pct}
                  onChange={(e) => setFormData({ ...formData, default_payroll_burden_pct: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 25% (taxes, benefits)</p>
              </div>
            </div>
          </div>
        </Card>

        {/* OpEx Defaults */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Default Operating Expenses (% of Sales)</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="default_linen_pct">Linen %</Label>
              <Input
                id="default_linen_pct"
                type="number"
                step="0.1"
                value={formData.default_linen_pct}
                onChange={(e) => setFormData({ ...formData, default_linen_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 1.5%</p>
            </div>
            <div>
              <Label htmlFor="default_smallwares_pct">Smallwares %</Label>
              <Input
                id="default_smallwares_pct"
                type="number"
                step="0.1"
                value={formData.default_smallwares_pct}
                onChange={(e) => setFormData({ ...formData, default_smallwares_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 1.0%</p>
            </div>
            <div>
              <Label htmlFor="default_cleaning_pct">Cleaning %</Label>
              <Input
                id="default_cleaning_pct"
                type="number"
                step="0.1"
                value={formData.default_cleaning_pct}
                onChange={(e) => setFormData({ ...formData, default_cleaning_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 0.5%</p>
            </div>
            <div>
              <Label htmlFor="default_cc_fees_pct">Credit Card Fees %</Label>
              <Input
                id="default_cc_fees_pct"
                type="number"
                step="0.1"
                value={formData.default_cc_fees_pct}
                onChange={(e) => setFormData({ ...formData, default_cc_fees_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 2.5%</p>
            </div>
            <div>
              <Label htmlFor="default_marketing_pct">Marketing %</Label>
              <Input
                id="default_marketing_pct"
                type="number"
                step="0.1"
                value={formData.default_marketing_pct}
                onChange={(e) => setFormData({ ...formData, default_marketing_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 3.0%</p>
            </div>
            <div>
              <Label htmlFor="default_gna_pct">G&A %</Label>
              <Input
                id="default_gna_pct"
                type="number"
                step="0.1"
                value={formData.default_gna_pct}
                onChange={(e) => setFormData({ ...formData, default_gna_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 5.0%</p>
            </div>
          </div>
        </Card>

        {/* Revenue Mix Defaults */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Default Revenue Mix</h2>
          <p className="text-xs text-zinc-400 mb-4">Must sum to 100%</p>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="default_food_mix_pct">Food %</Label>
              <Input
                id="default_food_mix_pct"
                type="number"
                step="0.1"
                value={formData.default_food_mix_pct}
                onChange={(e) => setFormData({ ...formData, default_food_mix_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 60%</p>
            </div>
            <div>
              <Label htmlFor="default_bev_mix_pct">Beverage %</Label>
              <Input
                id="default_bev_mix_pct"
                type="number"
                step="0.1"
                value={formData.default_bev_mix_pct}
                onChange={(e) => setFormData({ ...formData, default_bev_mix_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 35%</p>
            </div>
            <div>
              <Label htmlFor="default_other_mix_pct">Other %</Label>
              <Input
                id="default_other_mix_pct"
                type="number"
                step="0.1"
                value={formData.default_other_mix_pct}
                onChange={(e) => setFormData({ ...formData, default_other_mix_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 5%</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Total: {(formData.default_food_mix_pct + formData.default_bev_mix_pct + formData.default_other_mix_pct).toFixed(1)}%
            {Math.abs((formData.default_food_mix_pct + formData.default_bev_mix_pct + formData.default_other_mix_pct) - 100) > 0.1 && (
              <span className="text-red-400 ml-2">⚠ Must equal 100%</span>
            )}
          </p>
          </div>
        </Card>

        {/* Ramp-Up Defaults */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Default Ramp-Up Settings</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="default_ramp_months">Ramp Months</Label>
              <Input
                id="default_ramp_months"
                type="number"
                value={formData.default_ramp_months}
                onChange={(e) => setFormData({ ...formData, default_ramp_months: parseInt(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 12 months</p>
            </div>
            <div>
              <Label htmlFor="default_ramp_start_pct">Starting %</Label>
              <Input
                id="default_ramp_start_pct"
                type="number"
                step="0.1"
                value={formData.default_ramp_start_pct}
                onChange={(e) => setFormData({ ...formData, default_ramp_start_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 80%</p>
            </div>
            <div>
              <Label htmlFor="default_ramp_curve">Ramp Curve</Label>
              <Select
                value={formData.default_ramp_curve}
                onValueChange={(value) => setFormData({ ...formData, default_ramp_curve: value })}
              >
                <SelectTrigger id="default_ramp_curve">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linear">Linear</SelectItem>
                  <SelectItem value="exponential">Exponential</SelectItem>
                  <SelectItem value="s_curve">S-Curve</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* PDR Defaults */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Private Dining Room (PDR) Defaults</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="default_pdr_capacity">Capacity (Seats)</Label>
                <Input
                  id="default_pdr_capacity"
                  type="number"
                  value={formData.default_pdr_capacity}
                  onChange={(e) => setFormData({ ...formData, default_pdr_capacity: parseInt(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 20 seats</p>
              </div>
              <div>
                <Label htmlFor="default_pdr_events_per_month">Events/Month</Label>
                <Input
                  id="default_pdr_events_per_month"
                  type="number"
                  value={formData.default_pdr_events_per_month}
                  onChange={(e) => setFormData({ ...formData, default_pdr_events_per_month: parseInt(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 8 events</p>
              </div>
              <div>
                <Label htmlFor="default_pdr_ramp_months">Ramp Months</Label>
                <Input
                  id="default_pdr_ramp_months"
                  type="number"
                  value={formData.default_pdr_ramp_months}
                  onChange={(e) => setFormData({ ...formData, default_pdr_ramp_months: parseInt(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 12 months</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_pdr_avg_spend_per_person">Avg Spend/Person ($)</Label>
                <Input
                  id="default_pdr_avg_spend_per_person"
                  type="number"
                  step="0.01"
                  value={formData.default_pdr_avg_spend_per_person}
                  onChange={(e) => setFormData({ ...formData, default_pdr_avg_spend_per_person: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: $150/person</p>
              </div>
              <div>
                <Label htmlFor="default_pdr_avg_party_size">Avg Party Size</Label>
                <Input
                  id="default_pdr_avg_party_size"
                  type="number"
                  value={formData.default_pdr_avg_party_size}
                  onChange={(e) => setFormData({ ...formData, default_pdr_avg_party_size: parseInt(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 15 guests</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="default_pdr_food_pct">Food %</Label>
                <Input
                  id="default_pdr_food_pct"
                  type="number"
                  step="0.1"
                  value={formData.default_pdr_food_pct}
                  onChange={(e) => setFormData({ ...formData, default_pdr_food_pct: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 60%</p>
              </div>
              <div>
                <Label htmlFor="default_pdr_bev_pct">Beverage %</Label>
                <Input
                  id="default_pdr_bev_pct"
                  type="number"
                  step="0.1"
                  value={formData.default_pdr_bev_pct}
                  onChange={(e) => setFormData({ ...formData, default_pdr_bev_pct: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 35%</p>
              </div>
              <div>
                <Label htmlFor="default_pdr_other_pct">Other %</Label>
                <Input
                  id="default_pdr_other_pct"
                  type="number"
                  step="0.1"
                  value={formData.default_pdr_other_pct}
                  onChange={(e) => setFormData({ ...formData, default_pdr_other_pct: parseFloat(e.target.value) })}
                />
                <p className="text-xs text-zinc-400 mt-1">Recommended: 5%</p>
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              PDR Mix Total: {(formData.default_pdr_food_pct + formData.default_pdr_bev_pct + formData.default_pdr_other_pct).toFixed(1)}%
            </p>
          </div>
        </Card>

        {/* Service Period & Calendar Defaults */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Service Period & Calendar Settings</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="default_service_days_per_week">Days Open/Week</Label>
              <Select
                value={String(formData.default_service_days_per_week)}
                onValueChange={(value) => setFormData({ ...formData, default_service_days_per_week: parseInt(value) })}
              >
                <SelectTrigger id="default_service_days_per_week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} {days === 1 ? "day" : "days"} per week
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="default_services_per_day">Services/Day</Label>
              <Select
                value={String(formData.default_services_per_day)}
                onValueChange={(value) => setFormData({ ...formData, default_services_per_day: parseInt(value) })}
              >
                <SelectTrigger id="default_services_per_day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 (e.g., Dinner only)</SelectItem>
                  <SelectItem value="2">2 (e.g., Lunch + Dinner)</SelectItem>
                  <SelectItem value="3">3 (e.g., Breakfast + Lunch + Dinner)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <Label htmlFor="days_per_year">Days per Year</Label>
              <Input
                id="days_per_year"
                type="number"
                value={formData.days_per_year}
                onChange={(e) => setFormData({ ...formData, days_per_year: parseInt(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 360 days</p>
            </div>
            <div>
              <Label htmlFor="weeks_per_year">Weeks per Year</Label>
              <Input
                id="weeks_per_year"
                type="number"
                value={formData.weeks_per_year}
                onChange={(e) => setFormData({ ...formData, weeks_per_year: parseInt(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 52 weeks</p>
            </div>
            <div>
              <Label htmlFor="avg_days_per_month">Avg Days/Month</Label>
              <Input
                id="avg_days_per_month"
                type="number"
                step="0.01"
                value={formData.avg_days_per_month}
                onChange={(e) => setFormData({ ...formData, avg_days_per_month: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 30 days</p>
            </div>
          </div>
          </div>
        </Card>

        {/* Validation Thresholds */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Validation Thresholds</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="min_boh_pct">Min BOH % (Error Threshold)</Label>
              <Input
                id="min_boh_pct"
                type="number"
                step="0.1"
                value={formData.min_boh_pct}
                onChange={(e) => setFormData({ ...formData, min_boh_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 25%</p>
            </div>
            <div>
              <Label htmlFor="max_rent_per_seat_warning">Max Rent/Seat/Month (Warning)</Label>
              <Input
                id="max_rent_per_seat_warning"
                type="number"
                step="0.01"
                value={formData.max_rent_per_seat_warning}
                onChange={(e) => setFormData({ ...formData, max_rent_per_seat_warning: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: $250/seat</p>
            </div>
          </div>
        </Card>

        {/* Day of Week Distribution - Collapsible/Advanced */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Day of Week Distribution</h2>
          <p className="text-xs text-zinc-400 mb-4">Default weekly revenue distribution (must sum to 100%)</p>

          {/* DOW Presets */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFormData({
                ...formData,
                default_dow_sunday_pct: 14.2,
                default_dow_monday_pct: 14.3,
                default_dow_tuesday_pct: 14.3,
                default_dow_wednesday_pct: 14.3,
                default_dow_thursday_pct: 14.3,
                default_dow_friday_pct: 14.3,
                default_dow_saturday_pct: 14.3,
              })}
            >
              Even
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFormData({
                ...formData,
                default_dow_sunday_pct: 12,
                default_dow_monday_pct: 16,
                default_dow_tuesday_pct: 16,
                default_dow_wednesday_pct: 16,
                default_dow_thursday_pct: 16,
                default_dow_friday_pct: 14,
                default_dow_saturday_pct: 10,
              })}
            >
              Weekday-Biased
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFormData({
                ...formData,
                default_dow_sunday_pct: 23,
                default_dow_monday_pct: 10,
                default_dow_tuesday_pct: 10,
                default_dow_wednesday_pct: 11,
                default_dow_thursday_pct: 12,
                default_dow_friday_pct: 14,
                default_dow_saturday_pct: 20,
              })}
            >
              Weekend-Biased
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFormData({
                ...formData,
                default_dow_sunday_pct: 12,
                default_dow_monday_pct: 10,
                default_dow_tuesday_pct: 11,
                default_dow_wednesday_pct: 12,
                default_dow_thursday_pct: 14,
                default_dow_friday_pct: 22,
                default_dow_saturday_pct: 19,
              })}
            >
              Fri/Sat Lift
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFormData({
                ...formData,
                default_dow_sunday_pct: 8,
                default_dow_monday_pct: 7,
                default_dow_tuesday_pct: 8,
                default_dow_wednesday_pct: 10,
                default_dow_thursday_pct: 15,
                default_dow_friday_pct: 24,
                default_dow_saturday_pct: 28,
              })}
            >
              Thu–Sat Core
            </Button>
          </div>

          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700">
          <div className="grid grid-cols-7 gap-2">
            <div>
              <Label className="text-xs" htmlFor="default_dow_monday_pct">Mon</Label>
              <Input
                id="default_dow_monday_pct"
                type="number"
                step="0.1"
                value={formData.default_dow_monday_pct}
                onChange={(e) => setFormData({ ...formData, default_dow_monday_pct: parseFloat(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="default_dow_tuesday_pct">Tue</Label>
              <Input
                id="default_dow_tuesday_pct"
                type="number"
                step="0.1"
                value={formData.default_dow_tuesday_pct}
                onChange={(e) => setFormData({ ...formData, default_dow_tuesday_pct: parseFloat(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="default_dow_wednesday_pct">Wed</Label>
              <Input
                id="default_dow_wednesday_pct"
                type="number"
                step="0.1"
                value={formData.default_dow_wednesday_pct}
                onChange={(e) => setFormData({ ...formData, default_dow_wednesday_pct: parseFloat(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="default_dow_thursday_pct">Thu</Label>
              <Input
                id="default_dow_thursday_pct"
                type="number"
                step="0.1"
                value={formData.default_dow_thursday_pct}
                onChange={(e) => setFormData({ ...formData, default_dow_thursday_pct: parseFloat(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="default_dow_friday_pct">Fri</Label>
              <Input
                id="default_dow_friday_pct"
                type="number"
                step="0.1"
                value={formData.default_dow_friday_pct}
                onChange={(e) => setFormData({ ...formData, default_dow_friday_pct: parseFloat(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="default_dow_saturday_pct">Sat</Label>
              <Input
                id="default_dow_saturday_pct"
                type="number"
                step="0.1"
                value={formData.default_dow_saturday_pct}
                onChange={(e) => setFormData({ ...formData, default_dow_saturday_pct: parseFloat(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="default_dow_sunday_pct">Sun</Label>
              <Input
                id="default_dow_sunday_pct"
                type="number"
                step="0.1"
                value={formData.default_dow_sunday_pct}
                onChange={(e) => setFormData({ ...formData, default_dow_sunday_pct: parseFloat(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Total: {(
              formData.default_dow_monday_pct +
              formData.default_dow_tuesday_pct +
              formData.default_dow_wednesday_pct +
              formData.default_dow_thursday_pct +
              formData.default_dow_friday_pct +
              formData.default_dow_saturday_pct +
              formData.default_dow_sunday_pct
            ).toFixed(1)}%
          </p>
          </div>
        </Card>

        {/* Service Period Timing */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Service Period Timing</h2>
          <p className="text-xs text-zinc-400 mb-4">Default values for calculating table turns and capacity</p>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="default_service_hours">Service Hours</Label>
              <Input
                id="default_service_hours"
                type="number"
                step="0.5"
                value={formData.default_service_hours}
                onChange={(e) => setFormData({ ...formData, default_service_hours: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 3.0 hrs (lunch/dinner)</p>
            </div>
            <div>
              <Label htmlFor="default_avg_dining_time_hours">Avg Dining Time (hrs)</Label>
              <Input
                id="default_avg_dining_time_hours"
                type="number"
                step="0.25"
                value={formData.default_avg_dining_time_hours}
                onChange={(e) => setFormData({ ...formData, default_avg_dining_time_hours: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 1.5 hrs (table occupancy)</p>
            </div>
            <div>
              <Label htmlFor="default_utilization_pct">Utilization %</Label>
              <Input
                id="default_utilization_pct"
                type="number"
                step="1"
                value={formData.default_utilization_pct}
                onChange={(e) => setFormData({ ...formData, default_utilization_pct: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 65% (capacity realization)</p>
            </div>
          </div>
        </Card>

        {/* Bar Operations */}
        <Card className="p-6 bg-zinc-900/50 border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50 mb-4">Bar Operations</h2>
          <div className="bg-zinc-800/30 p-4 rounded border border-zinc-700 grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="default_bar_rail_ft_per_guest">Bar Rail Ft/Guest</Label>
              <Input
                id="default_bar_rail_ft_per_guest"
                type="number"
                step="0.1"
                value={formData.default_bar_rail_ft_per_guest}
                onChange={(e) => setFormData({ ...formData, default_bar_rail_ft_per_guest: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 2.0 LF (standing guest spacing)</p>
            </div>
            <div>
              <Label htmlFor="default_realization_rate">Realization Rate</Label>
              <Input
                id="default_realization_rate"
                type="number"
                step="0.01"
                value={formData.default_realization_rate}
                onChange={(e) => setFormData({ ...formData, default_realization_rate: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-zinc-400 mt-1">Recommended: 0.90 (comps/voids adjustment)</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
