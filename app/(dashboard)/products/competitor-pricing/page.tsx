export const dynamic = 'force-dynamic';

import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { CompetitorPricingPanel } from '@/components/products/CompetitorPricingPanel';

export default async function CompetitorPricingPage() {
  const user = await requireUser();
  await getUserOrgAndVenues(user.id);

  return (
    <div className="p-6">
      <CompetitorPricingPanel />
    </div>
  );
}

