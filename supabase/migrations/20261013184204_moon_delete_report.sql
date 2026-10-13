BEGIN;

CREATE OR REPLACE FUNCTION public.moon_delete_report(actor_id uuid, target_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $$
DECLARE
  player_id_value uuid;
  latest_report public.moon_reports%ROWTYPE;
  previous_report public.moon_reports%ROWTYPE;
  previous_score numeric;
  was_current_card boolean;
BEGIN
  PERFORM moon_private.assert_actor(actor_id, ARRAY['owner']);

  SELECT r.player_id INTO player_id_value
  FROM public.moon_reports AS r
  WHERE r.id = target_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND';
  END IF;

  -- Use the same player-first lock order as report approval to serialize card changes.
  PERFORM 1 FROM public.moon_players AS p
  WHERE p.id = player_id_value
  FOR UPDATE;

  PERFORM 1 FROM public.moon_reports AS r
  WHERE r.id = target_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.moon_cards AS c
    WHERE c.player_id = player_id_value
      AND c.report_id = target_report_id
  ) INTO was_current_card;

  DELETE FROM public.moon_reports AS r
  WHERE r.id = target_report_id;

  -- The report's FK cascades its current card. Restore the newest remaining scored report.
  IF was_current_card THEN
    SELECT r.* INTO latest_report
    FROM public.moon_reports AS r
    WHERE r.player_id = player_id_value
      AND r.overall IS NOT NULL
    ORDER BY r.session_date DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT r.* INTO previous_report
      FROM public.moon_reports AS r
      WHERE r.player_id = player_id_value
        AND r.overall IS NOT NULL
        AND r.session_date < latest_report.session_date
      ORDER BY r.session_date DESC
      LIMIT 1;

      previous_score := CASE WHEN FOUND THEN previous_report.overall ELSE NULL END;

      INSERT INTO public.moon_cards(
        player_id, attributes, overall, previous_overall, evolution, report_id, approved_at
      )
      VALUES (
        player_id_value,
        latest_report.attributes,
        latest_report.overall,
        previous_score,
        CASE
          WHEN previous_score IS NULL THEN NULL
          ELSE latest_report.overall - previous_score
        END,
        latest_report.id,
        latest_report.approved_at
      )
      ON CONFLICT (player_id) DO UPDATE SET
        attributes = EXCLUDED.attributes,
        overall = EXCLUDED.overall,
        previous_overall = EXCLUDED.previous_overall,
        evolution = EXCLUDED.evolution,
        report_id = EXCLUDED.report_id,
        approved_at = EXCLUDED.approved_at;
    END IF;
  END IF;

  INSERT INTO public.moon_audit(actor_id, action, entity_id, detail)
  VALUES (
    actor_id,
    'reports.delete',
    target_report_id::text,
    jsonb_build_object(
      'player_id', player_id_value,
      'was_current_card', was_current_card,
      'restored_report_id', CASE WHEN was_current_card THEN latest_report.id ELSE NULL END
    )
  );
END
$$;

REVOKE ALL ON FUNCTION public.moon_delete_report(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moon_delete_report(uuid, uuid) TO service_role;

COMMIT;
