-- Recreates Moonastery application data and schema in the current Supabase project.
-- Back up the database and confirm the project before running this in SQL Editor.
-- Existing auth.users, other public tables, Storage buckets and files are preserved.
BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE SCHEMA IF NOT EXISTS moon_private;

DROP TRIGGER IF EXISTS moon_auth_user_created ON auth.users;
DROP POLICY IF EXISTS moon_media_public ON storage.objects;

DROP FUNCTION IF EXISTS public.moon_complete_processing(uuid,integer,jsonb) RESTRICT;
DROP FUNCTION IF EXISTS public.moon_delete_report(uuid,uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.moon_change_archetype(uuid,uuid,uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.moon_approve_job(uuid,uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.moon_manage_member(uuid,uuid,text,text) RESTRICT;

-- Child tables first. RESTRICT aborts if an unknown external object depends on one.
DROP TABLE IF EXISTS public.moon_processing_history RESTRICT;
DROP TABLE IF EXISTS public.moon_job_players RESTRICT;
DROP TABLE IF EXISTS public.moon_cards RESTRICT;
DROP TABLE IF EXISTS public.moon_attribute_history RESTRICT;
DROP TABLE IF EXISTS public.moon_reports RESTRICT;
DROP TABLE IF EXISTS public.moon_jobs RESTRICT;
DROP TABLE IF EXISTS public.moon_replays RESTRICT;
DROP TABLE IF EXISTS public.moon_news RESTRICT;
DROP TABLE IF EXISTS public.moon_instructions RESTRICT;
DROP TABLE IF EXISTS public.moon_submissions RESTRICT;
DROP TABLE IF EXISTS public.moon_audit RESTRICT;
DROP TABLE IF EXISTS public.moon_players RESTRICT;
DROP TABLE IF EXISTS public.moon_scoring RESTRICT;
DROP TABLE IF EXISTS public.moon_partners RESTRICT;
DROP TABLE IF EXISTS public.moon_socials RESTRICT;
DROP TABLE IF EXISTS public.moon_organization RESTRICT;
DROP TABLE IF EXISTS public.moon_games RESTRICT;
DROP TABLE IF EXISTS public.moon_archetypes RESTRICT;
DROP TABLE IF EXISTS public.moon_memberships RESTRICT;

DROP FUNCTION IF EXISTS moon_private.validate_weights() RESTRICT;
DROP FUNCTION IF EXISTS moon_private.reviewable_scores() RESTRICT;
DROP FUNCTION IF EXISTS moon_private.own_player() RESTRICT;
DROP FUNCTION IF EXISTS moon_private.signup() RESTRICT;
DROP FUNCTION IF EXISTS moon_private.public_player(uuid) RESTRICT;
DROP FUNCTION IF EXISTS moon_private.role() RESTRICT;
DROP FUNCTION IF EXISTS moon_private.overall(jsonb,jsonb) RESTRICT;
DROP FUNCTION IF EXISTS moon_private.assert_actor(uuid,text[]) RESTRICT;
DROP SCHEMA IF EXISTS moon_private RESTRICT;

-- Source: supabase/migrations/20261013140330_moonastery_rebuild.sql
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
CREATE TABLE public.moon_players (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES public.moon_memberships(id) ON DELETE CASCADE,nick text NOT NULL,bio text NOT NULL DEFAULT '',photo_url text,game_id uuid REFERENCES public.moon_games(id) ON DELETE SET NULL,archetype_id uuid REFERENCES public.moon_archetypes(id) ON DELETE SET NULL,platform text CHECK(platform IN('steam','epic','ps4')),platform_id text,public_visible boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),CHECK((platform IS NULL)=(platform_id IS NULL)),UNIQUE(platform,platform_id));
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

-- Source: supabase/migrations/20261013140534_moonastery_transactions.sql
CREATE FUNCTION moon_private.assert_actor(actor uuid, roles text[]) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.moon_memberships WHERE id=actor AND status='approved' AND role=ANY(roles)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION moon_private.assert_actor(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION moon_private.assert_actor(uuid,text[]) TO service_role;
CREATE FUNCTION moon_private.overall(attrs jsonb, weights jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE k text; total numeric:=0; weight numeric; BEGIN
 IF weights IS NULL THEN RETURN NULL; END IF;
 FOREACH k IN ARRAY ARRAY['VEL','FIN','CRI','DEF','POS','BST','IMP'] LOOP
  weight := (weights->>k)::numeric;
  IF weight IS NULL OR weight<0 THEN RAISE EXCEPTION 'INVALID_WEIGHTS'; END IF;
  IF weight>0 AND (attrs->>k) IS NULL THEN RETURN NULL; END IF;
  total:=total+coalesce((attrs->>k)::numeric,0)*weight;
 END LOOP;
 RETURN round(least(99,greatest(0,total)),2);
END $$;
REVOKE ALL ON FUNCTION moon_private.overall(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION moon_private.overall(jsonb,jsonb) TO service_role;

CREATE FUNCTION public.moon_manage_member(actor_id uuid, member_id uuid, new_status text, new_role text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE old public.moon_memberships%ROWTYPE; BEGIN
 PERFORM moon_private.assert_actor(actor_id,ARRAY['owner']);
 -- A transaction-wide lock serializes owner removal/demotion decisions.
 PERFORM pg_advisory_xact_lock(867530900);
 PERFORM moon_private.assert_actor(actor_id,ARRAY['owner']);
 IF actor_id=member_id THEN RAISE EXCEPTION 'SELF_CHANGE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM public.moon_memberships WHERE id=member_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
 IF old.role='owner' AND old.status='approved' AND (new_role IS DISTINCT FROM 'owner' OR new_status<>'approved') AND (SELECT count(*) FROM public.moon_memberships WHERE role='owner' AND status='approved')<=1 THEN RAISE EXCEPTION 'LAST_OWNER'; END IF;
 UPDATE public.moon_memberships SET status=new_status,role=new_role WHERE id=member_id;
 INSERT INTO public.moon_audit(actor_id,action,entity_id,detail) VALUES(actor_id,'users.update',member_id::text,jsonb_build_object('status',new_status,'role',new_role,'previous_status',old.status,'previous_role',old.role));
END $$;

CREATE FUNCTION public.moon_approve_job(actor_id uuid, job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.moon_jobs%ROWTYPE; p record; old_report public.moon_reports%ROWTYPE; prior public.moon_reports%ROWTYPE; attrs jsonb; baseline jsonb; k text; target numeric; base numeric; score numeric; raw_overall numeric; weights jsonb; report uuid; sources uuid[]; results jsonb:='[]'; smoothing numeric; max_growth numeric; BEGIN
 PERFORM moon_private.assert_actor(actor_id,ARRAY['owner','coach']);
 SELECT * INTO job FROM public.moon_jobs WHERE id=job_id FOR UPDATE;
 IF NOT FOUND OR job.status<>'awaiting_review' OR job.session_date IS NULL THEN RAISE EXCEPTION 'JOB_NOT_REVIEWABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.moon_job_players WHERE moon_job_players.job_id=job.id) THEN RAISE EXCEPTION 'NO_IDENTIFIED_PLAYERS'; END IF;
 smoothing:=greatest(0.00001,least(1,coalesce((job.config_snapshot->'evolution'->>'smoothing')::numeric,0.2)));
 max_growth:=greatest(0,least(1,coalesce((job.config_snapshot->'evolution'->>'maximum_nightly_increase')::numeric,1)));
 -- Ordered player locks serialize approvals from different replays of one night.
 PERFORM 1 FROM public.moon_players WHERE id IN(SELECT player_id FROM public.moon_job_players WHERE moon_job_players.job_id=job.id) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.moon_reports r JOIN public.moon_job_players jp ON jp.player_id=r.player_id WHERE jp.job_id=job.id AND r.session_date>job.session_date) THEN RAISE EXCEPTION 'OLDER_SESSION_REQUIRES_REVIEW'; END IF;
 UPDATE public.moon_jobs SET status='approved',updated_at=now() WHERE id=job.id;
 FOR p IN SELECT pl.id,pl.archetype_id FROM public.moon_players pl JOIN public.moon_job_players jp ON jp.player_id=pl.id WHERE jp.job_id=job.id ORDER BY pl.id LOOP
  SELECT * INTO old_report FROM public.moon_reports WHERE player_id=p.id AND session_date=job.session_date FOR UPDATE;
  SELECT * INTO prior FROM public.moon_reports WHERE player_id=p.id AND session_date<job.session_date ORDER BY session_date DESC LIMIT 1;
  baseline:=coalesce(old_report.baseline_attributes,prior.attributes,'{}'::jsonb); attrs:='{}';
  SELECT a.weights INTO weights FROM public.moon_archetypes a WHERE a.id=p.archetype_id AND a.active;
  SELECT array_agg(j.id ORDER BY j.id) INTO sources FROM public.moon_jobs j JOIN public.moon_job_players jp ON jp.job_id=j.id WHERE jp.player_id=p.id AND j.status='approved' AND j.session_date=job.session_date;
  FOREACH k IN ARRAY ARRAY['VEL','FIN','CRI','DEF','POS','BST','IMP'] LOOP
   SELECT sum((jp.attributes->>k)::numeric * least(1,greatest(0,coalesce((jp.confidence->>k)::numeric,1)))) / nullif(sum(least(1,greatest(0,coalesce((jp.confidence->>k)::numeric,1)))),0) INTO target FROM public.moon_job_players jp JOIN public.moon_jobs j ON j.id=jp.job_id WHERE jp.player_id=p.id AND j.status='approved' AND j.session_date=job.session_date AND jsonb_typeof(jp.attributes->k)='number';
   IF target<0 OR target>99 THEN RAISE EXCEPTION 'INVALID_ATTRIBUTE'; END IF;
   base:=(baseline->>k)::numeric;
   -- The first evidence-based card establishes the initial score. Subsequent nights cap growth at +1.
   score:=CASE WHEN target IS NULL THEN base WHEN base IS NULL THEN round(target,2) ELSE round(least(base+smoothing*(target-base),base+max_growth),2) END;
   attrs:=attrs||jsonb_build_object(k,score);
  END LOOP;
  raw_overall:=moon_private.overall(attrs,weights);
  -- Every weighted attribute is already capped. Reweight the anchor using the
  -- current archetype so overall always remains the exact weighted composition.
  base:=moon_private.overall(baseline,weights);
  score:=raw_overall;
  INSERT INTO public.moon_reports(player_id,session_date,attributes,baseline_attributes,overall,previous_overall,baseline_overall,archetype_id,approved_by,source_job_ids)
  VALUES(p.id,job.session_date,attrs,CASE WHEN baseline='{}'::jsonb THEN attrs ELSE baseline END,score,prior.overall,coalesce(base,score),p.archetype_id,actor_id,sources)
  ON CONFLICT(player_id,session_date) DO UPDATE SET attributes=excluded.attributes,overall=excluded.overall,approved_at=now(),approved_by=actor_id,source_job_ids=excluded.source_job_ids RETURNING id INTO report;
  INSERT INTO public.moon_cards(player_id,attributes,overall,previous_overall,evolution,report_id,approved_at) VALUES(p.id,attrs,score,prior.overall,score-prior.overall,report,now()) ON CONFLICT(player_id) DO UPDATE SET attributes=excluded.attributes,overall=excluded.overall,previous_overall=excluded.previous_overall,evolution=excluded.evolution,report_id=excluded.report_id,approved_at=excluded.approved_at;
  INSERT INTO public.moon_attribute_history(player_id,report_id,attributes,overall,archetype_id,reason,actor_id) VALUES(p.id,report,attrs,score,p.archetype_id,'session_approval',actor_id);
  results:=results||jsonb_build_object('player_id',p.id,'report_id',report,'overall',score);
 END LOOP;
 INSERT INTO public.moon_audit(actor_id,action,entity_id,detail) VALUES(actor_id,'jobs.approve',job.id::text,jsonb_build_object('session_date',job.session_date,'players',results));
 RETURN results;
END $$;

CREATE FUNCTION public.moon_change_archetype(actor_id uuid, player_id uuid, archetype_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE weights jsonb; c public.moon_cards%ROWTYPE; score numeric; BEGIN
 PERFORM moon_private.assert_actor(actor_id,ARRAY['owner','coach']);
 PERFORM 1 FROM public.moon_players p WHERE p.id=player_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
 SELECT a.weights INTO weights FROM public.moon_archetypes a WHERE a.id=archetype_id AND a.active;
 IF weights IS NULL THEN RAISE EXCEPTION 'ARCHETYPE_NOT_FOUND'; END IF;
 UPDATE public.moon_players p SET archetype_id=moon_change_archetype.archetype_id WHERE p.id=moon_change_archetype.player_id;
 SELECT * INTO c FROM public.moon_cards WHERE moon_cards.player_id=moon_change_archetype.player_id;
 IF FOUND THEN
  score:=moon_private.overall(c.attributes,weights);
  UPDATE public.moon_cards SET overall=score,previous_overall=c.overall,evolution=score-c.overall WHERE moon_cards.player_id=moon_change_archetype.player_id;
  INSERT INTO public.moon_attribute_history(player_id,report_id,attributes,overall,archetype_id,reason,actor_id) VALUES(player_id,c.report_id,c.attributes,score,archetype_id,'archetype_change',actor_id);
 END IF;
 INSERT INTO public.moon_audit(actor_id,action,entity_id,detail) VALUES(actor_id,'players.archetype',player_id::text,jsonb_build_object('archetype_id',archetype_id));
END $$;
REVOKE ALL ON FUNCTION public.moon_manage_member(uuid,uuid,text,text), public.moon_approve_job(uuid,uuid), public.moon_change_archetype(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.moon_manage_member(uuid,uuid,text,text), public.moon_approve_job(uuid,uuid), public.moon_change_archetype(uuid,uuid,uuid) TO service_role;

-- Source: supabase/migrations/20261013140934_moonastery_processing.sql
ALTER TABLE public.moon_jobs ADD COLUMN match_id text;
CREATE UNIQUE INDEX moon_jobs_provider_replay ON public.moon_jobs(provider_replay_id) WHERE provider_replay_id IS NOT NULL AND status<>'discarded';
CREATE UNIQUE INDEX moon_jobs_match ON public.moon_jobs(match_id) WHERE match_id IS NOT NULL AND status<>'discarded';
CREATE TABLE public.moon_processing_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES public.moon_jobs(id) ON DELETE CASCADE,attempt integer NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(job_id,attempt));
CREATE INDEX moon_processing_history_job ON public.moon_processing_history(job_id);
ALTER TABLE public.moon_processing_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moon_processing_history FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.moon_processing_history TO service_role;
GRANT SELECT ON public.moon_processing_history TO authenticated;
CREATE POLICY processing_history_private ON public.moon_processing_history FOR SELECT TO authenticated USING((SELECT moon_private.role()) IN('owner','coach'));
CREATE FUNCTION public.moon_complete_processing(target_job_id uuid,target_attempt integer,processing_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE job public.moon_jobs%ROWTYPE; p jsonb; k text; v numeric; BEGIN
 SELECT * INTO job FROM public.moon_jobs WHERE id=target_job_id FOR UPDATE;
 IF NOT FOUND OR job.status<>'processing' OR job.attempt<>target_attempt THEN RAISE EXCEPTION 'STALE_PROCESSING_ATTEMPT'; END IF;
 IF jsonb_typeof(processing_result->'players')<>'array' THEN RAISE EXCEPTION 'INVALID_PROCESSING_RESULT'; END IF;
 INSERT INTO public.moon_processing_history(job_id,attempt,snapshot) VALUES(target_job_id,target_attempt,processing_result);
 DELETE FROM public.moon_job_players WHERE job_id=target_job_id;
 FOR p IN SELECT value FROM jsonb_array_elements(processing_result->'players') LOOP
  FOREACH k IN ARRAY ARRAY['VEL','FIN','CRI','DEF','POS','BST','IMP'] LOOP
   IF NOT (p->'attributes' ? k) OR jsonb_typeof(p->'attributes'->k) NOT IN('null','number') THEN RAISE EXCEPTION 'INVALID_ATTRIBUTE'; END IF;
   v:=(p->'attributes'->>k)::numeric;
   IF v<0 OR v>99 THEN RAISE EXCEPTION 'INVALID_ATTRIBUTE'; END IF;
  END LOOP;
  INSERT INTO public.moon_job_players(job_id,player_id,attributes,raw_metrics,confidence,alerts,config_snapshot)
  VALUES(target_job_id,(p->>'player_id')::uuid,p->'attributes',p->'raw_metrics',coalesce(p->'confidence','{}')||jsonb_build_object('opponent',p->'opponent','reasons',p->'reasons'),coalesce(p->'alerts','[]'),p->'config_snapshot');
 END LOOP;
 UPDATE public.moon_jobs SET status='awaiting_review',session_date=(processing_result->>'session_date')::date,provider_replay_id=processing_result->>'provider_replay_id',match_id=processing_result->>'match_id',config_snapshot=processing_result->'config_snapshot',logs=coalesce(processing_result->'logs','[]'),unmatched=coalesce(processing_result->'unmatched','[]'),warnings=coalesce(processing_result->'warnings','[]'),error_message=NULL,updated_at=now() WHERE id=target_job_id;
END $$;
REVOKE ALL ON FUNCTION public.moon_complete_processing(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.moon_complete_processing(uuid,integer,jsonb) TO service_role;

-- Reject approval when every attribute is unavailable: metrics can still be reviewed.
CREATE FUNCTION moon_private.reviewable_scores() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NOT EXISTS(SELECT 1 FROM public.moon_job_players jp CROSS JOIN LATERAL jsonb_each(jp.attributes) a WHERE jp.job_id=NEW.id AND jsonb_typeof(a.value)='number') THEN RAISE EXCEPTION 'INSUFFICIENT_EVIDENCE'; END IF;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION moon_private.reviewable_scores() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER moon_require_scores BEFORE UPDATE OF status ON public.moon_jobs FOR EACH ROW EXECUTE FUNCTION moon_private.reviewable_scores();

-- Database validation also protects administrative configurations from direct SQL mistakes.
CREATE FUNCTION moon_private.validate_weights() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE k text; total numeric:=0; v numeric; BEGIN
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.weights))<>7 THEN RAISE EXCEPTION 'INVALID_WEIGHTS'; END IF;
 FOREACH k IN ARRAY ARRAY['VEL','FIN','CRI','DEF','POS','BST','IMP'] LOOP
  v:=(NEW.weights->>k)::numeric;
  IF v IS NULL OR v<0 OR v>1 THEN RAISE EXCEPTION 'INVALID_WEIGHTS'; END IF;
  total:=total+v;
 END LOOP;
 IF abs(total-1)>0.00001 THEN RAISE EXCEPTION 'INVALID_WEIGHTS'; END IF;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION moon_private.validate_weights() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER moon_validate_archetype BEFORE INSERT OR UPDATE OF weights ON public.moon_archetypes FOR EACH ROW EXECUTE FUNCTION moon_private.validate_weights();

-- Source: supabase/migrations/20261013184204_moon_delete_report.sql
CREATE OR REPLACE FUNCTION public.moon_delete_report(actor_id uuid, target_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE player_id_value uuid; latest_report public.moon_reports%ROWTYPE; previous_report public.moon_reports%ROWTYPE; previous_score numeric; was_current_card boolean;
BEGIN
 PERFORM moon_private.assert_actor(actor_id,ARRAY['owner']);
 SELECT r.player_id INTO player_id_value FROM public.moon_reports r WHERE r.id=target_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_NOT_FOUND'; END IF;
 -- Match the player-first lock order in report approval so card restoration is serialized.
 PERFORM 1 FROM public.moon_players p WHERE p.id=player_id_value FOR UPDATE;
 PERFORM 1 FROM public.moon_reports r WHERE r.id=target_report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_NOT_FOUND'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.moon_cards c WHERE c.player_id=player_id_value AND c.report_id=target_report_id) INTO was_current_card;
 DELETE FROM public.moon_reports r WHERE r.id=target_report_id;
 IF was_current_card THEN
  SELECT r.* INTO latest_report FROM public.moon_reports r WHERE r.player_id=player_id_value AND r.overall IS NOT NULL ORDER BY r.session_date DESC LIMIT 1;
  IF FOUND THEN
   SELECT r.* INTO previous_report FROM public.moon_reports r WHERE r.player_id=player_id_value AND r.overall IS NOT NULL AND r.session_date<latest_report.session_date ORDER BY r.session_date DESC LIMIT 1;
   previous_score:=CASE WHEN FOUND THEN previous_report.overall ELSE NULL END;
   INSERT INTO public.moon_cards(player_id,attributes,overall,previous_overall,evolution,report_id,approved_at)
   VALUES(player_id_value,latest_report.attributes,latest_report.overall,previous_score,CASE WHEN previous_score IS NULL THEN NULL ELSE latest_report.overall-previous_score END,latest_report.id,latest_report.approved_at)
   ON CONFLICT(player_id) DO UPDATE SET attributes=excluded.attributes,overall=excluded.overall,previous_overall=excluded.previous_overall,evolution=excluded.evolution,report_id=excluded.report_id,approved_at=excluded.approved_at;
  END IF;
 END IF;
 INSERT INTO public.moon_audit(actor_id,action,entity_id,detail)
 VALUES(actor_id,'reports.delete',target_report_id::text,jsonb_build_object('player_id',player_id_value,'was_current_card',was_current_card,'restored_report_id',CASE WHEN was_current_card THEN latest_report.id ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION public.moon_delete_report(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.moon_delete_report(uuid,uuid) TO service_role;

COMMIT;
