'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, AlertTriangle, TrendingUp, XCircle } from 'lucide-react';

interface Notification {
  id: string;
  type: 'warning' | 'info' | 'error';
  title: string;
  message: string;
  time: string;
}

export function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  // Mock notifications - will be replaced with real data
  const notifications: Notification[] = [
    {
      id: '1',
      type: 'warning',
      title: 'Budget Alert',
      message: 'Weekly budget is 85% spent',
      time: '2h ago',
    },
    {
      id: '2',
      type: 'info',
      title: 'New Invoice',
      message: 'Sysco invoice pending approval',
      time: '4h ago',
    },
    {
      id: '3',
      type: 'error',
      title: 'Price Increase',
      message: 'Prime beef up 12% this week',
      time: '1d ago',
    },
  ];

  const unreadCount = notifications.length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-brass" />;
      case 'info':
        return <TrendingUp className="w-4 h-4 text-sage" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-error" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
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
          <span className="absolute top-1 right-1 w-2 h-2 bg-brass rounded-full"></span>
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
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-brass/20 text-brass rounded-full font-medium">
                    {unreadCount} new
                  </span>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="px-4 py-3 border-b border-opsos-sage-100 hover:bg-opsos-sage-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-opsos-sage-900">
                          {notification.title}
                        </p>
                        <p className="text-xs text-opsos-sage-600 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-xs text-opsos-sage-500 mt-1">
                          {notification.time}
                        </p>
                      </div>
                    </div>
                  </div>
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

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-opsos-sage-200 bg-opsos-sage-50">
                <button className="text-xs text-brass hover:text-brass-700 font-medium w-full text-center">
                  View all notifications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
