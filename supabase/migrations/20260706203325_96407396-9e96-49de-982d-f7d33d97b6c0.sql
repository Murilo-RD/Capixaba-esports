
CREATE TABLE public.application_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_messages_application ON public.application_messages(application_id, created_at);

GRANT SELECT, INSERT ON public.application_messages TO authenticated;
GRANT ALL ON public.application_messages TO service_role;

ALTER TABLE public.application_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicant or owner can view messages"
  ON public.application_messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Applicant or owner can send messages"
  ON public.application_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'owner')
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = application_id AND a.user_id = auth.uid()
      )
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.application_messages;
