'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { NavLink } from '@/components/layout/NavLink';
import { OpsOSLogo } from '@/components/ui/OpsOSLogo';
import { getNavPermissions, type UserRole } from '@/lib/nav/role-permissions';

interface MobileSidebarProps {
  criticalViolationCount: number;
  organizationSlug?: string;
  userRole: UserRole;
}

export function MobileSidebar({ criticalViolationCount, organizationSlug, userRole }: MobileSidebarProps) {
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
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-opsos-sage-600 border-r-2 border-brass
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center px-4 border-b-2 border-brass bg-white">
          <OpsOSLogo size="lg" />
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-6rem)]" aria-label="Main navigation">
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

          <div className="pt-4 mt-4 border-t border-opsos-sage-500">
            {permissions.aiAssistant && (
              <NavLink href="/assistant" icon={<Bot className="w-5 h-5" />}>
                AI Assistant
              </NavLink>
            )}
            {permissions.budget && (
              <NavLink href="/budget" icon={<DollarSign className="w-5 h-5" />}>
                Budget
              </NavLink>
            )}
          </div>

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

        {/* Brass accent line at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-brass"></div>
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
