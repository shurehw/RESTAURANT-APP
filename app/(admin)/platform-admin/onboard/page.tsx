'use client';

/**
 * Platform Admin: Venue Onboarding Wizard
 *
 * Multi-step wizard for onboarding new venues:
 * 1. Organization — create new or select existing
 * 2. Venue Details — name, address, coords, timezone, venue class
 * 3. POS Config — type selector with per-POS credential fields
 * 4. Schedule — service hours, dark days, staffing targets
 * 5. Review & Create — summary + submit
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StepOrganization from './steps/StepOrganization';
import StepVenueDetails from './steps/StepVenueDetails';
import StepPosConfig from './steps/StepPosConfig';
import StepSchedule from './steps/StepSchedule';
import StepReview from './steps/StepReview';

export interface OnboardFormData {
  // Step 1: Organization
  orgMode: 'new' | 'existing';
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgPlan: string;
  orgTimezone: string;
  // Step 2: Venue
  venueName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  venueClass: string;
  // Step 3: POS
  posType: 'toast' | 'upserve' | 'simphony' | 'manual';
  toastGuid: string;
  toastClientId: string;
  toastClientSecret: string;
  tipseeLocationUuid: string;
  simphonyLocRef: string;
  simphonyOrgIdentifier: string;
  // Step 4: Schedule
  serviceStartHour: number;
  serviceEndHour: number;
  closedWeekdays: number[];
  coversPerServer: number;
  coversPerBartender: number;
}

const INITIAL_DATA: OnboardFormData = {
  orgMode: 'new',
  orgId: '',
  orgName: '',
  orgSlug: '',
  orgPlan: 'professional',
  orgTimezone: 'America/Los_Angeles',
  venueName: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  latitude: null,
  longitude: null,
  timezone: 'America/Los_Angeles',
  venueClass: 'high_end_social',
  posType: 'toast',
  toastGuid: '',
  toastClientId: '',
  toastClientSecret: '',
  tipseeLocationUuid: '',
  simphonyLocRef: '',
  simphonyOrgIdentifier: '',
  serviceStartHour: 17,
  serviceEndHour: 23,
  closedWeekdays: [],
  coversPerServer: 16,
  coversPerBartender: 30,
};

const STEPS = [
  { label: 'Organization', number: 1 },
  { label: 'Venue Details', number: 2 },
  { label: 'POS Config', number: 3 },
  { label: 'Schedule', number: 4 },
  { label: 'Review & Create', number: 5 },
];

export default function OnboardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<OnboardFormData>(INITIAL_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ organization_id: string; venue_id: string } | null>(null);

  const updateData = (partial: Partial<OnboardFormData>) => {
    setFormData((prev) => ({ ...prev, ...partial }));
  };

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Onboarding failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Venue Onboarded</h2>
          <p className="text-gray-600 mb-6">
            <strong>{formData.venueName}</strong> has been created under{' '}
            <strong>{formData.orgMode === 'new' ? formData.orgName : 'existing org'}</strong>.
          </p>
          <div className="bg-gray-50 rounded-md p-4 mb-6 text-sm text-left font-mono">
            <div>Organization ID: {result.organization_id}</div>
            <div>Venue ID: {result.venue_id}</div>
          </div>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => { setResult(null); setFormData(INITIAL_DATA); setCurrentStep(1); }}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Onboard Another
            </button>
            <Link
              href="/platform-admin"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/platform-admin" className="text-blue-600 hover:underline text-sm">
          &larr; Back to Dashboard
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">Onboard New Venue</h1>

      {/* Step Indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((step, idx) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  currentStep > step.number
                    ? 'bg-green-500 text-white'
                    : currentStep === step.number
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {currentStep > step.number ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`ml-2 text-sm hidden sm:inline ${
                  currentStep === step.number ? 'font-semibold text-gray-900' : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-3 ${
                  currentStep > step.number ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white shadow rounded-lg p-6">
        {currentStep === 1 && <StepOrganization data={formData} onChange={updateData} />}
        {currentStep === 2 && <StepVenueDetails data={formData} onChange={updateData} />}
        {currentStep === 3 && <StepPosConfig data={formData} onChange={updateData} />}
        {currentStep === 4 && <StepSchedule data={formData} onChange={updateData} />}
        {currentStep === 5 && <StepReview data={formData} />}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            &larr; Back
          </button>

          {currentStep < 5 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Next &rarr;
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Venue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
