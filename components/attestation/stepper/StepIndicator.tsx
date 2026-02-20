'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, type LucideIcon } from 'lucide-react';

export interface StepConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  status: 'required';
  completion: 'complete' | 'incomplete';
  flagged?: boolean;
}

interface Props {
  steps: StepConfig[];
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function StepIndicator({ steps, currentStep, onStepClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll to keep the active step visible
  useEffect(() => {
    const container = scrollRef.current;
    const activeEl = stepRefs.current[currentStep];
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    if (activeRect.left < containerRect.left || activeRect.right > containerRect.right) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentStep]);

  return (
    <div className="px-6 py-4 border-b border-border">
      {/* Desktop: icons + labels — scrollable for 6+ steps */}
      <div
        ref={scrollRef}
        className="hidden sm:flex items-center overflow-x-auto scrollbar-none"
      >
        {steps.map((step, i) => {
          const isCurrent = i === currentStep;
          const isComplete = step.completion === 'complete';
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              ref={(el) => { stepRefs.current[i] = el; }}
              className="flex items-center shrink-0"
            >
              {/* Step circle + label */}
              <button
                onClick={() => onStepClick(i)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors text-left',
                  isCurrent && 'bg-brass/10',
                  !isCurrent && 'hover:bg-muted/50',
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors',
                    isComplete && 'bg-sage text-white',
                    isCurrent && !isComplete && 'bg-brass text-white',
                    !isCurrent && !isComplete && 'border-2 border-brass/40',
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
                      'text-xs font-medium leading-tight whitespace-nowrap',
                      isCurrent && 'text-brass',
                      !isCurrent && 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </div>
                  {step.flagged && (
                    <div className="text-[10px] text-brass font-semibold leading-tight whitespace-nowrap">
                      Flagged
                    </div>
                  )}
                </div>
              </button>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'w-4 h-px mx-1 shrink-0',
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

            return (
              <button
                key={step.id}
                onClick={() => onStepClick(i)}
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-all',
                  isComplete && 'bg-sage',
                  isCurrent && !isComplete && 'bg-brass w-6',
                  !isCurrent && !isComplete && 'bg-brass/30',
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
