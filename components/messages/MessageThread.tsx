'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Smile, Paperclip, AtSign } from 'lucide-react';
import { MessageBubble } from './MessageBubble';

interface Message {
  id: string;
  message_text: string;
  sender: {
    id: string;
    first_name: string;
    last_name: string;
  };
  created_at: string;
  mentioned_employee_ids: string[];
  reply_to: any;
  reactions: any;
}

interface Channel {
  id: string;
  name: string;
  channel_type: string;
}

export function MessageThread({
  channel,
  employeeId,
  onNewMessage,
}: {
  channel: Channel;
  employeeId: string;
  onNewMessage: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (channel?.id) {
      loadMessages();
      markAsRead();
    }
  }, [channel?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/messages/${channel.id}?limit=100`);
      const data = await response.json();

      if (data.success) {
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channel.id,
          employee_id: employeeId,
          message_id: messages[messages.length - 1]?.id,
        }),
      });
      onNewMessage();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);

    try {
      // Extract @mentions from message
      const mentionRegex = /@(\w+)/g;
      const mentions = newMessage.match(mentionRegex) || [];
      // TODO: Convert mentions to employee IDs

      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channel.id,
          sender_id: employeeId,
          message_text: newMessage,
          message_type: 'text',
          mentioned_employee_ids: [],
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMessages([...messages, result.message]);
        setNewMessage('');
        onNewMessage();
      } else {
        alert('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error sending message');
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <h2 className="text-xl font-bold">{channel.name}</h2>
        <p className="text-sm text-gray-500 capitalize">
          {channel.channel_type.replace('_', ' ')} channel
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="mb-2">No messages yet</p>
            <p className="text-sm">Be the first to send a message!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const showDateDivider =
              !prevMessage ||
              new Date(message.created_at).toDateString() !==
                new Date(prevMessage.created_at).toDateString();

            return (
              <div key={message.id}>
                {showDateDivider && (
                  <div className="flex items-center justify-center my-4">
                    <div className="bg-gray-200 px-3 py-1 rounded-full text-xs text-gray-600">
                      {new Date(message.created_at).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isOwnMessage={message.sender.id === employeeId}
                />
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t bg-white">
        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Type a message... (@ to mention)"
              className="w-full p-3 pr-24 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-opsos-sage-500"
              rows={1}
              style={{
                minHeight: '44px',
                maxHeight: '120px',
              }}
            />
            <div className="absolute right-2 bottom-2 flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Add emoji"
              >
                <Smile className="w-4 h-4 text-gray-500" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Mention someone"
              >
                <AtSign className="w-4 h-4 text-gray-500" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Attach file"
              >
                <Paperclip className="w-4 h-4 text-gray-500" />
              </Button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="bg-opsos-sage-600 hover:bg-opsos-sage-700 h-11"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Press <kbd className="px-1 py-0.5 bg-gray-100 rounded">Enter</kbd> to send,{' '}
          <kbd className="px-1 py-0.5 bg-gray-100 rounded">Shift + Enter</kbd> for new
          line
        </p>
      </div>
    </div>
  );
}
