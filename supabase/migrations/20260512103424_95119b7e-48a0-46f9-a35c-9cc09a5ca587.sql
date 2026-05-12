
CREATE TABLE public.konnect_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session TEXT NOT NULL,
  to_session TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  UNIQUE (from_session, to_session)
);

CREATE INDEX ON public.konnect_requests (to_session, status);
CREATE INDEX ON public.konnect_requests (from_session, status);

ALTER TABLE public.konnect_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read requests" ON public.konnect_requests FOR SELECT USING (expires_at > now());
CREATE POLICY "public insert requests" ON public.konnect_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "public update requests" ON public.konnect_requests FOR UPDATE USING (true);
CREATE POLICY "public delete requests" ON public.konnect_requests FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.konnect_requests;
ALTER TABLE public.konnect_requests REPLICA IDENTITY FULL;
