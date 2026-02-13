'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
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
    </Link>
  );
}
