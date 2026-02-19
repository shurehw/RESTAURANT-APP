import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { createAdminClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { User, Mail, Building2, Shield } from 'lucide-react';
import { ROLE_LABELS, type UserRole } from '@/lib/nav/role-permissions';

export default async function AccountPage() {
  const user = await requireUser();
  const { orgId, role: orgRole } = await getUserOrgAndVenues(user.id);

  const supabase = createAdminClient();

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  // Map org role to display label
  const ORG_TO_NAV: Record<string, UserRole> = {
    owner: 'owner',
    admin: 'director',
    manager: 'manager',
    viewer: 'readonly',
  };
  const navRole = ORG_TO_NAV[orgRole] || 'manager';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Account</h1>
        <p className="text-muted-foreground mt-1">Your profile and access information</p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brass/20 text-brass flex items-center justify-center text-xl font-bold flex-shrink-0">
            {(user.email || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-lg font-semibold">{user.email?.split('@')[0] || 'User'}</div>
            <div className="text-sm text-muted-foreground">{ROLE_LABELS[navRole]}</div>
          </div>
        </div>

        <div className="border-t pt-5 space-y-4">
          <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={user.email || '—'} />
          <InfoRow icon={<Building2 className="w-4 h-4" />} label="Organization" value={organization?.name || '—'} />
          <InfoRow icon={<Shield className="w-4 h-4" />} label="Role" value={ROLE_LABELS[navRole]} />
        </div>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-sm text-muted-foreground w-28">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
