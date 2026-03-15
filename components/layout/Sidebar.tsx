/**
 * components/layout/Sidebar.tsx
 * Desktop sidebar navigation — mirrors MobileSidebar structure
 */

import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { LogoutButton } from './LogoutButton';
import { KevaOSLogo } from '@/components/ui/KevaOSLogo';
import { getNavPermissions, type UserRole } from '@/lib/nav/role-permissions';

interface SidebarProps {
  user: User;
  userRole: UserRole;
}

export function Sidebar({ user, userRole }: SidebarProps) {
  const permissions = getNavPermissions(userRole);

  return (
    <aside className="w-64 border-r bg-card">
      <div className="flex h-16 items-center px-6 border-b">
        <KevaOSLogo size="md" />
      </div>

      <nav className="p-4 space-y-1">
        {/* Primary ops */}
        <NavLink href="/">Home</NavLink>
        {permissions.nightlyReport && (
          <NavLink href="/reports/nightly">Nightly Report</NavLink>
        )}
        {permissions.preshift && (
          <NavLink href="/preshift">Preshift</NavLink>
        )}
        {permissions.laborSchedule && (
          <NavLink href="/floor-plan">Floor Plan</NavLink>
        )}
        {permissions.oversight && (
          <NavLink href="/oversight">Oversight</NavLink>
        )}

        {/* Revenue */}
        {(permissions.forecasts || permissions.reservations) && (
          <NavSection title="Revenue">
            {permissions.forecasts && (
              <NavLink href="/sales/forecasts">Forecasts</NavLink>
            )}
            {permissions.reservations && (
              <NavLink href="/sales/reservations">Reservations</NavLink>
            )}
            {permissions.agents && (
              <NavLink href="/admin/rez-yield-agent">Revenue Agent</NavLink>
            )}
          </NavSection>
        )}

        {/* Labor */}
        {(permissions.laborRequirements || permissions.laborSchedule) && (
          <NavSection title="Labor">
            {permissions.laborRequirements && (
              <NavLink href="/labor/requirements">Requirements</NavLink>
            )}
            {permissions.laborSchedule && (
              <NavLink href="/labor/schedule">Schedule</NavLink>
            )}
            {permissions.laborSchedule && (
              <NavLink href="/labor/agent">Agent</NavLink>
            )}
            {permissions.laborSchedule && (
              <NavLink href="/labor/efficiency">Efficiency</NavLink>
            )}
          </NavSection>
        )}

        {/* COGS */}
        {(permissions.orders || permissions.recipes || permissions.inventory) && (
          <NavSection title="COGS">
            {permissions.orders && (
              <NavLink href="/purchasing">Purchasing</NavLink>
            )}
            {permissions.recipes && (
              <NavLink href="/menu">Menu</NavLink>
            )}
            {permissions.inventory && (
              <NavLink href="/inventory">Inventory</NavLink>
            )}
            {permissions.budget && (
              <NavLink href="/cost-reports">Cost Reports</NavLink>
            )}
            {permissions.agents && (
              <NavLink href="/admin/menu-agent">Menu Agent</NavLink>
            )}
            {permissions.agents && (
              <NavLink href="/admin/procurement-agent">Procurement Agent</NavLink>
            )}
          </NavSection>
        )}

        <div className="border-t my-2"></div>
        {permissions.laborSchedule && (
          <NavLink href="/admin/floor-plan-builder">Floor Plan Builder</NavLink>
        )}
        {(permissions.orgSettings || permissions.compSettings || permissions.procurementSettings) && (
          <NavLink href="/admin/settings">Settings</NavLink>
        )}
      </nav>

      <div className="absolute bottom-0 w-64 border-t p-4">
        <div className="mb-2">
          <p className="text-sm font-medium truncate">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            {user.user_metadata?.full_name || 'User'}
          </p>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="block px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {children}
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </div>
      <div className="space-y-1 pl-2">
        {children}
      </div>
    </div>
  );
}
