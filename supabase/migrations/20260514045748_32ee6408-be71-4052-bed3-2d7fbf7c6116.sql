
ALTER TABLE public.konnect_group_requests
  ADD COLUMN IF NOT EXISTS to_session text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'join';
