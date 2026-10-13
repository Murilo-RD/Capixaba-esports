// Local PostgreSQL engine validation. Never connects to the configured project.
import { readFile, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "../.cache/dbverify/node_modules/@electric-sql/pglite/dist/index.js";
const db = new PGlite();
let checks = 0;
await db.exec(`
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`);
const files = (await readdir("supabase/migrations"))
  .filter((f) => f.includes("moonastery_"))
  .sort();
for (const file of files) {
  await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  console.log(`Migration valid: ${file}`);
}
if (process.argv.includes("--generate-types")) {
  const cols = (
    await db.query(
      `SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,d.oid IS NOT NULL AS has_default FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname LIKE 'moon_%' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    )
  ).rows;
  const fks = (
    await db.query(
      `SELECT c.relname AS table_name,con.conname AS name,ac.attname AS column_name,cr.relname AS referenced_table,ar.attname AS referenced_column FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_class cr ON cr.oid=con.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute ac ON ac.attrelid=c.oid AND ac.attnum=con.conkey[1] JOIN pg_attribute ar ON ar.attrelid=cr.oid AND ar.attnum=con.confkey[1] WHERE con.contype='f' AND n.nspname='public' AND c.relname LIKE 'moon_%' ORDER BY c.relname,con.conname`,
    )
  ).rows;
  const type = (v) =>
    v.endsWith("[]")
      ? `${type(v.slice(0, -2))}[]`
      : v === "jsonb"
        ? "Json"
        : v === "boolean"
          ? "boolean"
          : /^(integer|bigint|numeric|double precision)/.test(v)
            ? "number"
            : "string";
  const tables = [...new Set(cols.map((c) => c.table_name))]
    .map((t) => {
      const columns = cols.filter((c) => c.table_name === t);
      const shape = (kind) =>
        columns
          .map(
            (c) =>
              `${c.name}${kind === "Update" || (kind === "Insert" && (!c.required || c.has_default)) ? "?" : ""}: ${type(c.type)}${c.required ? "" : " | null"};`,
          )
          .join("\n");
      const relationships = fks
        .filter((f) => f.table_name === t)
        .map(
          (f) =>
            `{foreignKeyName:${JSON.stringify(f.name)}; columns:[${JSON.stringify(f.column_name)}]; isOneToOne:false; referencedRelation:${JSON.stringify(f.referenced_table)}; referencedColumns:[${JSON.stringify(f.referenced_column)}];}`,
        )
        .join(",");
      return `${t}:{Row:{${shape("Row")}};Insert:{${shape("Insert")}};Update:{${shape("Update")}};Relationships:[${relationships}];}`;
    })
    .join("\n");
  const functions = (
    await db.query(
      `SELECT p.proname AS name,p.proargnames AS args,oidvectortypes(p.proargtypes) AS types,format_type(p.prorettype,NULL) AS returns FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'moon_%' ORDER BY p.proname`,
    )
  ).rows
    .map(
      (f) =>
        `${f.name}:{Args:{${f.args.map((a, i) => `${a}:${type(f.types.split(", ")[i])}`).join(";")}};Returns:${f.returns === "void" ? "undefined" : type(f.returns)}}`,
    )
    .join(";");
  const output = `// Generated from the locally applied Moonastery migrations by scripts/database-verify.mjs --generate-types.\nexport type Json=string|number|boolean|null|{[key:string]:Json|undefined}|Json[];\nexport type Database={public:{Tables:{${tables}};Views:{[_ in never]:never};Functions:{${functions}};Enums:{[_ in never]:never};CompositeTypes:{[_ in never]:never}}};\nexport type Tables<T extends keyof Database['public']['Tables']>=Database['public']['Tables'][T]['Row'];\nexport type TablesInsert<T extends keyof Database['public']['Tables']>=Database['public']['Tables'][T]['Insert'];\nexport type TablesUpdate<T extends keyof Database['public']['Tables']>=Database['public']['Tables'][T]['Update'];\nexport const Constants={public:{Enums:{}}} as const;\n`;
  await writeFile("src/integrations/supabase/types.ts", output);
  console.log("Generated Moonastery Database types from PostgreSQL catalog.");
}
const ids = {
  owner: "00000000-0000-4000-8000-000000000001",
  coach: "00000000-0000-4000-8000-000000000002",
  editor: "00000000-0000-4000-8000-000000000003",
  a: "00000000-0000-4000-8000-000000000004",
  b: "00000000-0000-4000-8000-000000000005",
  pending: "00000000-0000-4000-8000-000000000006",
};
for (const [name, id] of Object.entries(ids))
  await db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)`, [
    id,
    `${name}@example.invalid`,
    { nick: name, role: "owner", status: "approved" },
  ]);
let rows = await db.query(`SELECT * FROM public.moon_memberships WHERE id=$1`, [ids.pending]);
assert.equal(rows.rows[0].status, "pending");
assert.equal(rows.rows[0].role, null);
checks += 2;
for (const [name, role] of [
  ["owner", "owner"],
  ["coach", "coach"],
  ["editor", "editor"],
  ["a", "player"],
  ["b", "player"],
])
  await db.query(`UPDATE public.moon_memberships SET status='approved',role=$1 WHERE id=$2`, [
    role,
    ids[name],
  ]);
const players = (await db.query(`SELECT id,user_id FROM public.moon_players`)).rows;
const playerA = players.find((p) => p.user_id === ids.a).id;
const playerB = players.find((p) => p.user_id === ids.b).id;
const archetypes = (await db.query(`SELECT id,name FROM public.moon_archetypes`)).rows;
await db.query(`UPDATE public.moon_players SET archetype_id=$1 WHERE id IN($2,$3)`, [
  archetypes[0].id,
  playerA,
  playerB,
]);
async function as(role, user, work) {
  await db.exec(`SET ROLE ${role}`);
  await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [user || ""]);
  try {
    return await work();
  } finally {
    await db.exec("RESET ROLE");
  }
}
async function fails(work, label) {
  await assert.rejects(work, label);
  checks++;
}
await as("anon", null, async () => {
  await fails(() => db.query("SELECT email FROM public.moon_memberships"), "anonymous emails");
  await fails(() => db.query("SELECT platform_id FROM public.moon_players"), "anonymous identity");
  let r = await db.query("SELECT id,nick FROM public.moon_players");
  assert.equal(r.rows.length, 2);
  checks++;
  await fails(
    () =>
      db.query(`SELECT public.moon_manage_member($1,$2,'approved','owner')`, [
        ids.pending,
        ids.pending,
      ]),
    "anonymous RPC",
  );
});
await as("authenticated", ids.pending, async () => {
  let r = await db.query("SELECT id FROM public.moon_memberships");
  assert.equal(r.rows.length, 1);
  checks++;
  await fails(
    () =>
      db.query(`UPDATE public.moon_memberships SET role='owner',status='approved' WHERE id=$1`, [
        ids.pending,
      ]),
    "self role update",
  );
  let r2 = await db.query("SELECT id FROM public.moon_reports");
  assert.equal(r2.rows.length, 0);
  checks++;
});
await as("service_role", ids.owner, async () => {
  await fails(
    () => db.query(`SELECT public.moon_manage_member($1,$1,'approved','coach')`, [ids.owner]),
    "self demotion",
  );
  await fails(
    () =>
      db.query(`SELECT public.moon_manage_member($1,$2,'approved','owner')`, [
        ids.coach,
        ids.pending,
      ]),
    "coach permissions",
  );
  await db.query(`SELECT public.moon_manage_member($1,$2,'approved','player')`, [
    ids.owner,
    ids.pending,
  ]);
  checks++;
});
async function job(date, score, player = playerA) {
  const replay = (
    await db.query(
      `INSERT INTO public.moon_replays(sha256,storage_path,filename,byte_size,created_by) VALUES($1,$2,'x.replay',10,$3) RETURNING id`,
      [crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"), crypto.randomUUID(), ids.coach],
    )
  ).rows[0].id;
  const id = (
    await db.query(
      `INSERT INTO public.moon_jobs(replay_id,status,session_date) VALUES($1,'awaiting_review',$2) RETURNING id`,
      [replay, date],
    )
  ).rows[0].id;
  const attrs = Object.fromEntries(
    ["VEL", "FIN", "CRI", "DEF", "POS", "BST", "IMP"].map((k) => [k, score]),
  );
  await db.query(
    `INSERT INTO public.moon_job_players(job_id,player_id,attributes,raw_metrics) VALUES($1,$2,$3,'{}')`,
    [id, player, attrs],
  );
  return id;
}
const first = await job("2026-10-10", 80);
await as("service_role", ids.coach, () =>
  db.query(`SELECT public.moon_approve_job($1,$2)`, [ids.coach, first]),
);
let card = (await db.query(`SELECT * FROM public.moon_cards WHERE player_id=$1`, [playerA]))
  .rows[0];
assert.equal(Number(card.overall), 80);
checks++;
const next = await job("2026-10-11", 95);
await as("service_role", ids.coach, () =>
  db.query(`SELECT public.moon_approve_job($1,$2)`, [ids.coach, next]),
);
const another = await job("2026-10-11", 99);
await as("service_role", ids.coach, () =>
  db.query(`SELECT public.moon_approve_job($1,$2)`, [ids.coach, another]),
);
card = (await db.query(`SELECT * FROM public.moon_cards WHERE player_id=$1`, [playerA])).rows[0];
assert.equal(Number(card.overall), 81);
for (const value of Object.values(card.attributes)) assert.equal(value, 81);
checks += 8;
await as("service_role", ids.coach, () =>
  fails(
    () => db.query(`SELECT public.moon_approve_job($1,$2)`, [ids.coach, next]),
    "repeated approval",
  ),
);
const old = await job("2026-10-09", 99);
await as("service_role", ids.coach, () =>
  fails(() => db.query(`SELECT public.moon_approve_job($1,$2)`, [ids.coach, old]), "old session"),
);
const empty = await job("2026-10-12", null);
await as("service_role", ids.coach, () =>
  fails(
    () => db.query(`SELECT public.moon_approve_job($1,$2)`, [ids.coach, empty]),
    "all-null evidence",
  ),
);
await as("authenticated", ids.a, async () => {
  const r = await db.query("SELECT player_id FROM public.moon_reports");
  assert.ok(r.rows.every((p) => p.player_id === playerA));
  checks++;
  await fails(() => db.query(`UPDATE public.moon_reports SET overall=99`), "player grades");
});
const before = JSON.stringify(card.attributes);
await as("service_role", ids.coach, () =>
  db.query(`SELECT public.moon_change_archetype($1,$2,$3)`, [ids.coach, playerA, archetypes[1].id]),
);
card = (await db.query(`SELECT * FROM public.moon_cards WHERE player_id=$1`, [playerA])).rows[0];
assert.equal(JSON.stringify(card.attributes), before);
checks++;
await db.query(
  `INSERT INTO public.moon_news(title,slug,content,category,author_id) VALUES('Draft','draft','body','news',$1)`,
  [ids.editor],
);
await db.query(
  `INSERT INTO public.moon_news(title,slug,content,category,author_id,status,published_at) VALUES('Published','published','body','news',$1,'published',now())`,
  [ids.owner],
);
await as("anon", null, async () => {
  const r = await db.query("SELECT title FROM public.moon_news");
  assert.deepEqual(
    r.rows.map((r) => r.title),
    ["Published"],
  );
  checks++;
  await fails(() => db.query("SELECT author_id FROM public.moon_news"), "anonymous author");
});
await as("authenticated", ids.editor, () =>
  fails(
    () =>
      db.query(
        `UPDATE public.moon_news SET status='published',published_at=now() WHERE slug='draft'`,
      ),
    "editor publication",
  ),
);
await db.query(
  `INSERT INTO public.moon_instructions(title,content,category,target_player_ids,author_id) VALUES('Only B','text','rotation',$1,$2)`,
  [[playerB], ids.coach],
);
await as("authenticated", ids.a, async () => {
  const r = await db.query("SELECT title FROM public.moon_instructions");
  assert.equal(r.rows.length, 0);
  checks++;
});
const processing = await job("2026-10-12", 90);
await db.query(`UPDATE public.moon_jobs SET status='processing',attempt=1 WHERE id=$1`, [
  processing,
]);
await as("service_role", ids.coach, () =>
  fails(
    () => db.query(`SELECT public.moon_complete_processing($1,0,'{"players":[]}')`, [processing]),
    "stale attempt",
  ),
);
await fails(
  () =>
    db.query(
      `INSERT INTO public.moon_replays(sha256,storage_path,filename,byte_size) SELECT sha256,'duplicate','x.replay',10 FROM public.moon_replays LIMIT 1`,
    ),
  "replay SHA duplicate",
);
console.log(
  `PASS: ${checks} migration, RLS, role, approval, inflation, history, identity and editorial checks.`,
);
await db.close();
