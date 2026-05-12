
CREATE TABLE public.konnect_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  age INT,
  gender TEXT,
  intent TEXT NOT NULL DEFAULT 'nearby',
  mode TEXT NOT NULL DEFAULT 'nearby',
  location_name TEXT,
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  instagram TEXT,
  skills TEXT,
  interests TEXT[],
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours')
);

CREATE INDEX ON public.konnect_users (expires_at);
CREATE INDEX ON public.konnect_users (mode);

CREATE TABLE public.konnect_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session TEXT NOT NULL,
  to_session TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours')
);

CREATE INDEX ON public.konnect_messages (from_session, to_session, created_at);
CREATE INDEX ON public.konnect_messages (to_session, from_session, created_at);

ALTER TABLE public.konnect_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.konnect_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read live users" ON public.konnect_users FOR SELECT USING (expires_at > now());
CREATE POLICY "public insert users" ON public.konnect_users FOR INSERT WITH CHECK (true);
CREATE POLICY "public update users" ON public.konnect_users FOR UPDATE USING (true);
CREATE POLICY "public delete users" ON public.konnect_users FOR DELETE USING (true);

CREATE POLICY "public read messages" ON public.konnect_messages FOR SELECT USING (expires_at > now());
CREATE POLICY "public insert messages" ON public.konnect_messages FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.konnect_users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.konnect_messages;
ALTER TABLE public.konnect_users REPLICA IDENTITY FULL;
ALTER TABLE public.konnect_messages REPLICA IDENTITY FULL;
