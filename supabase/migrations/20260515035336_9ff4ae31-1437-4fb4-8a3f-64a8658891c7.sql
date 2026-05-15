
-- Add precise location fields to users and groups
ALTER TABLE public.konnect_users
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS location_accuracy_m double precision;

ALTER TABLE public.konnect_groups
  ADD COLUMN IF NOT EXISTS location_address text;

-- Group chat messages
CREATE TABLE IF NOT EXISTS public.konnect_group_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL,
  from_session text NOT NULL,
  content text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '02:00:00')
);

ALTER TABLE public.konnect_group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read group messages" ON public.konnect_group_messages
  FOR SELECT USING (expires_at > now());
CREATE POLICY "public insert group messages" ON public.konnect_group_messages
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_konnect_group_messages_group ON public.konnect_group_messages (group_id, created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.konnect_group_messages;
