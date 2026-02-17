'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Send, Bot, User, Loader2, RotateCcw } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: 'Hello! I\'m your OpsOS assistant. I can query your POS data directly — ask me about sales, servers, menu items, comps, labor, reservations, and more.',
};

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: input,
          history: messages.slice(1), // Exclude initial greeting
          ...(conversationId && { conversationId }),
        }),
      });

      const data = await response.json();

      if (!response.ok && !data.answer) {
        throw new Error(data.message || 'Failed to get response');
      }

      // Track conversation ID from server
      if (data.conversationId) setConversationId(data.conversationId);

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.answer || 'Sorry, I couldn\'t process that request.',
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: msg.includes('session') || msg.includes('authenticated')
            ? msg
            : 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([INITIAL_MESSAGE]);
    setInput('');
    setConversationId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {messages.length > 1 && (
        <div className="flex items-center justify-end px-6 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewChat}
            disabled={loading}
            className="text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1.5" />
            New Chat
          </Button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brass flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}

            <div
              className={`rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'max-w-[70%] bg-opsos-sage-600 text-white'
                  : 'max-w-[85%] bg-gray-100 text-gray-900'
              }`}
            >
              {message.role === 'assistant' ? (
                <ChatMarkdown content={message.content} className="text-sm" />
              ) : (
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-opsos-sage-600 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brass flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-brass" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about sales, labor, inventory, budgets..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brass focus:border-transparent"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-brass hover:bg-brass/90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>

        {/* Example Queries */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setInput('What were last night\'s sales?')}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
            disabled={loading}
          >
            Last night's sales
          </button>
          <button
            onClick={() => setInput('Who was my top server last night?')}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
            disabled={loading}
          >
            Top server
          </button>
          <button
            onClick={() => setInput('Show me comps from last night')}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
            disabled={loading}
          >
            Comp summary
          </button>
          <button
            onClick={() => setInput('What were my top selling items this week?')}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
            disabled={loading}
          >
            Top menu items
          </button>
        </div>
      </div>
    </div>
  );
}
