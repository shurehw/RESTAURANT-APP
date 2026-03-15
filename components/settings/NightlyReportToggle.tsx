'use client';

import { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';

export default function NightlyReportToggle() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch('/api/settings/nightly-subscription')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setSubscribed(data.subscribed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch('/api/settings/nightly-subscription', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) setSubscribed(data.subscribed);
    } catch {
      // silently fail
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">Nightly Report</div>
          <div className="text-xs text-muted-foreground">
            Receive a daily summary email for your venues
          </div>
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading || toggling}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:opacity-50 ${
          subscribed ? 'bg-keva-sage-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            subscribed ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
