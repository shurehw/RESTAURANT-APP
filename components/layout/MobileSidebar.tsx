'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
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
  AlertTriangle,
  Activity,
  Settings,
  LogOut,
} from 'lucide-react';
import { NavLink } from '@/components/layout/NavLink';
import { OpsOSLogo } from '@/components/ui/OpsOSLogo';
import { getNavPermissions, type UserRole } from '@/lib/nav/role-permissions';

interface MobileSidebarProps {
  criticalViolationCount: number;
  organizationSlug?: string;
  userRole: UserRole;
  userName?: string;
  userEmail?: string;
}

export function MobileSidebar({ criticalViolationCount, organizationSlug, userRole, userName, userEmail }: MobileSidebarProps) {
  const permissions = getNavPermissions(userRole);
  const [isOpen, setIsOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const pathname = usePathname();

  // Auto-close sidebar when route changes (navigation)
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Swipe gesture detection
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    // Swipe right to open (start from left edge)
    if (!isOpen && touchStartX.current < 50 && touchEndX.current - touchStartX.current > 100) {
      setIsOpen(true);
    }
    // Swipe left to close
    if (isOpen && touchStartX.current - touchEndX.current > 50) {
      setIsOpen(false);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="contents"
    >
      {/* Hamburger Button - Mobile Only */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-6 left-4 z-50 p-2 bg-opsos-sage-600 text-white rounded-md shadow-lg"
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay - Mobile Only */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        data-pwa-hide
        className={`
          fixed inset-y-0 left-0 z-40
          lg:static lg:z-auto lg:inset-auto lg:h-screen lg:sticky lg:top-0
          w-64 bg-opsos-sage-600 border-r-2 border-brass
          flex flex-col flex-shrink-0
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo — matches topbar height (h-16 mobile, h-24 desktop) */}
        <div className="h-16 lg:h-24 flex-shrink-0 flex items-center justify-center px-4 border-b border-opsos-sage-200 bg-white">
          <OpsOSLogo size="lg" />
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto flex-1 min-h-0" aria-label="Main navigation">
          <NavLink href="/" icon={<Moon className="w-5 h-5" />}>
            Home
          </NavLink>

          <NavSection title="COGS">
            {permissions.orders && (
              <NavLink href="/orders" icon={<ShoppingCart className="w-5 h-5" />}>
                Orders
              </NavLink>
            )}
            {permissions.invoices && (
              <NavLink href="/invoices" icon={<FileText className="w-5 h-5" />}>
                Invoices
              </NavLink>
            )}
            {permissions.reconciliation && (
              <NavLink href="/reconciliation" icon={<CheckSquare className="w-5 h-5" />}>
                Reconciliation
              </NavLink>
            )}
            {permissions.vendors && (
              <NavLink href="/vendors" icon={<Users className="w-5 h-5" />}>
                Vendors
              </NavLink>
            )}
            {permissions.products && (
              <NavLink href="/products" icon={<Package className="w-5 h-5" />}>
                Products
              </NavLink>
            )}
            {permissions.recipes && (
              <NavLink href="/recipes" icon={<UtensilsCrossed className="w-5 h-5" />}>
                Recipes
              </NavLink>
            )}
            {permissions.inventory && (
              <NavLink href="/inventory" icon={<ClipboardList className="w-5 h-5" />}>
                Inventory
              </NavLink>
            )}
          </NavSection>

          <NavSection title="Sales">
            {permissions.forecasts && (
              <NavLink href="/sales/forecasts" icon={<BarChart3 className="w-5 h-5" />}>
                Forecasts
              </NavLink>
            )}
            {permissions.nightlyReport && (
              <NavLink href="/reports/nightly" icon={<Moon className="w-5 h-5" />}>
                Nightly Report
              </NavLink>
            )}
            {permissions.venueHealth && (
              <NavLink href="/reports/health" icon={<Activity className="w-5 h-5" />}>
                Venue Health
              </NavLink>
            )}
            {permissions.preshift && (
              <NavLink href="/preshift" icon={<ClipboardList className="w-5 h-5" />}>
                Preshift
              </NavLink>
            )}
            {permissions.actionCenter && (
              <NavLink
                href="/action-center"
                icon={<AlertTriangle className="w-5 h-5" />}
                badge={criticalViolationCount}
              >
                Action Center
              </NavLink>
            )}
            {permissions.attestations && (
              <NavLink href="/control-plane/attestations" icon={<CheckSquare className="w-5 h-5" />}>
                Attestations
              </NavLink>
            )}
            {/* Entertainment module - h.wood Group only */}
            {permissions.entertainment && organizationSlug?.includes('hwood') && (
              <NavLink href="/entertainment" icon={<Music2 className="w-5 h-5" />}>
                Entertainment
              </NavLink>
            )}
          </NavSection>

          <NavSection title="Labor">
            {permissions.laborBriefing && (
              <NavLink href="/labor/briefing" icon={<Calendar className="w-5 h-5" />}>
                Daily Briefing
              </NavLink>
            )}
            {permissions.laborRequirements && (
              <NavLink href="/labor/requirements" icon={<ClipboardList className="w-5 h-5" />}>
                Requirements
              </NavLink>
            )}
            {permissions.laborSchedule && (
              <NavLink href="/labor/schedule" icon={<Calendar className="w-5 h-5" />}>
                Schedule
              </NavLink>
            )}
          </NavSection>

          {permissions.budget && (
            <div className="pt-4 mt-4 border-t border-opsos-sage-500">
              <NavLink href="/budget" icon={<DollarSign className="w-5 h-5" />}>
                Budget
              </NavLink>
            </div>
          )}

          <NavSection title="Admin">
            {permissions.orgSettings && (
              <NavLink href="/settings/organization" icon={<Settings className="w-5 h-5" />}>
                Org Settings
              </NavLink>
            )}
            {permissions.compSettings && (
              <NavLink href="/admin/comp-settings" icon={<Settings className="w-5 h-5" />}>
                Comp Settings
              </NavLink>
            )}
            {permissions.procurementSettings && (
              <NavLink href="/admin/procurement-settings" icon={<ShoppingCart className="w-5 h-5" />}>
                Procurement
              </NavLink>
            )}
          </NavSection>
        </nav>

        {/* Footer — pinned to bottom */}
        <div className="flex-shrink-0 border-t border-opsos-sage-500 pb-2">
          {permissions.aiAssistant && (
            <div className="px-4 pt-3 pb-1">
              <NavLink href="/assistant" icon={<Bot className="w-5 h-5" />}>
                AI Assistant
              </NavLink>
            </div>
          )}
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brass/20 text-brass flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(userName || userEmail || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {userName || 'User'}
                </div>
                <div className="text-[11px] text-opsos-sage-300 truncate capitalize">
                  {userRole === 'gm' ? 'General Manager' : userRole === 'agm' ? 'Asst. GM' : userRole === 'exec_chef' ? 'Executive Chef' : userRole === 'sous_chef' ? 'Sous Chef' : userRole}
                </div>
              </div>
              <SignOutButton />
            </div>
          </div>
        </div>

        {/* Brass accent line at bottom */}
        <div className="h-1 bg-brass flex-shrink-0"></div>
      </aside>
    </div>
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

function SignOutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="p-1.5 rounded-md text-opsos-sage-300 hover:text-white hover:bg-opsos-sage-500 transition-colors"
      title="Sign out"
    >
      <LogOut className="w-4 h-4" />
    </button>
  );
}
