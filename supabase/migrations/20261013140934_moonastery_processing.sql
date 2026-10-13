BEGIN;
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
COMMIT;
