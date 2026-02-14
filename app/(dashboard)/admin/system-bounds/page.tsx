export const dynamic = 'force-dynamic';

import { requireUser } from '@/lib/auth';
import { SystemBoundsManager } from '@/components/admin/SystemBoundsManager';

// Super admin emails
const SUPER_ADMIN_EMAILS = [
  'jacob@hwoodgroup.com',
  'harsh@thebinyangroup.com',
];

export default async function AdminSystemBoundsPage() {
  const user = await requireUser();

  // Check if user is super admin
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '');

  if (!isSuperAdmin) {
    return (
      <div className="container max-w-7xl mx-auto py-8">
        <div className="text-center py-12 border rounded-lg bg-red-50 border-red-200">
          <h1 className="text-2xl font-bold text-red-900 mb-2">🔒 Super Admin Only</h1>
          <p className="text-red-700">
            You must be a super admin to access system bounds configuration.
          </p>
          <p className="text-sm text-red-600 mt-4">
            Current user: {user?.email || 'Not authenticated'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">System Bounds (Layer 0)</h1>
        <p className="text-muted-foreground mt-2">
          Global enforcement boundaries that constrain all organizational standards
        </p>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-900 font-medium">
            ⚠️ <strong>WARNING:</strong> Changes here affect ALL organizations and venues.
          </p>
          <p className="text-sm text-red-800 mt-2">
            These are the <strong>absolute min/max bounds</strong> that organizations cannot escape.
            Organizations calibrate their standards WITHIN these bounds.
          </p>
        </div>
      </div>

      <SystemBoundsManager isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
