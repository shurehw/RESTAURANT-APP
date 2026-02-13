-- =====================================================
-- Chatbot Conversations Log
-- =====================================================
-- Stores every chatbot exchange for analytics, adoption tracking,
-- and improvement of the AI assistant.
--
-- Design:
--   - One row per user question + AI response pair
--   - conversation_id groups messages in the same session
--   - tools_used tracks which data tools the AI invoked
--   - Async insert (fire-and-forget) — never blocks the response
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chatbot_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,           -- Groups messages in same chat session
  org_id        uuid NOT NULL,
  user_id       uuid NOT NULL,             -- auth.users id
  venue_ids     uuid[] DEFAULT '{}',       -- Venues in scope for this query

  -- Content
  question      text NOT NULL,
  answer        text,
  tools_used    text[] DEFAULT '{}',       -- e.g. ['get_daily_sales', 'get_labor_summary']
  tool_calls    int DEFAULT 0,             -- Number of tool-use iterations

  -- Metadata
  model         text DEFAULT 'claude-haiku-4-5-20251001',
  response_time_ms int,                    -- End-to-end response time
  error         text,                      -- Error message if failed

  -- Timestamps
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX idx_chatbot_conv_org       ON public.chatbot_conversations (org_id, created_at DESC);
CREATE INDEX idx_chatbot_conv_user      ON public.chatbot_conversations (user_id, created_at DESC);
CREATE INDEX idx_chatbot_conv_session   ON public.chatbot_conversations (conversation_id, created_at);

-- RLS
ALTER TABLE public.chatbot_conversations ENABLE ROW LEVEL SECURITY;

-- Service role can insert (server-side API route)
CREATE POLICY chatbot_conv_service_insert ON public.chatbot_conversations
  FOR INSERT TO service_role WITH CHECK (true);

-- Service role can read all
CREATE POLICY chatbot_conv_service_select ON public.chatbot_conversations
  FOR SELECT TO service_role USING (true);

-- Authenticated users can read their own conversations
CREATE POLICY chatbot_conv_user_select ON public.chatbot_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.chatbot_conversations IS 'Stores chatbot Q&A exchanges for analytics and improvement';
