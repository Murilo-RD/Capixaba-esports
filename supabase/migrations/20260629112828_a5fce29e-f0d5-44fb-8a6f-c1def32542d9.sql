CREATE POLICY "reports select all auth for ranking"
ON public.weekly_reports
FOR SELECT
TO authenticated
USING (true);