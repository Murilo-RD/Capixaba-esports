BEGIN;

-- Exclude an approved replay before rebuilding cards and analyzing it again.
-- Repeated calls are safe so a failed card rebuild can be resumed from discarded.
CREATE FUNCTION public.moon_prepare_job_reprocess(actor_id uuid, target_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  job public.moon_jobs%ROWTYPE;
  player_ids uuid[];
BEGIN
  PERFORM moon_private.assert_actor(actor_id, ARRAY['owner','coach']);
  SELECT j.* INTO job FROM public.moon_jobs j WHERE j.id = target_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF job.status NOT IN ('approved','discarded') THEN
    RAISE EXCEPTION 'JOB_NOT_REPROCESSABLE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.moon_audit a
    WHERE a.action = 'jobs.delete_requested' AND a.entity_id = job.id::text
  ) THEN
    RAISE EXCEPTION 'JOB_DELETION_IN_PROGRESS';
  END IF;

  SELECT coalesce(array_agg(jp.player_id ORDER BY jp.player_id), ARRAY[]::uuid[])
  INTO player_ids FROM public.moon_job_players jp WHERE jp.job_id = job.id;
  PERFORM 1 FROM public.moon_players p WHERE p.id = ANY(player_ids) ORDER BY p.id FOR UPDATE;

  IF job.status = 'approved' THEN
    UPDATE public.moon_jobs SET status = 'discarded', updated_at = clock_timestamp()
    WHERE id = job.id;
  END IF;
  INSERT INTO public.moon_audit(actor_id, action, entity_id, detail)
  VALUES (actor_id, 'jobs.reprocess_requested', job.id::text,
    jsonb_build_object('previous_status', job.status, 'player_ids', player_ids,
      'session_date', job.session_date, 'match_id', job.match_id,
      'provider_replay_id', job.provider_replay_id));
  RETURN jsonb_build_object('player_ids', player_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.moon_prepare_job_reprocess(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moon_prepare_job_reprocess(uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
