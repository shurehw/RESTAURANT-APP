/**
 * OpsOS Dashboard Layout
 * Sidebar + topbar with brass accent line
 */

import { createClient } from "@/lib/supabase/server";
import {
  ShoppingCart,
  FileText,
  Users,
  Package,
  UtensilsCrossed,
  ClipboardList,
  DollarSign,
  BarChart3,
  Calendar,
  Bot,
  CheckSquare,
  TrendingUp,
  Calculator,
  Moon,
  Music2,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { NavLink } from "@/components/layout/NavLink";
import { TopbarActions } from "@/components/layout/TopbarActions";
import { FloatingChatWidget } from "@/components/chatbot/FloatingChatWidget";
import { VenueProvider } from "@/components/providers/VenueProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Get current user's organization
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userData } = await (supabase as any)
    .from("users")
    .select("organization_id")
    .eq("id", user?.id ?? '')
    .single();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", userData?.organization_id)
    .single();

  // Fetch venues for topbar selector
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, location, city, state")
    .eq("is_active", true);

  return (
    <VenueProvider initialVenues={venues || []}>
      <div className="flex min-h-screen bg-background">
        {/* Skip to main content — keyboard/screen-reader shortcut */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-brass focus:text-opsos-slate-800 focus:rounded-md focus:font-semibold focus:text-sm"
        >
          Skip to main content
        </a>

        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Topbar */}
          <Topbar
            venues={venues || []}
            organizationSlug={organization?.slug}
            organizationName={organization?.name}
          />

          {/* Page Content */}
          <main id="main-content" className="flex-1 p-8">{children}</main>
        </div>

        {/* Floating Chat Widget - Always Available */}
        <FloatingChatWidget />
      </div>
    </VenueProvider>
  );
}

function Sidebar() {
  return (
    <aside className="w-64 bg-opsos-sage-600 border-r-2 border-brass relative">
      {/* Logo */}
      <div className="h-24 flex items-center justify-center px-4 border-b-2 border-brass bg-white overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/opsos-logo.png"
          alt="OpsOS logo"
          className="h-20 w-full object-contain object-center scale-[1.8]"
        />
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1" aria-label="Main navigation">
        <NavLink href="/" icon={<Moon className="w-5 h-5" />}>
          Home
        </NavLink>

        <NavSection title="COGS">
          <NavLink href="/orders" icon={<ShoppingCart className="w-5 h-5" />}>
            Orders
          </NavLink>
          <NavLink href="/invoices" icon={<FileText className="w-5 h-5" />}>
            Invoices
          </NavLink>
          <NavLink href="/reconciliation" icon={<CheckSquare className="w-5 h-5" />}>
            Reconciliation
          </NavLink>
          <NavLink href="/vendors" icon={<Users className="w-5 h-5" />}>
            Vendors
          </NavLink>
          <NavLink href="/products" icon={<Package className="w-5 h-5" />}>
            Products
          </NavLink>
          <NavLink href="/recipes" icon={<UtensilsCrossed className="w-5 h-5" />}>
            Recipes
          </NavLink>
          <NavLink href="/inventory" icon={<ClipboardList className="w-5 h-5" />}>
            Inventory
          </NavLink>
        </NavSection>

        <NavSection title="Sales">
          <NavLink href="/sales/forecasts" icon={<BarChart3 className="w-5 h-5" />}>
            Forecasts
          </NavLink>
          <NavLink href="/reports/nightly" icon={<Moon className="w-5 h-5" />}>
            Nightly Report
          </NavLink>
          <NavLink href="/reports/health" icon={<Activity className="w-5 h-5" />}>
            Venue Health
          </NavLink>
          <NavLink href="/control-plane" icon={<ShieldCheck className="w-5 h-5" />}>
            Action Items
          </NavLink>
          <NavLink href="/control-plane/attestations" icon={<CheckSquare className="w-5 h-5" />}>
            Attestations
          </NavLink>
          <NavLink href="/entertainment" icon={<Music2 className="w-5 h-5" />}>
            Entertainment
          </NavLink>
        </NavSection>

        <NavSection title="Labor">
          <NavLink href="/labor/briefing" icon={<Calendar className="w-5 h-5" />}>
            Daily Briefing
          </NavLink>
          <NavLink href="/labor/requirements" icon={<ClipboardList className="w-5 h-5" />}>
            Requirements
          </NavLink>
          <NavLink href="/labor/schedule" icon={<Calendar className="w-5 h-5" />}>
            Schedule
          </NavLink>
        </NavSection>

        <div className="pt-4 mt-4 border-t border-opsos-sage-500">
          <NavLink href="/assistant" icon={<Bot className="w-5 h-5" />}>
            AI Assistant
          </NavLink>
          <NavLink href="/budget" icon={<DollarSign className="w-5 h-5" />}>
            Budget
          </NavLink>
          <NavLink href="/proforma" icon={<Calculator className="w-5 h-5" />}>
            Proforma
          </NavLink>
          <NavLink href="/savings" icon={<TrendingUp className="w-5 h-5" />}>
            Savings
          </NavLink>
          <NavLink href="/reports" icon={<BarChart3 className="w-5 h-5" />}>
            Reports
          </NavLink>
        </div>
      </nav>

      {/* Brass accent line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-brass"></div>
    </aside>
  );
}

function NavSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 mb-2">
      <div className="px-3 mb-2 text-xs font-semibold text-opsos-sage-300 uppercase tracking-wider">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Topbar({ venues, organizationSlug, organizationName }: {
  venues: Array<{ id: string; name: string; location?: string | null; city?: string | null; state?: string | null }>;
  organizationSlug?: string;
  organizationName?: string;
}) {
  return (
    <header className="h-24 border-b-2 border-brass bg-white px-8">
      <div className="h-full flex items-center justify-end">
        <TopbarActions
          venues={venues}
          organizationSlug={organizationSlug}
          organizationName={organizationName}
        />
      </div>
    </header>
  );
}
