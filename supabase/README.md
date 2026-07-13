# Supabase Database

This project uses Supabase directly. The database schema, policies, triggers, and grants live in `supabase/migrations`.

## Where To View Data

Use the Supabase dashboard:

https://supabase.com/dashboard/project/nwfdeqfopahjqwpzmmml

- `Table Editor`: view/edit `profiles`, `applications`, `weekly_reports`, `rival_teams`, `matches`, `trainings`, and messages.
- `Authentication > Users`: view app users, emails, UIDs, and auth status.
- `SQL Editor`: run SQL repairs, role changes, and reports.
- `Project Settings > API`: copy `SUPABASE_URL`, publishable/anon key, and `SUPABASE_SERVICE_ROLE_KEY`.

## Required Environment Variables

Copy `.env.example` to `.env` and fill:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_APP_URL`

Only `VITE_*` variables are exposed to the browser. Never create `VITE_SUPABASE_SERVICE_ROLE_KEY`.

## Applying Migrations

With Supabase CLI installed and linked:

```powershell
supabase link --project-ref nwfdeqfopahjqwpzmmml
supabase db push
```

Without the CLI, open Supabase `SQL Editor` and run the SQL files from `supabase/migrations` in filename order. For an existing database that only needs repair, run:

```text
supabase/migrations/20260713172000_repair_database_policies.sql
```

## Make A User Owner

Find the user's UID in `Authentication > Users`, then run this in `SQL Editor`:

```sql
insert into public.user_roles (user_id, role)
values ('USER_UUID_HERE', 'owner')
on conflict do nothing;
```

To approve a candidate manually:

```sql
update public.profiles
set status = 'aprovado'
where id = 'USER_UUID_HERE';
```
