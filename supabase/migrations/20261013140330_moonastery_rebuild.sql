BEGIN;
CREATE SCHEMA IF NOT EXISTS moon_private;
REVOKE ALL ON SCHEMA moon_private FROM PUBLIC;
GRANT USAGE ON SCHEMA moon_private TO authenticated, service_role;

-- Quarantine legacy application access. No data or Supabase infrastructure deleted.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN ('profiles','user_roles','weekly_reports','applications','application_messages','trainings','training_videos','rival_teams','matches','team_titles','app_auth_users') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',r.relname);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('app_register','app_login','app_change_password','app_disable_user','app_delete_user','has_role') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',r.signature);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TABLE public.moon_memberships (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 email text NOT NULL, nick text NOT NULL CHECK(length(nick) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','suspended')),
 role text CHECK(role IN('owner','editor','coach','player')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status <> 'approved' OR role IS NOT NULL)
);
CREATE TABLE public.moon_games (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,slug text NOT NULL UNIQUE,description text NOT NULL DEFAULT '',image_url text,active boolean NOT NULL DEFAULT true,display_order integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.moon_archetypes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL UNIQUE,description text NOT NULL DEFAULT '',weights jsonb NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.moon_players (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES public.moon_memberships(id) ON DELETE CASCADE,nick text NOT NULL,bio text NOT NULL DEFAULT '',photo_url text,game_id uuid REFERENCES public.moon_games(id) ON DELETE SET NULL,archetype_id uuid REFERENCES public.moon_archetypes(id) ON DELETE SET NULL,platform text CHECK(platform IN('steam','epic')),platform_id text,public_visible boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),CHECK((platform IS NULL)=(platform_id IS NULL)),UNIQUE(platform,platform_id));
CREATE TABLE public.moon_organization (id text PRIMARY KEY DEFAULT 'default' CHECK(id='default'),name text NOT NULL,description text NOT NULL DEFAULT '',hero_title text NOT NULL,hero_subtitle text NOT NULL DEFAULT '',contact_email text);
CREATE TABLE public.moon_partners (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,description text NOT NULL DEFAULT '',logo_url text,url text,active boolean NOT NULL DEFAULT true,display_order integer NOT NULL DEFAULT 0);
CREATE TABLE public.moon_socials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),platform text NOT NULL,icon text NOT NULL DEFAULT '',url text NOT NULL,active boolean NOT NULL DEFAULT true,display_order integer NOT NULL DEFAULT 0);
CREATE TABLE public.moon_news (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,slug text NOT NULL UNIQUE,summary text NOT NULL DEFAULT '',content text NOT NULL,cover_url text,category text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pending','changes_requested','rejected','published')),author_id uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),review_note text NOT NULL DEFAULT '',reviewed_by uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,CHECK(status <> 'published' OR published_at IS NOT NULL));
CREATE TABLE public.moon_instructions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,description text NOT NULL DEFAULT '',content text NOT NULL,category text NOT NULL,tactical boolean NOT NULL DEFAULT false,target_player_ids uuid[] NOT NULL DEFAULT '{}',media jsonb NOT NULL DEFAULT '[]',author_id uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.moon_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,category text NOT NULL CHECK(category IN('suggestion','technical','complaint','other')),title text NOT NULL,description text NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewing','resolved','dismissed')),response text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.moon_scoring (id text PRIMARY KEY DEFAULT 'default' CHECK(id='default'),config jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.moon_replays (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sha256 text NOT NULL UNIQUE CHECK(sha256 ~ '^[a-f0-9]{64}$'),storage_path text NOT NULL UNIQUE,filename text NOT NULL CHECK(filename ~* '\.replay$'),byte_size bigint NOT NULL CHECK(byte_size > 0 AND byte_size <= 20971520),created_by uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.moon_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),replay_id uuid NOT NULL REFERENCES public.moon_replays(id) ON DELETE CASCADE,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','awaiting_review','approved','discarded','error')),attempt integer NOT NULL DEFAULT 0,session_date date,provider_replay_id text,error_message text,config_snapshot jsonb,logs jsonb NOT NULL DEFAULT '[]',unmatched jsonb NOT NULL DEFAULT '[]',warnings jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX moon_jobs_replay_active ON public.moon_jobs(replay_id) WHERE status <> 'discarded';
CREATE TABLE public.moon_job_players (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES public.moon_jobs(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.moon_players(id) ON DELETE CASCADE,attributes jsonb NOT NULL,raw_metrics jsonb NOT NULL,confidence jsonb NOT NULL DEFAULT '{}',alerts jsonb NOT NULL DEFAULT '[]',config_snapshot jsonb,UNIQUE(job_id,player_id));
CREATE TABLE public.moon_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES public.moon_players(id) ON DELETE CASCADE,session_date date NOT NULL,attributes jsonb NOT NULL,baseline_attributes jsonb NOT NULL,overall numeric(5,2),previous_overall numeric(5,2),baseline_overall numeric(5,2),archetype_id uuid REFERENCES public.moon_archetypes(id) ON DELETE SET NULL,approved_at timestamptz NOT NULL DEFAULT now(),approved_by uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,source_job_ids uuid[] NOT NULL DEFAULT '{}',positives text NOT NULL DEFAULT '',improvements text NOT NULL DEFAULT '',instructions text NOT NULL DEFAULT '',objectives text NOT NULL DEFAULT '',recommendations text NOT NULL DEFAULT '',observations text NOT NULL DEFAULT '',UNIQUE(player_id,session_date),CHECK(overall BETWEEN 0 AND 99));
CREATE TABLE public.moon_cards (player_id uuid PRIMARY KEY REFERENCES public.moon_players(id) ON DELETE CASCADE,attributes jsonb NOT NULL,overall numeric(5,2),previous_overall numeric(5,2),evolution numeric(5,2),report_id uuid NOT NULL REFERENCES public.moon_reports(id) ON DELETE CASCADE,approved_at timestamptz NOT NULL);
CREATE TABLE public.moon_attribute_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES public.moon_players(id) ON DELETE CASCADE,report_id uuid NOT NULL REFERENCES public.moon_reports(id) ON DELETE CASCADE,attributes jsonb NOT NULL,overall numeric(5,2),archetype_id uuid REFERENCES public.moon_archetypes(id) ON DELETE SET NULL,reason text NOT NULL,actor_id uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.moon_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES public.moon_memberships(id) ON DELETE SET NULL,action text NOT NULL,entity_id text,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());

