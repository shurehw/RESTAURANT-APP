'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Tab {
  key: string;
  label: string;
}

interface HubTabBarProps {
  tabs: Tab[];
  basePath: string;
  defaultTab: string;
}

export function HubTabBar({ tabs, basePath, defaultTab }: HubTabBarProps) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || defaultTab;

  return (
    <div className="flex gap-0 border-b mb-6">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`${basePath}?tab=${tab.key}`}
          prefetch={false}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.key
              ? 'border-brass text-brass'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
