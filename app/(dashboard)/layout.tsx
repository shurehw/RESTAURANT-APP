/**
 * KevaOS Dashboard Layout
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
import { getNavPermissions, type UserRole } from "@/lib/nav/role-permissions";
import { NightlyReportSheet } from "@/components/pwa/NightlyReportSheet";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  let orgId: string;
  let orgRole: string;
  let allowedVenueIds: string[];
  try {
    const tenant = await getUserOrgAndVenues(user.id);
    orgId = tenant.orgId;
    orgRole = tenant.role;
    allowedVenueIds = tenant.venueIds;
  } catch (error: any) {
    if (error?.code === 'NO_ORG' || error?.status === 403) {
      redirect('/login?error=no_org');
    }
    throw error;
  }

  // Use admin client — auth already validated by requireUser + getUserOrgAndVenues
  const supabase = createAdminClient();

  // Map org-level role (owner/admin/manager/viewer) to nav-level UserRole
  const ORG_TO_NAV_ROLE: Record<string, UserRole> = {
    owner: 'owner',
    admin: 'director',
    manager: 'manager',
    viewer: 'readonly',
    onboarding: 'onboarding',
  };

  // Try user_profiles for granular nav role (gm, exec_chef, sous_chef, etc.)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Check if user is a platform admin
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  // Priority: platform admin → onboarding org override → user_profiles granular role → org role mapping → default manager
  // Onboarding org role must win over stale profile roles to keep access constrained.
  let userRole: UserRole = platformAdmin
    ? 'platform_admin'
    : orgRole === 'onboarding'
      ? 'onboarding'
      : (profile?.role as UserRole)
        || ORG_TO_NAV_ROLE[orgRole]
        || 'manager';

  // Relay-only users cannot access the dashboard — redirect to Relay PWA
  if (userRole === 'pwa') {
    redirect('/pulse');
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .single();

  // Fetch user display name (email may be undefined on legacy cookie fallback)
  let displayName = user.email?.split('@')[0];
  if (!displayName) {
    const { data: dbUser } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    displayName = dbUser?.full_name || dbUser?.email?.split('@')[0];
  }

  // Fetch venues for topbar selector — scoped by user's venue access
  let venueQuery = supabase
    .from("venues")
    .select("id, name, location, city, state")
    .eq("is_active", true);

  if (allowedVenueIds.length > 0) {
    venueQuery = venueQuery.in("id", allowedVenueIds);
  }

  const { data: venues } = await venueQuery;

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
    <VenueProvider initialVenues={venues || []} userRole={userRole}>
      <div className="flex min-h-screen bg-background">
        {/* Skip to main content — keyboard/screen-reader shortcut */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-brass focus:text-keva-slate-800 focus:rounded-md focus:font-semibold focus:text-sm"
        >
          Skip to main content
        </a>

        {/* Sidebar — hidden in PWA standalone mode */}
        <MobileSidebar
          criticalViolationCount={criticalViolationCount}
          organizationSlug={organization?.slug}
          userRole={userRole}
          userName={displayName}
          userEmail={user.email}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          {/* Topbar — hidden in PWA standalone mode */}
          <div data-pwa-hide>
            <Topbar
              venues={venues || []}
              organizationSlug={organization?.slug}
              organizationName={organization?.name}
            />
          </div>

          {/* Compact venue selector for PWA standalone mode */}
          <PwaVenueBar
            venues={venues || []}
            organizationName={organization?.name}
          />

          {/* Page Content */}
          <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>

        {/* Command Panel — gated by aiAssistant permission */}
        {getNavPermissions(userRole).aiAssistant && <FloatingChatWidget />}
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

/**
 * Compact venue selector shown only in PWA standalone mode.
 * The full topbar is hidden via data-pwa-hide, so this provides
 * venue switching for installed-PWA dashboard users.
 */
function PwaVenueBar({ venues, organizationName }: {
  venues: Array<{ id: string; name: string; location?: string | null; city?: string | null; state?: string | null }>;
  organizationName?: string;
}) {
  if (venues.length === 0) return null;

  return (
    <div className="hidden" data-pwa-show>
      <div className="h-12 border-b border-border bg-background/95 backdrop-blur px-4 flex items-center justify-between">
        <TopbarActions
          venues={venues}
          organizationName={organizationName}
        />
        <NightlyReportSheet />
      </div>
    </div>
  );
}
