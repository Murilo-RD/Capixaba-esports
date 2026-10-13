// Generates one SQL Editor script from the three versioned Moonastery migrations.
// It only removes Moonastery application objects. Auth users and Storage files remain.
import { readFile, writeFile } from "node:fs/promises";

const migrations = [
  "20261013140330_moonastery_rebuild.sql",
  "20261013140534_moonastery_transactions.sql",
  "20261013140934_moonastery_processing.sql",
];

const cleanup = `-- Recreates Moonastery application data and schema in the current Supabase project.
-- Back up the database and confirm the project before running this in SQL Editor.
-- Existing auth.users, other public tables, Storage buckets and files are preserved.
BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE SCHEMA IF NOT EXISTS moon_private;

DROP TRIGGER IF EXISTS moon_auth_user_created ON auth.users;
DROP POLICY IF EXISTS moon_media_public ON storage.objects;

DROP FUNCTION IF EXISTS public.moon_complete_processing(uuid,integer,jsonb) RESTRICT;
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
`;

const parts = [cleanup];
for (const name of migrations) {
  const raw = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
  if (!/^BEGIN;\s*/i.test(raw) || !/\s*COMMIT;\s*$/i.test(raw)) {
    throw new Error(`${name} is no longer wrapped in a transaction; review the generator.`);
  }
  parts.push(`\n-- Source: supabase/migrations/${name}\n`);
  parts.push(raw.replace(/^BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "\n"));
}
parts.push("\nCOMMIT;\n");

const output = new URL("./moonastery-recreate.sql", import.meta.url);
await writeFile(output, parts.join(""), "utf8");
console.log(`Generated ${output.pathname} from ${migrations.length} migrations.`);
