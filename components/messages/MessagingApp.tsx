'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Users,
  Megaphone,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { ChannelList } from './ChannelList';
import { MessageThread } from './MessageThread';
import { NewChannelModal } from './NewChannelModal';
import { NewDMModal } from './NewDMModal';

interface Channel {
  id: string;
  name: string;
  channel_type: string;
  unread_count: number;
  last_message_at: string;
  message_count: number;
}

export function MessagingApp({
  employeeId,
  venueId,
}: {
  employeeId: string;
  venueId: string;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadChannels();
  }, [employeeId, venueId]);

  const loadChannels = async () => {
    try {
      const response = await fetch(
        `/api/messages/channels?employee_id=${employeeId}&venue_id=${venueId}`
      );
      const data = await response.json();

      if (data.success) {
        setChannels(data.channels || []);
        // Auto-select first channel if none selected
        if (!activeChannel && data.channels?.length > 0) {
          setActiveChannel(data.channels[0]);
        }
      }
    } catch (error) {
      console.error('Error loading channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChannelSelect = (channel: Channel) => {
    setActiveChannel(channel);
  };

  const handleNewMessage = () => {
    // Reload channels to update unread counts
    loadChannels();
  };

  const filteredChannels = channels.filter((ch) =>
    ch.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = channels.reduce((sum, ch) => sum + (ch.unread_count || 0), 0);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - Channel List */}
      <div className="w-80 bg-white border-r flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-opsos-sage-600" />
              <h1 className="text-xl font-bold">Messages</h1>
              {totalUnread > 0 && (
                <Badge className="bg-red-500 text-white">{totalUnread}</Badge>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewDM(true)}
                title="New DM"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewChannel(true)}
                title="New Channel"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Channel List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : filteredChannels.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchQuery ? 'No channels found' : 'No conversations yet'}
            </div>
          ) : (
            <ChannelList
              channels={filteredChannels}
              activeChannelId={activeChannel?.id}
              onChannelSelect={handleChannelSelect}
            />
          )}
        </div>
      </div>

      {/* Main Content - Message Thread */}
      <div className="flex-1 flex flex-col">
        {activeChannel ? (
          <MessageThread
            channel={activeChannel}
            employeeId={employeeId}
            onNewMessage={handleNewMessage}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold mb-2">No conversation selected</h2>
              <p>Choose a conversation or start a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewChannel && (
        <NewChannelModal
          venueId={venueId}
          employeeId={employeeId}
          onClose={() => setShowNewChannel(false)}
          onCreated={() => {
            setShowNewChannel(false);
            loadChannels();
          }}
        />
      )}

      {showNewDM && (
        <NewDMModal
          venueId={venueId}
          employeeId={employeeId}
          onClose={() => setShowNewDM(false)}
          onCreated={(channel) => {
            setShowNewDM(false);
            setActiveChannel(channel);
            loadChannels();
          }}
        />
      )}
    </div>
  );
}
