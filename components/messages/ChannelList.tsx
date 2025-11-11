'use client';

import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Users,
  Megaphone,
  Hash,
  Lock,
} from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  channel_type: string;
  unread_count: number;
  last_message_at: string;
  message_count: number;
  is_private?: boolean;
}

export function ChannelList({
  channels,
  activeChannelId,
  onChannelSelect,
}: {
  channels: Channel[];
  activeChannelId?: string;
  onChannelSelect: (channel: Channel) => void;
}) {
  const getChannelIcon = (type: string, isPrivate?: boolean) => {
    switch (type) {
      case 'direct':
        return <MessageCircle className="w-5 h-5" />;
      case 'announcement':
        return <Megaphone className="w-5 h-5" />;
      case 'group':
        return isPrivate ? (
          <Lock className="w-5 h-5" />
        ) : (
          <Users className="w-5 h-5" />
        );
      default:
        return <Hash className="w-5 h-5" />;
    }
  };

  const formatLastMessageTime = (timestamp: string) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString();
  };

  return (
    <div className="divide-y">
      {channels.map((channel) => (
        <button
          key={channel.id}
          onClick={() => onChannelSelect(channel)}
          className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
            activeChannelId === channel.id ? 'bg-opsos-sage-50' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 ${
                channel.channel_type === 'announcement'
                  ? 'text-blue-600'
                  : channel.unread_count > 0
                  ? 'text-opsos-sage-600'
                  : 'text-gray-400'
              }`}
            >
              {getChannelIcon(channel.channel_type, channel.is_private)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3
                  className={`font-semibold truncate ${
                    channel.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'
                  }`}
                >
                  {channel.name || 'Unnamed Channel'}
                </h3>
                <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                  {formatLastMessageTime(channel.last_message_at)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 truncate">
                  {channel.message_count}{' '}
                  {channel.message_count === 1 ? 'message' : 'messages'}
                </p>
                {channel.unread_count > 0 && (
                  <Badge className="bg-opsos-sage-600 text-white">
                    {channel.unread_count}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
