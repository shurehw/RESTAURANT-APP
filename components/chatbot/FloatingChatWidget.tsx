'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Send, User, Loader2, X, Maximize2, Minimize2, RotateCcw, Command, Terminal } from 'lucide-react';
import Link from 'next/link';
import { ChatMarkdown } from './ChatMarkdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: 'Query portfolio data, generate insights, or initiate actions.',
};

/** Dispatch this to toggle the command panel from anywhere */
const TOGGLE_EVENT = 'opsos:toggle-command';

export function toggleCommandPanel() {
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
}

export function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isExpanded]);

  // Listen for toggle events from CommandTrigger
  useEffect(() => {
    const handler = () => setIsOpen(prev => !prev);
    window.addEventListener(TOGGLE_EVENT, handler);
    return () => window.removeEventListener(TOGGLE_EVENT, handler);
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
          history: messages.slice(1),
          ...(conversationId && { conversationId }),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      if (data.conversationId) setConversationId(data.conversationId);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || 'Unable to process that request.',
        },
      ]);
    } catch (error) {
      console.error('Command error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error processing request. Try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewSession = () => {
    setMessages([INITIAL_MESSAGE]);
    setInput('');
    setConversationId(null);
  };

  if (!isOpen) return null;

  if (isExpanded) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
        <Card className="w-full sm:max-w-4xl h-full sm:h-[80vh] sm:rounded-lg rounded-none flex flex-col border-border">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-opsos-slate-800 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-brass" />
              </div>
              <div>
                <h2 className="font-semibold text-sm tracking-tight">OpsOS Command</h2>
                <p className="text-xs text-muted-foreground">Query portfolio data, generate insights, initiate actions.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 1 && (
                <Button variant="ghost" size="sm" onClick={handleNewSession} disabled={loading} title="New Session">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
              <Link href="/assistant">
                <Button variant="ghost" size="sm" className="text-xs">Full View</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
                <Minimize2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message, idx) => (
              <div key={idx} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-opsos-slate-800 flex items-center justify-center">
                    <Terminal className="w-4 h-4 text-brass" />
                  </div>
                )}
                <div className={`rounded-lg px-4 py-3 ${message.role === 'user' ? 'max-w-[70%] bg-opsos-sage-600 text-white' : 'max-w-[85%] bg-muted text-foreground'}`}>
                  {message.role === 'assistant' ? (
                    <ChatMarkdown content={message.content} className="text-sm" />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-opsos-sage-600 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-opsos-slate-800 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-brass" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-brass" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Query sales, labor, comps, inventory..."
                className="flex-1 px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brass text-sm"
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !input.trim()} className="bg-brass hover:bg-brass/90">
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
      className="fixed right-0 sm:right-6 w-full sm:w-96 h-[calc(100vh-3.5rem)] sm:h-[600px] flex flex-col shadow-2xl z-50 rounded-none sm:rounded-lg border-border"
      style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border sm:rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-opsos-slate-800 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-brass" />
          </div>
          <div>
            <h3 className="font-semibold text-sm tracking-tight">OpsOS Command</h3>
            <p className="text-[11px] text-muted-foreground">Query data, insights, actions.</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <Button variant="ghost" size="sm" onClick={handleNewSession} disabled={loading} title="New Session">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(true)} title="Expand">
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((message, idx) => (
          <div key={idx} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-opsos-slate-800 flex items-center justify-center">
                <Terminal className="w-3.5 h-3.5 text-brass" />
              </div>
            )}
            <div className={`rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'max-w-[75%] bg-opsos-sage-600 text-white' : 'max-w-[90%] bg-muted text-foreground'}`}>
              {message.role === 'assistant' ? (
                <ChatMarkdown content={message.content} className="text-sm" />
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </div>
            {message.role === 'user' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-opsos-sage-600 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-opsos-slate-800 flex items-center justify-center">
              <Terminal className="w-3.5 h-3.5 text-brass" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-brass" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query sales, labor, comps..."
            className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brass"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()} size="sm" className="bg-brass hover:bg-brass/90">
            <Send className="w-3 h-3" />
          </Button>
        </form>
      </div>
    </Card>
  );
}

/** Inline trigger button — place in headers/toolbars */
export function CommandTrigger() {
  return (
    <button
      onClick={toggleCommandPanel}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 border-opsos-brass/30 bg-opsos-brass/5 hover:bg-opsos-brass/10 text-foreground hover:border-opsos-brass/50 transition-colors shadow-sm"
      title="Command (Ctrl+K)"
    >
      <Command className="w-4 h-4" />
      <span className="text-xs font-semibold">Command</span>
    </button>
  );
}
