# Airport Assist Ghana

Booking and operations app for Airport Assist Ghana (VIP meet-and-assist, fast-track and porter services at Kotoka International Airport).

| Part | Technology |
|---|---|
| Frontend | React 18 + Vite, Tailwind, shadcn/ui; hosted on Cloudflare Pages |
| Database, auth, file storage, realtime | Supabase (PostgreSQL with row-level security) |
| Backend logic | Supabase Edge Functions (Deno) in `supabase/functions` |
| Transactional email | Resend, called from the Edge Functions |

Roles: `passenger`, `supervisor`, `management`, `admin` (and `pending` while a staff request awaits approval).

Going live? Follow **[MIGRATION.md](MIGRATION.md)**.

## Run it locally

You need Node 20.19+ (or 22), Docker, the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and, for the function tests, [Deno](https://docs.deno.com/runtime/getting_started/installation/).

```bash
npm install
supabase start          # local Postgres, Auth, Storage, and an inbox for test emails
supabase db reset       # applies supabase/migrations and supabase/seed.sql
cp .env.example .env.local
```

Put the `API URL` and `anon key` that `supabase status` prints into `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Then, in two terminals:

```bash
supabase functions serve --env-file supabase/.env.local   # Edge Functions (see below for the env file)
npm run dev                                               # the app, http://localhost:5173
```

`supabase/.env.local` (not committed) holds the function secrets for local use:

```
RESEND_API_KEY=re_xxx            # optional locally: without it, emails are logged as failed, nothing else breaks
EMAIL_FROM="Airport Assist Ghana <noreply@your-domain>"
APP_URL=http://localhost:5173
CRON_SECRET=any-long-random-string        # protects the ID-photo purge function
PHOTO_RETENTION_DAYS=30
```

Sign-up emails (the 6-digit code) arrive in the local inbox at `http://127.0.0.1:54324`. To make yourself an admin locally, register, then run in the Supabase Studio SQL editor: `update public.profiles set role = 'admin' where email = 'you@example.com';`

## Checks

| Command | What it covers |
|---|---|
| `npm run lint` | ESLint on pages and components |
| `npm run typecheck` | TypeScript check of the JS/JSX (`jsconfig.json`) |
| `npm test` | Query-filter translation (`src/api/filters.js`) |
| `npm run test:functions` | Deno tests for discount rules, booking access and email sending |
| `npm run test:db` | Applies every migration to a scratch Postgres and runs the row-level-security, storage and function-payload SQL tests. Uses the `PG*` environment variables; no Docker needed |
| `npm run build` | Production build into `dist/` |
| `npm run build:emails` | Recompiles `supabase/emails/*.mjml` into the generated module the functions import |

## Layout

```
src/                      React app
  api/db.js               data layer: api.entities.*, api.functions.invoke, api.storage
  api/supabaseClient.js   the Supabase browser client
  lib/AuthContext.jsx     session, profile/role and two-step verification gate
supabase/
  migrations/             schema, row-level security, SQL functions, storage rules
  functions/              Edge Functions; _shared/ holds auth, email and business rules
  emails/                 email sources (MJML)
  templates/              Supabase Auth email templates (signup code)
  tests/                  SQL tests and the small Supabase stand-in they run on
  seed.sql                the four service packages
public/                   static files, _redirects and _headers for Cloudflare Pages
```

## How data access works

Browsers can read what row-level security allows and little else: **bookings, payments, discount codes and ratings can only be written by Edge Functions**, which re-price every booking, move money in single database statements and check roles. Add new write paths as Edge Functions, not as open table policies.
