'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface Props {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  saving: boolean;
  isLastStep: boolean;
}

export function StepNavigation({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  saving,
  isLastStep,
}: Props) {
  return (
    <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        disabled={currentStep === 0}
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {saving && <Loader2 className="h-3 w-3 animate-spin text-brass" />}
        <span>
          Step {currentStep + 1} of {totalSteps}
        </span>
      </div>

      {!isLastStep ? (
        <Button variant="brass" size="sm" onClick={onNext}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <div className="w-[72px]" /> // Spacer — submit is inside ReviewStep
      )}
    </div>
  );
}
