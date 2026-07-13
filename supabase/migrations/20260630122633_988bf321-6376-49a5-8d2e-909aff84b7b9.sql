
-- Status enum
CREATE TYPE public.application_status AS ENUM ('pendente','reuniao','aprovado','reprovado');

-- Profile additions
ALTER TABLE public.profiles
  ADD COLUMN status public.application_status NOT NULL DEFAULT 'pendente',
  ADD COLUMN meeting_at TIMESTAMPTZ;

-- Backfill existing users to aprovado
UPDATE public.profiles SET status = 'aprovado';

-- Allow owner to read/update profiles (for admin panel)
CREATE POLICY "profiles select owner" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "profiles update owner" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nick TEXT NOT NULL,
  idade INT NOT NULL,
  do_es BOOLEAN NOT NULL,
  cidade TEXT NOT NULL,
  plataforma TEXT NOT NULL,
  rank_atual TEXT NOT NULL,
  ja_participou_camp BOOLEAN NOT NULL,
  possui_equipe BOOLEAN NOT NULL,
  nome_equipe TEXT,
  objetivo TEXT NOT NULL,
  interesse TEXT NOT NULL,
  discord TEXT,
  entrar_servidor BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apps select own or owner" ON public.applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "apps insert own" ON public.applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "apps update own or owner" ON public.applications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "apps delete owner" ON public.applications
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update handle_new_user: profile stays pendente by default, no role insert change
-- (existing function already inserts player role; we'll gate by profile.status)
