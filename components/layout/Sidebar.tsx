/**
 * components/layout/Sidebar.tsx
 * Sidebar navigation with user profile and logout
 */

import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { LogoutButton } from './LogoutButton';

interface SidebarProps {
  user: User;
}

export function Sidebar({ user }: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-card">
      <div className="flex h-16 items-center px-6 border-b">
        <h1 className="text-xl font-bold">OpsOS</h1>
      </div>

      <nav className="p-4 space-y-1">
        <NavLink href="/">Home</NavLink>
        <NavLink href="/reports/nightly">Nightly Report</NavLink>
        <NavLink href="/labor/briefing">Daily Briefing</NavLink>
        <NavLink href="/preshift">Preshift</NavLink>
        <NavLink href="/control-plane/attestations">Attestations</NavLink>
        <NavLink href="/reports/health">Venue Health</NavLink>
        <NavSection title="Sales">
          <NavLink href="/sales/pace">Live Pulse</NavLink>
          <NavLink href="/sales/forecasts">Forecasts</NavLink>
        </NavSection>
        <NavSection title="Labor">
          <NavLink href="/labor/requirements">Requirements</NavLink>
          <NavLink href="/labor/schedule">Schedule</NavLink>
        </NavSection>
        <NavSection title="COGS">
          <NavLink href="/invoices">Invoices</NavLink>
          <NavLink href="/inventory">Inventory</NavLink>
          <NavLink href="/recipes">Recipes</NavLink>
        </NavSection>
        <div className="border-t my-2"></div>
        <NavLink href="/admin/settings">Settings</NavLink>
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