-- Index every foreign key, plus status/pagination and RLS lookups.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.conrelid::regclass AS t,a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.conrelid::regclass::text LIKE '%moon_%' LOOP
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)',replace(r.t::text,'public.','')||'_'||r.attname||'_idx',r.t,r.attname);
 END LOOP;
END $$;
CREATE INDEX moon_memberships_role_status ON public.moon_memberships(role,status);
CREATE INDEX moon_news_publication ON public.moon_news(published_at DESC) WHERE status='published';
CREATE INDEX moon_reports_player_session ON public.moon_reports(player_id,session_date DESC);
CREATE INDEX moon_jobs_status_created ON public.moon_jobs(status,created_at DESC);
CREATE INDEX moon_instructions_targets ON public.moon_instructions USING gin(target_player_ids);

CREATE FUNCTION moon_private.role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT m.role FROM public.moon_memberships m WHERE m.id=(SELECT auth.uid()) AND m.status='approved' AND auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION moon_private.role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moon_private.role() TO anon,authenticated,service_role;
CREATE FUNCTION moon_private.public_player(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.moon_players pl JOIN public.moon_memberships m ON m.id=pl.user_id WHERE pl.id=p AND pl.public_visible AND m.status='approved' AND m.role='player') $$;
REVOKE ALL ON FUNCTION moon_private.public_player(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA moon_private TO anon;
GRANT EXECUTE ON FUNCTION moon_private.public_player(uuid) TO anon,authenticated,service_role;
CREATE FUNCTION moon_private.signup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 INSERT INTO public.moon_memberships(id,email,nick) VALUES(NEW.id,coalesce(NEW.email,''),left(coalesce(nullif(trim(NEW.raw_user_meta_data->>'nick'),''),'Lunático'),200));
 INSERT INTO public.moon_players(user_id,nick) SELECT NEW.id,nick FROM public.moon_memberships WHERE id=NEW.id;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION moon_private.signup() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER moon_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION moon_private.signup();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['memberships','players','games','archetypes','organization','partners','socials','news','instructions','submissions','scoring','replays','jobs','job_players','reports','cards','attribute_history','audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY','moon_'||t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated','moon_'||t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role','moon_'||t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated','moon_'||t);
 END LOOP; END $$;
GRANT SELECT ON public.moon_games,public.moon_archetypes,public.moon_organization,public.moon_partners,public.moon_socials,public.moon_cards TO anon;
REVOKE SELECT ON public.moon_players, public.moon_news FROM authenticated;
GRANT SELECT(id,nick,bio,photo_url,game_id,archetype_id,public_visible) ON public.moon_players TO anon,authenticated;
GRANT SELECT(id,title,slug,summary,content,cover_url,category,status,published_at,created_at) ON public.moon_news TO anon,authenticated;
CREATE POLICY members_self_owner ON public.moon_memberships FOR SELECT TO authenticated USING(id=(SELECT auth.uid()) OR (SELECT moon_private.role())='owner');
CREATE POLICY players_visible ON public.moon_players FOR SELECT TO anon,authenticated USING(moon_private.public_player(id) OR user_id=(SELECT auth.uid()) OR (SELECT moon_private.role()) IN('owner','coach'));
CREATE POLICY cards_visible ON public.moon_cards FOR SELECT TO anon,authenticated USING(moon_private.public_player(player_id) OR (SELECT moon_private.role()) IS NOT NULL);
CREATE POLICY news_visible ON public.moon_news FOR SELECT TO anon,authenticated USING((status='published' AND published_at<=now()) OR (SELECT moon_private.role())='owner' OR ((SELECT moon_private.role())='editor' AND author_id=(SELECT auth.uid())));
CREATE POLICY games_visible ON public.moon_games FOR SELECT TO anon,authenticated USING(active OR (SELECT moon_private.role())='owner');
CREATE POLICY archetypes_visible ON public.moon_archetypes FOR SELECT TO anon,authenticated USING(active OR (SELECT moon_private.role()) IN('owner','coach'));
CREATE POLICY organization_visible ON public.moon_organization FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY partners_visible ON public.moon_partners FOR SELECT TO anon,authenticated USING(active OR (SELECT moon_private.role())='owner');
CREATE POLICY socials_visible ON public.moon_socials FOR SELECT TO anon,authenticated USING(active OR (SELECT moon_private.role())='owner');
CREATE FUNCTION moon_private.own_player() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT id FROM public.moon_players WHERE user_id=(SELECT auth.uid()) AND auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION moon_private.own_player() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moon_private.own_player() TO authenticated,service_role;
CREATE POLICY reports_private ON public.moon_reports FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach') OR ((SELECT moon_private.role())='player' AND player_id=(SELECT moon_private.own_player())));
CREATE POLICY history_private ON public.moon_attribute_history FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach') OR ((SELECT moon_private.role())='player' AND player_id=(SELECT moon_private.own_player())));
CREATE POLICY instructions_private ON public.moon_instructions FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach') OR ((SELECT moon_private.role())='player' AND (cardinality(target_player_ids)=0 OR (SELECT moon_private.own_player())=ANY(target_player_ids))));
CREATE POLICY submissions_private ON public.moon_submissions FOR SELECT TO authenticated USING((SELECT moon_private.role())='owner' OR ((SELECT moon_private.role())='player' AND author_id=(SELECT auth.uid())));
CREATE POLICY scoring_private ON public.moon_scoring FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach'));
CREATE POLICY replays_private ON public.moon_replays FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach'));
CREATE POLICY jobs_private ON public.moon_jobs FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach'));
CREATE POLICY job_players_private ON public.moon_job_players FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach'));
CREATE POLICY audit_private ON public.moon_audit FOR SELECT TO authenticated USING((SELECT moon_private.role())='owner');

INSERT INTO public.moon_organization(name,hero_title,hero_subtitle,description) VALUES('Moonastery E-Sports','A próxima fase é nossa.','Talento, método e evolução.','Uma organização de eSports movida por evolução e competição.');
INSERT INTO public.moon_games(name,slug,description,display_order) VALUES('Rocket League','rocket-league','Precisão, velocidade e jogo coletivo.',0),('Counter-Strike 2','counter-strike-2','Estratégia e execução em equipe.',1),('VALORANT','valorant','Tática, habilidade e cooperação.',2);
INSERT INTO public.moon_archetypes(name,description,weights) VALUES
 ('Anchor','Segurança defensiva e cobertura.','{"VEL":0.08,"FIN":0.06,"CRI":0.08,"DEF":0.28,"POS":0.24,"BST":0.14,"IMP":0.12}'),
 ('Playmaker','Construção e leitura das oportunidades.','{"VEL":0.12,"FIN":0.10,"CRI":0.28,"DEF":0.08,"POS":0.20,"BST":0.10,"IMP":0.12}'),
 ('Striker','Finalização e presença ofensiva.','{"VEL":0.14,"FIN":0.30,"CRI":0.14,"DEF":0.06,"POS":0.12,"BST":0.08,"IMP":0.16}');
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('moon-avatars','moon-avatars',true,5242880,ARRAY['image/png','image/jpeg','image/webp']),('moon-content','moon-content',true,5242880,ARRAY['image/png','image/jpeg','image/webp']),('moon-replays','moon-replays',false,20971520,ARRAY['application/octet-stream']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY moon_media_public ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id IN('moon-avatars','moon-content'));
-- Storage writes occur through server validation using service_role only.
COMMIT;
