
-- 1) Vídeos de treino (exemplos de jogadas via YouTube)
CREATE TABLE public.training_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  nivel public.training_level NOT NULL,
  youtube_url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_videos TO authenticated;
GRANT ALL ON public.training_videos TO service_role;
ALTER TABLE public.training_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "videos select all auth" ON public.training_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "videos insert owner" ON public.training_videos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "videos update owner" ON public.training_videos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "videos delete owner" ON public.training_videos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER training_videos_updated_at
  BEFORE UPDATE ON public.training_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Campos do Rocket League no perfil (para sincronizar via Tracker Network)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS rocket_league_id TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS mmr_1v1 INT,
  ADD COLUMN IF NOT EXISTS rank_1v1 TEXT,
  ADD COLUMN IF NOT EXISTS mmr_2v2 INT,
  ADD COLUMN IF NOT EXISTS rank_2v2 TEXT,
  ADD COLUMN IF NOT EXISTS mmr_3v3 INT,
  ADD COLUMN IF NOT EXISTS rank_3v3 TEXT,
  ADD COLUMN IF NOT EXISTS tracker_synced_at TIMESTAMPTZ;

-- 3) Vitrine pública: qualquer visitante (mesmo deslogado) pode ver os jogadores APROVADOS
CREATE POLICY "profiles public roster" ON public.profiles FOR SELECT TO anon
  USING (status = 'aprovado');
CREATE POLICY "profiles select approved auth" ON public.profiles FOR SELECT TO authenticated
  USING (status = 'aprovado');

GRANT SELECT ON public.profiles TO anon;
