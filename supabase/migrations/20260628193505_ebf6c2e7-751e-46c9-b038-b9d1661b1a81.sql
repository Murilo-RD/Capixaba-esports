
CREATE TYPE public.training_level AS ENUM ('platina','champion','grand_champion','ssl');

CREATE TABLE public.trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo text NOT NULL,
  nivel public.training_level NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainings TO authenticated;
GRANT ALL ON public.trainings TO service_role;

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainings select all auth" ON public.trainings FOR SELECT TO authenticated USING (true);
CREATE POLICY "trainings insert owner" ON public.trainings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "trainings update owner" ON public.trainings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "trainings delete owner" ON public.trainings FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.weekly_reports ADD COLUMN mecanica integer;
