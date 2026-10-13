// Isolated PostgreSQL smoke test; never connects to the hosted Supabase project.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "../.cache/dbverify/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
await db.exec(`
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.unrelated_app(id integer PRIMARY KEY);
 INSERT INTO public.unrelated_app(id) VALUES (1);
`);

const sql = await readFile(new URL("./moonastery-recreate.sql", import.meta.url), "utf8");
await db.exec(sql);
const id = "00000000-0000-4000-8000-000000000001";
await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,'{}')", [
  id,
  "existing@example.invalid",
]);
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.moon_memberships")).rows[0].n,
  1,
);

// Rebuild an already deployed schema and verify the transaction clears application data.
await db.exec(sql);
assert.equal((await db.query("SELECT count(*)::int AS n FROM auth.users")).rows[0].n, 1);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.unrelated_app")).rows[0].n, 1);
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.moon_memberships")).rows[0].n,
  0,
);
assert.equal(
  (
    await db.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'moon\\_%' ESCAPE '\\'",
    )
  ).rows[0].n,
  19,
);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.moon_games")).rows[0].n, 3);
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.moon_archetypes")).rows[0].n,
  3,
);
assert.equal((await db.query("SELECT count(*)::int AS n FROM storage.buckets")).rows[0].n, 3);
assert.equal(
  (
    await db.query(
      "SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace='moon_private'::regnamespace AND proname='assert_actor'",
    )
  ).rows[0].n,
  1,
);
const ownerSql = (
  await readFile(new URL("./moonastery-bootstrap-owner.sql", import.meta.url), "utf8")
).replace(
  "selected_user uuid := '00000000-0000-0000-0000-000000000000'",
  `selected_user uuid := '${id}'`,
);
await db.exec(ownerSql);
assert.equal(
  (await db.query("SELECT role FROM public.moon_memberships WHERE id=$1", [id])).rows[0].role,
  "owner",
);
console.log(
  "PASS: fresh and repeated recreation, data reset, Auth/buckets preserved, existing Auth owner bootstrap.",
);
