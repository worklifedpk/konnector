
ALTER TABLE public.konnect_users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS event_type text;

CREATE TABLE IF NOT EXISTS public.konnect_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_session text NOT NULL,
  name text NOT NULL,
  event_type text NOT NULL,
  mode text NOT NULL,
  location_name text,
  location_lat double precision NOT NULL,
  location_lng double precision NOT NULL,
  max_size integer NOT NULL DEFAULT 10,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  CHECK (max_size BETWEEN 2 AND 100)
);
ALTER TABLE public.konnect_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read live groups" ON public.konnect_groups FOR SELECT USING (expires_at > now());
CREATE POLICY "public insert groups" ON public.konnect_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "public update groups" ON public.konnect_groups FOR UPDATE USING (true);
CREATE POLICY "public delete groups" ON public.konnect_groups FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.konnect_group_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  from_session text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  UNIQUE (group_id, from_session)
);
ALTER TABLE public.konnect_group_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read group reqs" ON public.konnect_group_requests FOR SELECT USING (expires_at > now());
CREATE POLICY "public insert group reqs" ON public.konnect_group_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "public update group reqs" ON public.konnect_group_requests FOR UPDATE USING (true);
CREATE POLICY "public delete group reqs" ON public.konnect_group_requests FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.konnect_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  session_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  UNIQUE (group_id, session_id)
);
ALTER TABLE public.konnect_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read members" ON public.konnect_group_members FOR SELECT USING (expires_at > now());
CREATE POLICY "public insert members" ON public.konnect_group_members FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete members" ON public.konnect_group_members FOR DELETE USING (true);
