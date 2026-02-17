'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Send, Bot, User, Loader2, X, Maximize2, Minimize2, MessageCircle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { ChatMarkdown } from './ChatMarkdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: 'Hi! I can query your POS data directly — ask about sales, servers, comps, menu items, and more.',
};

export function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      // Track conversation ID from server
      if (data.conversationId) setConversationId(data.conversationId);

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.answer || 'Sorry, I couldn\'t process that request.',
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 sm:right-6 w-14 h-14 bg-brass hover:bg-brass/90 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Open AI Assistant"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  if (isExpanded) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
        <Card className="w-full sm:max-w-4xl h-full sm:h-[80vh] sm:rounded-lg rounded-none flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brass flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-semibold">OpsOS AI Assistant</h2>
                <p className="text-xs text-gray-500">Ask about your operations</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewChat}
                  disabled={loading}
                  title="New Chat"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
              <Link href="/assistant">
                <Button variant="ghost" size="sm">
                  Open Full Page
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
              >
                <Minimize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

          {/* Input */}
          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about sales, labor, inventory..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brass"
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
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card
      className="fixed right-0 sm:right-6 w-full sm:w-96 h-[calc(100vh-3.5rem)] sm:h-[600px] flex flex-col shadow-2xl z-50 rounded-none sm:rounded-lg"
      style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white sm:rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brass flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Assistant</h3>
            <p className="text-xs text-gray-500">Ask me anything</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={loading}
              title="New Chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(true)}
            title="Expand"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`flex gap-2 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brass flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}

            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'max-w-[75%] bg-opsos-sage-600 text-white'
                  : 'max-w-[90%] bg-white text-gray-900 shadow-sm'
              }`}
            >
              {message.role === 'assistant' ? (
                <ChatMarkdown content={message.content} className="text-sm" />
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-opsos-sage-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brass flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white rounded-lg px-3 py-2 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-brass" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 bg-white sm:rounded-b-lg" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brass"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            size="sm"
            className="bg-brass hover:bg-brass/90"
          >
            <Send className="w-3 h-3" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
