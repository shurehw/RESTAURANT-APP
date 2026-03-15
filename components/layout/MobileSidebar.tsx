'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import {
  ShoppingCart,
  UtensilsCrossed,
  ClipboardList,
  BarChart3,
  CalendarCheck,
  Calendar,
  Bot,
  Moon,
  AlertTriangle,
  ShieldCheck,
  Settings,
  LogOut,
  LayoutGrid,
  Warehouse,
  PieChart,
} from 'lucide-react';
import { NavLink } from '@/components/layout/NavLink';
import { KevaOSLogo } from '@/components/ui/KevaOSLogo';
import { getNavPermissions, ROLE_LABELS, type UserRole } from '@/lib/nav/role-permissions';

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
      {/* Hamburger Button - Mobile Only (hidden for onboarding and PWA standalone) */}
      {userRole !== 'onboarding' && (
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-pwa-hide
        className="lg:hidden fixed top-6 left-4 z-50 p-2 bg-keva-sage-600 text-white rounded-md shadow-lg"
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
      )}

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
          lg:sticky lg:top-0 lg:z-auto lg:bottom-auto lg:left-auto lg:h-dvh
          w-64 bg-keva-sage-600 border-r-2 border-brass
          flex flex-col flex-shrink-0
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo — matches topbar height (h-16 mobile, h-24 desktop) */}
        <div className="h-16 lg:h-24 flex-shrink-0 flex items-center justify-center px-4 border-b border-keva-sage-200 bg-white">
          <KevaOSLogo size="lg" />
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto flex-1 min-h-0" aria-label="Main navigation">
          {/* Primary ops — always visible at the top */}
          <NavLink
            href="/"
            icon={<AlertTriangle className="w-5 h-5" />}
            badge={criticalViolationCount}
          >
            Home
          </NavLink>
          {permissions.nightlyReport && (
            <NavLink href="/reports/nightly" icon={<Moon className="w-5 h-5" />}>
              Nightly Report
            </NavLink>
          )}
          {/* Live Pulse (/sales/pace) is PWA-only — no sidebar link needed */}
          {/* Daily Briefing removed — content merges into Preshift */}
          {permissions.preshift && (
            <NavLink href="/preshift" icon={<ClipboardList className="w-5 h-5" />}>
              Preshift
            </NavLink>
          )}
          {permissions.laborSchedule && (
            <NavLink href="/floor-plan" icon={<LayoutGrid className="w-5 h-5" />}>
              Floor Plan
            </NavLink>
          )}
          {permissions.oversight && (
            <NavLink href="/oversight" icon={<ShieldCheck className="w-5 h-5" />}>
              Oversight
            </NavLink>
          )}

          {(permissions.forecasts || permissions.reservations) && (
            <NavSection title="Revenue">
              {permissions.forecasts && (
                <NavLink href="/sales/forecasts" icon={<BarChart3 className="w-5 h-5" />}>
                  Forecasts
                </NavLink>
              )}
              {permissions.reservations && (
                <NavLink href="/sales/reservations" icon={<CalendarCheck className="w-5 h-5" />}>
                  Reservations
                </NavLink>
              )}
              {permissions.agents && (
                <NavLink href="/admin/rez-yield-agent" icon={<Bot className="w-5 h-5" />}>
                  Revenue Agent
                </NavLink>
              )}
            </NavSection>
          )}

          {(permissions.laborRequirements || permissions.laborSchedule) && (
            <NavSection title="Labor">
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
              {permissions.laborSchedule && (
                <NavLink href="/labor/agent" icon={<Bot className="w-5 h-5" />}>
                  Agent
                </NavLink>
              )}
              {permissions.laborSchedule && (
                <NavLink href="/labor/efficiency" icon={<BarChart3 className="w-5 h-5" />}>
                  Efficiency
                </NavLink>
              )}
            </NavSection>
          )}

          {(permissions.orders || permissions.invoices || permissions.vendors || permissions.products || permissions.recipes || permissions.inventory) && (
          <NavSection title="COGS">
            {permissions.orders && (
              <NavLink href="/purchasing" icon={<ShoppingCart className="w-5 h-5" />}>
                Purchasing
              </NavLink>
            )}
            {permissions.recipes && (
              <NavLink href="/menu" icon={<UtensilsCrossed className="w-5 h-5" />}>
                Menu
              </NavLink>
            )}
            {permissions.inventory && (
              <NavLink href="/inventory" icon={<Warehouse className="w-5 h-5" />}>
                Inventory
              </NavLink>
            )}
            {permissions.budget && (
              <NavLink href="/cost-reports" icon={<PieChart className="w-5 h-5" />}>
                Cost Reports
              </NavLink>
            )}
            {permissions.agents && (
              <NavLink href="/admin/menu-agent" icon={<Bot className="w-5 h-5" />}>
                Menu Agent
              </NavLink>
            )}
            {permissions.agents && (
              <NavLink href="/admin/procurement-agent" icon={<Bot className="w-5 h-5" />}>
                Procurement Agent
              </NavLink>
            )}
          </NavSection>
          )}

          <div className="pt-4 mt-4 border-t border-keva-sage-500">
            {permissions.laborSchedule && (
              <NavLink href="/admin/floor-plan-builder" icon={<LayoutGrid className="w-5 h-5" />}>
                Floor Plan Builder
              </NavLink>
            )}
            {(permissions.orgSettings || permissions.compSettings || permissions.procurementSettings) && (
              <NavLink href="/admin/settings" icon={<Settings className="w-5 h-5" />}>
                Settings
              </NavLink>
            )}
          </div>
        </nav>

        {/* Footer — pinned to bottom */}
        <div className="flex-shrink-0 border-t border-keva-sage-500 pb-2">
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <a
                href="/settings/account"
                className="flex items-center gap-3 flex-1 min-w-0 group"
              >
                <div className="w-8 h-8 rounded-full bg-brass/20 text-brass flex items-center justify-center text-xs font-bold flex-shrink-0 group-hover:bg-brass/30 transition-colors">
                  {(userName || userEmail || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate group-hover:text-brass transition-colors">
                    {userName || 'User'}
                  </div>
                  <div className="text-[11px] text-keva-sage-300 truncate capitalize">
                    {ROLE_LABELS[userRole] || userRole}
                  </div>
                </div>
              </a>
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
      <div className="px-3 mb-2 text-xs font-semibold text-keva-sage-300 uppercase tracking-wider">
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
      className="p-1.5 rounded-md text-keva-sage-300 hover:text-white hover:bg-keva-sage-500 transition-colors"
      title="Sign out"
    >
      <LogOut className="w-4 h-4" />
    </button>
  );
}
