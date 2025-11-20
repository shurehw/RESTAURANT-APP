/**
 * OpsOS Dashboard Layout
 * Sidebar + topbar with brass accent line
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  LayoutDashboard,
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
} from "lucide-react";
import { TopbarActions } from "@/components/layout/TopbarActions";
import { FloatingChatWidget } from "@/components/chatbot/FloatingChatWidget";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Get current user's organization
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user?.id)
    .single();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", userData?.organization_id)
    .single();

  // Fetch venues for topbar selector
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("is_active", true);

  return (
    <div className="flex min-h-screen bg-background">
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
        <main className="flex-1 p-8">{children}</main>
      </div>

      {/* Floating Chat Widget - Always Available */}
      <FloatingChatWidget />
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="w-64 bg-opsos-sage-600 border-r-2 border-brass relative">
      {/* Logo */}
      <div className="h-24 flex items-center justify-center px-4 border-b-2 border-brass bg-white overflow-hidden">
        <img
          src="/opsos-logo.png"
          alt="OpsOS"
          className="h-20 w-full object-contain"
          style={{ objectPosition: 'center', transform: 'scale(1.8)' }}
        />
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        <NavLink href="/" icon={<LayoutDashboard className="w-5 h-5" />}>
          Dashboard
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

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  // TODO: Add active state detection with usePathname
  return (
    <Link href={href} className="nav-link">
      {icon}
      <span>{children}</span>
    </Link>
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
  venues: Array<{ id: string; name: string }>;
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
