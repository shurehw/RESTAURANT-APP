'use client';

import { MessagingApp } from '@/components/messages/MessagingApp';

// TODO: Get from auth/session when implemented
const DEMO_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_VENUE_ID = '00000000-0000-0000-0000-000000000001';

export default function MessagesPage() {
  return (
    <div className="h-screen">
      <MessagingApp employeeId={DEMO_EMPLOYEE_ID} venueId={DEMO_VENUE_ID} />
    </div>
  );
}
