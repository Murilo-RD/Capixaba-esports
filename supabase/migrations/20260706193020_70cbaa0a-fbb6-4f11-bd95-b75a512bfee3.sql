
-- rival_teams
CREATE TABLE public.rival_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rival_teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rival_teams TO authenticated;
GRANT ALL ON public.rival_teams TO service_role;
ALTER TABLE public.rival_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rival_teams public read" ON public.rival_teams FOR SELECT USING (true);
CREATE POLICY "rival_teams owner insert" ON public.rival_teams FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "rival_teams owner update" ON public.rival_teams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "rival_teams owner delete" ON public.rival_teams FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- matches
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rival_team_id uuid NOT NULL REFERENCES public.rival_teams(id) ON DELETE CASCADE,
  competition text NOT NULL,
  our_score int NOT NULL DEFAULT 0,
  rival_score int NOT NULL DEFAULT 0,
  played_at date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches public read" ON public.matches FOR SELECT USING (true);
CREATE POLICY "matches owner insert" ON public.matches FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "matches owner update" ON public.matches FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "matches owner delete" ON public.matches FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- applications: quick request + available slots + relax not-nulls
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS available_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quick_request boolean NOT NULL DEFAULT false;

ALTER TABLE public.applications ALTER COLUMN cidade DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN idade DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN interesse DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN objetivo DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN plataforma DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN rank_atual DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN do_es DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN entrar_servidor DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN ja_participou_camp DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN possui_equipe DROP NOT NULL;
