'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, type LucideIcon } from 'lucide-react';

export interface StepConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  status: 'required' | 'optional' | 'not_required';
  completion: 'complete' | 'incomplete' | 'not_required' | 'always_optional';
}

interface Props {
  steps: StepConfig[];
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function StepIndicator({ steps, currentStep, onStepClick }: Props) {
  return (
    <div className="px-6 py-4 border-b border-border">
      {/* Desktop: icons + labels */}
      <div className="hidden sm:flex items-center justify-between">
        {steps.map((step, i) => {
          const isCurrent = i === currentStep;
          const isComplete = step.completion === 'complete';
          const isNotRequired = step.status === 'not_required';
          const isOptional = step.status === 'optional';
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <button
                onClick={() => onStepClick(i)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors text-left',
                  isCurrent && 'bg-brass/10',
                  !isCurrent && 'hover:bg-muted/50',
                  (isNotRequired || isOptional) && !isCurrent && 'opacity-50',
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors',
                    isComplete && 'bg-sage text-white',
                    isCurrent && !isComplete && 'bg-brass text-white',
                    !isCurrent && !isComplete && isNotRequired && 'border border-dashed border-muted-foreground/40',
                    !isCurrent && !isComplete && !isNotRequired && 'border-2 border-brass/40',
                  )}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className={cn(
                      'text-xs font-medium leading-tight truncate',
                      isCurrent && 'text-brass',
                      !isCurrent && 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </div>
                  {isNotRequired && (
                    <div className="text-[10px] text-muted-foreground/60 leading-tight">
                      Not required
                    </div>
                  )}
                  {isOptional && (
                    <div className="text-[10px] text-muted-foreground/60 leading-tight">
                      Optional
                    </div>
                  )}
                </div>
              </button>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-px mx-2',
                    steps[i].completion === 'complete' && steps[i + 1].completion === 'complete'
                      ? 'bg-sage/50'
                      : 'bg-border',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: dots only + current step label */}
      <div className="sm:hidden">
        <div className="flex items-center justify-center gap-2 mb-2">
          {steps.map((step, i) => {
            const isCurrent = i === currentStep;
            const isComplete = step.completion === 'complete';
            const isNotRequired = step.status === 'not_required';

            return (
              <button
                key={step.id}
                onClick={() => onStepClick(i)}
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-all',
                  isComplete && 'bg-sage',
                  isCurrent && !isComplete && 'bg-brass w-6',
                  !isCurrent && !isComplete && isNotRequired && 'bg-muted-foreground/20',
                  !isCurrent && !isComplete && !isNotRequired && 'bg-brass/30',
                )}
              />
            );
          })}
        </div>
        <div className="text-center text-sm font-medium text-brass">
          {steps[currentStep]?.label}
        </div>
      </div>
    </div>
  );
}
