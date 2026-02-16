-- Enable Supabase Realtime on sales_snapshots
-- Allows PWA clients to receive instant updates when new snapshots are written
ALTER PUBLICATION supabase_realtime ADD TABLE sales_snapshots;
