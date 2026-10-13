// Explicitly scoped legacy cleanup. Default is a dry run; no Auth/Storage cleanup.
import { stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
export const legacyTables = [
  "application_messages",
  "applications",
  "weekly_reports",
  "training_videos",
  "trainings",
  "matches",
  "rival_teams",
  "team_titles",
  "user_roles",
  "profiles",
  "app_auth_users",
];
const functions = [
  "app_register(text,text,text)",
  "app_login(text,text)",
  "app_change_password(uuid,text)",
  "app_disable_user(uuid)",
  "app_delete_user(uuid)",
  "has_role(uuid,public.app_role)",
  "handle_new_user()",
];
const sql = [
  "BEGIN;",
  // RLS policies can depend on legacy helpers such as has_role. Remove policies
  // only from the explicit legacy allowlist before dropping those helpers.
  `DO $reset$
  DECLARE policy_row record;
  BEGIN
    FOR policy_row IN
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY (ARRAY[${legacyTables.map((t) => `'${t}'`).join(", ")}])
    LOOP
      EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    END LOOP;
  END
  $reset$;`,
  ...functions.map((f) => `DROP FUNCTION IF EXISTS public.${f} RESTRICT;`),
  ...legacyTables.map((t) => `DROP TABLE IF EXISTS public.${t} RESTRICT;`),
  "COMMIT;",
].join("\n");
if (!args.includes("--execute")) {
  console.log(
    "DRY RUN: no database connection or mutation. Review allowlist and dependency inventory.",
  );
  console.log(sql);
  process.exit(0);
}
if (option("confirm") !== "RESET_LEGACY_APPLICATION")
  throw new Error("Explicit --confirm=RESET_LEGACY_APPLICATION required.");
const backup = option("backup"),
  inventory = option("inventory");
if (!backup || !inventory)
  throw new Error("Provide --backup=<verified dump> and --inventory=<reviewed JSON inventory>.");
if ((await stat(resolve(backup))).size === 0) throw new Error("Backup file is empty.");
const review = JSON.parse(await readFile(resolve(inventory), "utf8"));
if (
  review.schema !== "public" ||
  review.reviewed !== true ||
  !Array.isArray(review.tables) ||
  legacyTables.some((t) => !review.tables.includes(t))
)
  throw new Error(
    "Inventory must include every allowlisted table and have schema public + reviewed true.",
  );
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL securely. The URL is never printed.");
await mkdir(".cache/database", { recursive: true });
const plan = resolve(".cache/database/legacy-reset.sql");
await writeFile(plan, sql);
const run = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", plan], {
  env: { ...process.env, PGDATABASE: process.env.DATABASE_URL },
  encoding: "utf8",
});
// psql errors can contain connection details. Return only the exit status.
if (run.status !== 0)
  throw new Error(
    `Reset failed (status ${run.status ?? "unavailable"}). Transaction rolled back; inspect the dependency inventory locally.`,
  );
console.log(
  "Legacy application tables removed. Auth, Storage, credentials and moon_* remain intact.",
);
