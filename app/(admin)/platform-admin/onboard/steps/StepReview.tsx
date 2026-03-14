'use client';

import type { OnboardFormData } from '../page';

interface Props {
  data: OnboardFormData;
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const VENUE_CLASS_LABELS: Record<string, string> = {
  fine_dining: 'Fine Dining',
  high_end_social: 'High-End Social',
  nightclub: 'Nightclub',
  member_club: 'Member Club',
};
const POS_LABELS: Record<string, string> = {
  toast: 'Toast (Direct API)',
  upserve: 'Upserve / TipSee',
  simphony: 'Oracle Simphony',
  manual: 'Manual / CSV',
};

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="bg-gray-50 rounded-md p-4 space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default function StepReview({ data }: Props) {
  const closedDays = data.closedWeekdays.length > 0
    ? data.closedWeekdays.map((d) => WEEKDAY_NAMES[d]).join(', ')
    : 'Open 7 days';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Review & Create</h2>
      <p className="text-sm text-gray-600">
        Review the details below. Click &quot;Create Venue&quot; to complete onboarding.
      </p>

      <Section title="Organization">
        {data.orgMode === 'new' ? (
          <>
            <Row label="Mode" value="New Organization" />
            <Row label="Name" value={data.orgName || '—'} />
            <Row label="Slug" value={data.orgSlug || '—'} />
            <Row label="Plan" value={data.orgPlan} />
            <Row label="Timezone" value={data.orgTimezone} />
          </>
        ) : (
          <>
            <Row label="Mode" value="Existing Organization" />
            <Row label="Org ID" value={data.orgId || '—'} />
          </>
        )}
      </Section>

      <Section title="Venue">
        <Row label="Name" value={data.venueName || '—'} />
        <Row label="Address" value={`${data.address}, ${data.city}, ${data.state} ${data.zipCode}`.trim()} />
        <Row label="Phone" value={data.phone || '—'} />
        <Row label="Coordinates" value={
          data.latitude && data.longitude
            ? `${data.latitude}, ${data.longitude}`
            : '—'
        } />
        <Row label="Timezone" value={data.timezone} />
        <Row label="Venue Class" value={VENUE_CLASS_LABELS[data.venueClass] || data.venueClass} />
      </Section>

      <Section title="POS Configuration">
        <Row label="POS Type" value={POS_LABELS[data.posType] || data.posType} />
        {data.posType === 'toast' && (
          <>
            <Row label="Restaurant GUID" value={data.toastGuid || '—'} />
            <Row label="Client ID" value={data.toastClientId || '—'} />
            <Row label="Client Secret" value={data.toastClientSecret ? '********' : '—'} />
          </>
        )}
        {data.posType === 'upserve' && (
          <Row label="TipSee UUID" value={data.tipseeLocationUuid || '—'} />
        )}
        {data.posType === 'simphony' && (
          <>
            <Row label="Location Ref" value={data.simphonyLocRef || '—'} />
            <Row label="Org Identifier" value={data.simphonyOrgIdentifier || '—'} />
          </>
        )}
      </Section>

      <Section title="Schedule">
        <Row label="Service Hours" value={`${formatHour(data.serviceStartHour)} – ${formatHour(data.serviceEndHour)}`} />
        <Row label="Closed Days" value={closedDays} />
        <Row label="Covers/Server" value={String(data.coversPerServer)} />
        <Row label="Covers/Bartender" value={String(data.coversPerBartender)} />
      </Section>
    </div>
  );
}
