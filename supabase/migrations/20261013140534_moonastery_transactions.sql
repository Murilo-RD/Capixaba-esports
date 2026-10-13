BEGIN;
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
COMMIT;
