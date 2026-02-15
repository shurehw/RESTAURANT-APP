'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({
  href,
  icon,
  children,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: number;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`nav-link${isActive ? ' active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {icon}
      <span>{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
}
