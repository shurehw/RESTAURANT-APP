/**
 * OpsOS Command — Full View
 * System interface for querying portfolio data, generating insights, initiating actions.
 */

import { ChatInterface } from '@/components/chatbot/ChatInterface';
import { Card } from '@/components/ui/card';
import { Terminal } from 'lucide-react';

export default function AssistantPage() {
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-opsos-slate-800 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-brass" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OpsOS Command</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Query portfolio data, generate insights, initiate actions.
            </p>
          </div>
        </div>
      </div>

      {/* Command Interface */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ChatInterface />
      </Card>
    </div>
  );
}
