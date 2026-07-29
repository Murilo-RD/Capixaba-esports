CREATE TABLE IF NOT EXISTS public.team_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_name text NOT NULL,
  championship_logo_url text,
  trophy_image_url text,
  achieved_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.team_titles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_titles TO authenticated;
GRANT ALL ON public.team_titles TO service_role;

ALTER TABLE public.team_titles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_titles public read" ON public.team_titles;
DROP POLICY IF EXISTS "team_titles owner insert" ON public.team_titles;
DROP POLICY IF EXISTS "team_titles owner update" ON public.team_titles;
DROP POLICY IF EXISTS "team_titles owner delete" ON public.team_titles;

CREATE POLICY "team_titles public read"
  ON public.team_titles FOR SELECT
  USING (true);

CREATE POLICY "team_titles owner insert"
  ON public.team_titles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "team_titles owner update"
  ON public.team_titles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "team_titles owner delete"
  ON public.team_titles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE INDEX IF NOT EXISTS idx_team_titles_achieved_at ON public.team_titles(achieved_at DESC NULLS LAST);

NOTIFY pgrst, 'reload schema';
