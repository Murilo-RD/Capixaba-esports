BEGIN;

-- Mark a replay as excluded before recomputing every identified participant.
CREATE FUNCTION public.moon_exclude_job_for_deletion(actor_id uuid, target_job_id uuid)
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
  IF job.status = 'processing' THEN RAISE EXCEPTION 'JOB_PROCESSING'; END IF;

  SELECT coalesce(array_agg(jp.player_id ORDER BY jp.player_id), ARRAY[]::uuid[])
  INTO player_ids FROM public.moon_job_players jp WHERE jp.job_id = job.id;
  PERFORM 1 FROM public.moon_players p WHERE p.id = ANY(player_ids) ORDER BY p.id FOR UPDATE;

  UPDATE public.moon_jobs SET status = 'discarded', updated_at = clock_timestamp()
  WHERE id = job.id;
  INSERT INTO public.moon_audit(actor_id, action, entity_id, detail)
  VALUES (actor_id, 'jobs.delete_requested', job.id::text,
    jsonb_build_object('previous_status', job.status, 'player_ids', player_ids,
      'session_date', job.session_date, 'match_id', job.match_id));
  RETURN jsonb_build_object('player_ids', player_ids);
END;
$$;

-- Only permanently remove the original after the affected cards were recalculated.
CREATE FUNCTION public.moon_delete_discarded_job(actor_id uuid, target_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  job public.moon_jobs%ROWTYPE;
  replay public.moon_replays%ROWTYPE;
BEGIN
  PERFORM moon_private.assert_actor(actor_id, ARRAY['owner','coach']);
  SELECT j.* INTO job FROM public.moon_jobs j WHERE j.id = target_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF job.status <> 'discarded' THEN RAISE EXCEPTION 'JOB_NOT_EXCLUDED'; END IF;
  SELECT r.* INTO replay FROM public.moon_replays r WHERE r.id = job.replay_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPLAY_NOT_FOUND'; END IF;

  INSERT INTO public.moon_audit(actor_id, action, entity_id, detail)
  VALUES (actor_id, 'jobs.deleted', job.id::text,
    jsonb_build_object('replay_id', replay.id, 'filename', replay.filename,
      'sha256', replay.sha256, 'session_date', job.session_date,
      'provider_replay_id', job.provider_replay_id));
  DELETE FROM public.moon_replays r WHERE r.id = replay.id;
  RETURN jsonb_build_object('storage_path', replay.storage_path);
END;
$$;

-- Remove scorecards and derived reports when a player has no approved replay left.
CREATE FUNCTION public.moon_clear_player_metrics(actor_id uuid, target_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  removed_reports integer;
  previous_reports jsonb;
  previous_card jsonb;
BEGIN
  PERFORM moon_private.assert_actor(actor_id, ARRAY['owner','coach']);
  PERFORM 1 FROM public.moon_players p WHERE p.id = target_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.moon_job_players jp JOIN public.moon_jobs j ON j.id = jp.job_id
    WHERE jp.player_id = target_player_id AND j.status = 'approved'
  ) THEN RAISE EXCEPTION 'PLAYER_HAS_APPROVED_REPLAYS'; END IF;

  SELECT jsonb_agg(to_jsonb(r)) INTO previous_reports
  FROM public.moon_reports r WHERE r.player_id = target_player_id;
  SELECT to_jsonb(c) INTO previous_card
  FROM public.moon_cards c WHERE c.player_id = target_player_id;
  DELETE FROM public.moon_reports r WHERE r.player_id = target_player_id;
  GET DIAGNOSTICS removed_reports = ROW_COUNT;

  INSERT INTO public.moon_audit(actor_id, action, entity_id, detail)
  VALUES (actor_id, 'players.metrics_cleared', target_player_id::text,
    jsonb_build_object('removed_reports', removed_reports,
      'previous_reports', previous_reports, 'previous_card', previous_card));
  RETURN jsonb_build_object('reports', removed_reports, 'replays', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.moon_exclude_job_for_deletion(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moon_delete_discarded_job(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moon_clear_player_metrics(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moon_exclude_job_for_deletion(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.moon_delete_discarded_job(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.moon_clear_player_metrics(uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
