DROP POLICY IF EXISTS "trainings insert owner" ON public.trainings;
DROP POLICY IF EXISTS "trainings insert approved or owner" ON public.trainings;

CREATE POLICY "trainings insert approved or owner"
  ON public.trainings FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'aprovado'::public.application_status
    )
  );

DROP POLICY IF EXISTS "videos insert owner" ON public.training_videos;
DROP POLICY IF EXISTS "videos insert approved or owner" ON public.training_videos;

CREATE POLICY "videos insert approved or owner"
  ON public.training_videos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'aprovado'::public.application_status
    )
  );

NOTIFY pgrst, 'reload schema';
