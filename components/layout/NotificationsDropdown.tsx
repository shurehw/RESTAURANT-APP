'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AlertTriangle, Info, XCircle, CheckCheck } from 'lucide-react';

interface EnforcementNotification {
  id: string;
  notification_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export function NotificationsDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<EnforcementNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  // Mark single notification as read + navigate
  const handleClick = async (notification: EnforcementNotification) => {
    if (!notification.is_read) {
      try {
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notification.id }),
        });
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // non-critical
      }
    }

    if (notification.action_url) {
      close();
      router.push(notification.action_url);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-error" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-brass" />;
      case 'info':
        return <Info className="w-4 h-4 text-sage" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const formatTime = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="relative p-2 text-opsos-sage-600 hover:text-opsos-sage-800 hover:bg-opsos-sage-50 rounded-md transition-colors duration-fast"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full animate-pulse"></span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className="fixed inset-0 z-10"
            onClick={close}
          />

          {/* Dropdown Panel */}
          <div className="absolute right-0 mt-2 w-80 bg-white border border-opsos-sage-200 rounded-lg shadow-lg z-20 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-opsos-sage-200 bg-opsos-sage-50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-opsos-sage-900">
                  Notifications
                </h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-error/20 text-error rounded-full font-medium">
                      {unreadCount} new
                    </span>
                  )}
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      disabled={loading}
                      className="text-xs text-brass hover:text-brass-700 font-medium flex items-center gap-1"
                      title="Mark all as read"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleClick(notification)}
                    className={`w-full text-left px-4 py-3 border-b border-opsos-sage-100 hover:bg-opsos-sage-50 cursor-pointer transition-colors ${
                      !notification.is_read ? 'bg-brass/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getIcon(notification.severity)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium text-opsos-sage-900 ${!notification.is_read ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <span className="w-1.5 h-1.5 bg-brass rounded-full flex-shrink-0" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="text-xs text-opsos-sage-600 mt-0.5 line-clamp-2">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-xs text-opsos-sage-500 mt-1">
                          {formatTime(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-8 h-8 text-opsos-sage-300 mx-auto mb-2" />
                  <p className="text-sm text-opsos-sage-600">
                    No notifications
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
