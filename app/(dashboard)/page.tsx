/**
 * Dashboard Landing Page
 * Redirects to Nightly Report as the primary operational view
 *
 * The Nightly Report is now the unified operational dashboard with:
 * - Sales/Labor/Comps data (daily + WTD + PTD)
 * - Inline exception detection and enforcement
 * - AI comp review and attestation workflow
 * - All operational context in one view
 */

import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/reports/nightly');
}
