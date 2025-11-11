/**
 * OpsOS AI Assistant Page
 * Natural language interface for analyzing operations
 */

import { ChatInterface } from '@/components/chatbot/ChatInterface';
import { Card } from '@/components/ui/card';
import { Bot } from 'lucide-react';

export default function AssistantPage() {
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brass flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI Assistant</h1>
            <p className="text-sm text-gray-500 mt-1">
              Ask questions about your sales, labor, inventory, and operations
            </p>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ChatInterface />
      </Card>
    </div>
  );
}
