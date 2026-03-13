import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { MockupsAdminPanel } from '@/components/admin/MockupsAdminPanel';

export const dynamic = 'force-dynamic';

export default async function MockupsAdminPage() {
  const user = await requireUser();
  await getUserOrgAndVenues(user.id);

  return (
    <div className="p-6">
      <MockupsAdminPanel />
    </div>
  );
}

