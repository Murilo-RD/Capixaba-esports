BEGIN;

-- The application computes scores from the provider; clients cannot submit numeric overrides.
CREATE FUNCTION public.moon_recalculate_player(
  actor_id uuid,
  target_player_id uuid,
  expected_config jsonb,
  scoring_config jsonb,
  replay_results jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  entry jsonb;
  evaluation jsonb;
  job public.moon_jobs%ROWTYPE;
  profile public.moon_players%ROWTYPE;
  night record;
  previous_attributes jsonb := '{}';
  attributes_value jsonb;
  anchor jsonb;
  weights jsonb;
  key text;
  target numeric;
  base numeric;
  score numeric;
  overall_value numeric;
  previous_overall numeric;
  report_id_value uuid;
  sources uuid[];
  report_count integer := 0;
  latest_report public.moon_reports%ROWTYPE;
  smoothing numeric;
  maximum_growth numeric;
BEGIN
  PERFORM moon_private.assert_actor(actor_id, ARRAY['owner','coach']);
  IF jsonb_typeof(replay_results) IS DISTINCT FROM 'array' OR jsonb_array_length(replay_results) = 0 THEN
    RAISE EXCEPTION 'INVALID_RECALCULATION';
  END IF;

  PERFORM 1 FROM public.moon_scoring s
  WHERE s.id = 'default' AND s.config = expected_config FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECALCULATION_STALE'; END IF;

  -- Match approval's job-before-player lock order, and lock jobs in a stable order.
  PERFORM 1 FROM public.moon_jobs j
  WHERE j.id IN (SELECT (value->>'job_id')::uuid FROM jsonb_array_elements(replay_results))
  ORDER BY j.id FOR UPDATE;
  SELECT * INTO profile FROM public.moon_players p WHERE p.id = target_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;

  IF (SELECT count(*) FROM public.moon_job_players jp JOIN public.moon_jobs j ON j.id = jp.job_id
      WHERE jp.player_id = target_player_id AND j.status IN ('approved','awaiting_review'))
      <> jsonb_array_length(replay_results)
     OR (SELECT count(DISTINCT value->>'job_id') FROM jsonb_array_elements(replay_results))
      <> jsonb_array_length(replay_results) THEN
    RAISE EXCEPTION 'RECALCULATION_STALE';
  END IF;

  -- Preserve the previous numeric state for auditing; processing history stays immutable.
  INSERT INTO public.moon_audit(actor_id, action, entity_id, detail)
  VALUES (actor_id, 'players.recalculate', target_player_id::text,
    jsonb_build_object(
      'replays', jsonb_array_length(replay_results),
      'previous_results', (SELECT jsonb_agg(to_jsonb(jp)) FROM public.moon_job_players jp
                           WHERE jp.player_id = target_player_id),
      'previous_reports', (SELECT jsonb_agg(to_jsonb(r)) FROM public.moon_reports r
                           WHERE r.player_id = target_player_id)
    ));

  FOR entry IN SELECT value FROM jsonb_array_elements(replay_results) LOOP
    SELECT * INTO job FROM public.moon_jobs j WHERE j.id = (entry->>'job_id')::uuid;
    IF NOT FOUND OR job.status NOT IN ('approved','awaiting_review')
       OR job.status IS DISTINCT FROM entry->>'status'
       OR job.attempt IS DISTINCT FROM (entry->>'attempt')::integer
       OR job.updated_at IS DISTINCT FROM (entry->>'updated_at')::timestamptz THEN
      RAISE EXCEPTION 'RECALCULATION_STALE';
    END IF;
    evaluation := entry->'evaluation';
    IF profile.platform IS DISTINCT FROM entry->'account'->>'platform'
       OR profile.platform_id IS DISTINCT FROM entry->'account'->>'platform_id' THEN
      RAISE EXCEPTION 'RECALCULATION_STALE';
    END IF;
    IF (evaluation->>'player_id')::uuid IS DISTINCT FROM target_player_id THEN
      RAISE EXCEPTION 'INVALID_RECALCULATION_PLAYER';
    END IF;
    FOREACH key IN ARRAY ARRAY['VEL','FIN','CRI','DEF','POS','BST','IMP'] LOOP
      IF NOT (evaluation->'attributes' ? key)
         OR jsonb_typeof(evaluation->'attributes'->key) NOT IN ('null','number') THEN
        RAISE EXCEPTION 'INVALID_ATTRIBUTE';
      END IF;
      score := (evaluation->'attributes'->>key)::numeric;
      IF score < 0 OR score > 99 THEN RAISE EXCEPTION 'INVALID_ATTRIBUTE'; END IF;
    END LOOP;
    UPDATE public.moon_job_players jp SET
      attributes = evaluation->'attributes', raw_metrics = evaluation->'raw_metrics',
      confidence = (evaluation->'confidence') || jsonb_build_object(
        'opponent', evaluation->'opponent', 'reasons', evaluation->'reasons'),
      alerts = evaluation->'alerts', config_snapshot = evaluation->'config_snapshot'
    WHERE jp.job_id = job.id AND jp.player_id = target_player_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECALCULATION_STALE'; END IF;
    -- Invalidate replay details without changing approval, attempts or other participants.
    UPDATE public.moon_jobs SET updated_at = clock_timestamp() WHERE id = job.id;
  END LOOP;

  smoothing := greatest(0.00001, least(1, (scoring_config->'evolution'->>'smoothing')::numeric));
  maximum_growth := greatest(0, least(1, (scoring_config->'evolution'->>'maximum_nightly_increase')::numeric));
  SELECT a.weights INTO weights FROM public.moon_archetypes a
  WHERE a.id = profile.archetype_id AND a.active;

  -- Rebuild chronologically from approved evidence; pending reviews never update the card.
  FOR night IN
    SELECT j.session_date, array_agg(j.id ORDER BY j.id) AS job_ids
    FROM public.moon_jobs j JOIN public.moon_job_players jp ON jp.job_id = j.id
    WHERE jp.player_id = target_player_id AND j.status = 'approved'
    GROUP BY j.session_date ORDER BY j.session_date
  LOOP
    anchor := previous_attributes;
    attributes_value := '{}';
    sources := night.job_ids;
    FOREACH key IN ARRAY ARRAY['VEL','FIN','CRI','DEF','POS','BST','IMP'] LOOP
      SELECT sum((jp.attributes->>key)::numeric * least(1, greatest(0, coalesce((jp.confidence->>key)::numeric, 1))))
        / nullif(sum(least(1, greatest(0, coalesce((jp.confidence->>key)::numeric, 1)))), 0)
      INTO target FROM public.moon_job_players jp
      WHERE jp.player_id = target_player_id AND jp.job_id = ANY(sources)
        AND jsonb_typeof(jp.attributes->key) = 'number';
      base := (anchor->>key)::numeric;
      score := CASE WHEN target IS NULL THEN base WHEN base IS NULL THEN round(target, 2)
        ELSE round(least(base + smoothing * (target - base), base + maximum_growth), 2) END;
      attributes_value := attributes_value || jsonb_build_object(key, score);
    END LOOP;
    overall_value := moon_private.overall(attributes_value, weights);
    INSERT INTO public.moon_reports(
      player_id, session_date, attributes, baseline_attributes, overall, previous_overall,
      baseline_overall, archetype_id, approved_by, source_job_ids
    ) VALUES (
      target_player_id, night.session_date, attributes_value,
      CASE WHEN anchor = '{}'::jsonb THEN attributes_value ELSE anchor END,
      overall_value, previous_overall,
      coalesce(moon_private.overall(anchor, weights), overall_value),
      profile.archetype_id, actor_id, sources
    ) ON CONFLICT (player_id, session_date) DO UPDATE SET
      attributes = excluded.attributes, baseline_attributes = excluded.baseline_attributes,
      overall = excluded.overall, previous_overall = excluded.previous_overall,
      baseline_overall = excluded.baseline_overall, archetype_id = excluded.archetype_id,
      approved_at = now(), approved_by = actor_id, source_job_ids = excluded.source_job_ids
    RETURNING id INTO report_id_value;
    INSERT INTO public.moon_attribute_history(
      player_id, report_id, attributes, overall, archetype_id, reason, actor_id
    ) VALUES (target_player_id, report_id_value, attributes_value, overall_value,
      profile.archetype_id, 'player_recalculation', actor_id);
    previous_attributes := attributes_value;
    previous_overall := overall_value;
    report_count := report_count + 1;
  END LOOP;

  IF report_count > 0 THEN
    SELECT r.* INTO latest_report FROM public.moon_reports r
    WHERE r.id = report_id_value;
    INSERT INTO public.moon_cards(
      player_id, attributes, overall, previous_overall, evolution, report_id, approved_at
    ) VALUES (
      target_player_id, latest_report.attributes, latest_report.overall,
      latest_report.previous_overall, latest_report.overall - latest_report.previous_overall,
      latest_report.id, latest_report.approved_at
    ) ON CONFLICT (player_id) DO UPDATE SET
      attributes = excluded.attributes, overall = excluded.overall,
      previous_overall = excluded.previous_overall, evolution = excluded.evolution,
      report_id = excluded.report_id, approved_at = excluded.approved_at;
  END IF;
  RETURN jsonb_build_object('replays', jsonb_array_length(replay_results), 'reports', report_count);
END;
$$;

REVOKE ALL ON FUNCTION public.moon_recalculate_player(uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moon_recalculate_player(uuid,uuid,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
