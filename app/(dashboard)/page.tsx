/**
 * Dashboard Landing Page
 * Redirects to Action Center — the enforcement-first landing experience
 */

import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/action-center');
}
