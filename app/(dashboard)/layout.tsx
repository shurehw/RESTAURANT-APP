/**
 * OpsOS Dashboard Layout
 * Sidebar + topbar with brass accent line
 */

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getUserOrgAndVenues } from "@/lib/tenant";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { TopbarActions } from "@/components/layout/TopbarActions";
import { FloatingChatWidget } from "@/components/chatbot/FloatingChatWidget";
import { VenueProvider } from "@/components/providers/VenueProvider";
import type { UserRole } from "@/lib/nav/role-permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { orgId, role: orgRole } = await getUserOrgAndVenues(user.id);

  // Use admin client — auth already validated by requireUser + getUserOrgAndVenues
  const supabase = createAdminClient();

  // Map org-level role (owner/admin/manager/viewer) to nav-level UserRole
  const ORG_TO_NAV_ROLE: Record<string, UserRole> = {
    owner: 'owner',
    admin: 'director',
    manager: 'manager',
    viewer: 'readonly',
  };

  // Try user_profiles for granular nav role (gm, exec_chef, sous_chef, etc.)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Priority: user_profiles granular role → org role mapping → default manager
  let userRole: UserRole = (profile?.role as UserRole)
    || ORG_TO_NAV_ROLE[orgRole]
    || 'manager';

  // PWA-only users cannot access the dashboard — redirect to Pulse
  if (userRole === 'pwa') {
    redirect('/pulse');
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .single();

  // Fetch venues for topbar selector
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, location, city, state")
    .eq("is_active", true);

  // Fetch active violations for badge (non-critical — fails silently if RPC missing)
  let criticalViolationCount = 0;
  try {
    const { data: violations } = await supabase.rpc('get_active_violations', {
      p_org_id: orgId,
      p_severity: 'critical',
    });
    criticalViolationCount = (violations || []).length;
  } catch {
    // RPC may not exist yet — badge just shows 0
  }

  return (
    <VenueProvider initialVenues={venues || []}>
      <div className="flex min-h-screen bg-background overflow-x-hidden">
        {/* Skip to main content — keyboard/screen-reader shortcut */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-brass focus:text-opsos-slate-800 focus:rounded-md focus:font-semibold focus:text-sm"
        >
          Skip to main content
        </a>

        {/* Sidebar — hidden in PWA standalone mode */}
        <MobileSidebar
          criticalViolationCount={criticalViolationCount}
          organizationSlug={organization?.slug}
          userRole={userRole}
          userName={user.email?.split('@')[0]}
          userEmail={user.email}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar — hidden in PWA standalone mode */}
          <div data-pwa-hide>
            <Topbar
              venues={venues || []}
              organizationSlug={organization?.slug}
              organizationName={organization?.name}
            />
          </div>

          {/* Page Content */}
          <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>

        {/* Command Panel */}
        <FloatingChatWidget />
      </div>
    </VenueProvider>
  );
}

function Topbar({ venues, organizationSlug, organizationName }: {
  venues: Array<{ id: string; name: string; location?: string | null; city?: string | null; state?: string | null }>;
  organizationSlug?: string;
  organizationName?: string;
}) {
  return (
    <header className="h-16 lg:h-24 border-b-2 border-brass bg-white px-4 sm:px-6 lg:px-8">
      <div className="h-full flex items-center justify-between lg:justify-end">
        {/* Mobile: Add spacing for hamburger button */}
        <div className="w-12 lg:hidden" />

        <TopbarActions
          venues={venues}
          organizationSlug={organizationSlug}
          organizationName={organizationName}
        />
      </div>
    </header>
  );
}
