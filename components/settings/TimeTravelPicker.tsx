"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface TimeTravelPickerProps {
  orgId: string;
  onDateSelect: (date: Date | null, settings: any) => void;
}

export function TimeTravelPicker({ orgId, onDateSelect }: TimeTravelPickerProps) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDateSelect = async (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (!selectedDate) {
      onDateSelect(null, null);
      return;
    }

    setLoading(true);
    try {
      const asOf = selectedDate.toISOString();
      const response = await fetch(
        `/api/proforma/settings-history?org_id=${orgId}&as_of=${asOf}`
      );
      const data = await response.json();
      onDateSelect(selectedDate, data.settings);
    } catch (error) {
      console.error("Error fetching historical settings:", error);
      onDateSelect(selectedDate, null);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const handleReset = () => {
    setDate(undefined);
    onDateSelect(null, null);
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`justify-start text-left font-normal ${
              !date && "text-muted-foreground"
            }`}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP") : "View settings as of..."}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            disabled={(date) => date > new Date()}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {date && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={loading}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Current
        </Button>
      )}

      {loading && (
        <span className="text-sm text-gray-500">Loading...</span>
      )}
    </div>
  );
}
