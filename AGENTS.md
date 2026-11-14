# AGENTS.md

## Project context

Airport Assist Ghana: a React/Vite app on Supabase (Postgres, Auth, Storage, Edge Functions), hosted on Cloudflare Pages, sending email through Resend. Treat it as user-owned application code: keep changes focused on the request and follow existing conventions. See `README.md` for setup and `MIGRATION.md` for deployment.

The project was migrated from Base44. There is no Base44 code left except a few inert hooks in `src/components/ui/image*.js(x)`.

## Key files

- `src/api/db.js`: the only place the frontend talks to Supabase data, functions and storage. Entities keep the old call shapes (`api.entities.Booking.filter(...)`).
- `src/api/filters.js`: translates the small Mongo-style filters (`$or`, `$and`, `$in`, `$gte`, `$lte`, `$regex`) into PostgREST calls. Unit tested in `filters.test.mjs`.
- `src/lib/AuthContext.jsx`: session, role from the `profiles` table, authenticator-app gate.
- `supabase/migrations/`: schema and row-level security. Add a new migration file; never edit one that has been applied to a real project.
- `supabase/functions/<name>/index.ts`: one Edge Function each. Shared code is in `supabase/functions/_shared/` (`auth.ts`, `http.ts`, `email.ts`, `notify.ts`, `bookingAccess.ts`, `discounts.ts`).
- `.env.local`: local only, never commit secrets. `VITE_*` values are public by design; server secrets (`RESEND_API_KEY`, service role key) live in Supabase secrets only.

## Rules that matter

- Browsers must not write `bookings`, `payments`, `discount_*`, `booking_ratings` or `profiles.role`. Do it in an Edge Function that checks the caller's role (`requireCaller(req, admin, [roles])`) and uses the service-role client. The row-level security tests in `supabase/tests/` enforce this; keep them passing.
- Money changes go through SQL functions (`record_payment`, `claim_discount`), not read-modify-write in code.
- Edge Functions return `HttpError` messages that are safe to show; anything else is logged and returned as a generic 500.
- Email goes through `sendTransactionalEmail` (idempotent per `eventKey`, logged in `email_deliveries`). Edit templates in `supabase/emails/*.mjml`, then run `npm run build:emails` and commit the generated file.

- Booking status follows a state machine enforced by a database trigger (`bookings_status_guard`); `src/lib/bookingRules.js` mirrors it for the screens. Change both together. Money adjustments are ledger rows (`record_adjustment`), never edits.
- Changes to bookings, payments, roles, packages, discounts and shift reports are written to the insert-only `audit_log` by triggers. When a function changes one of those tables, set `updated_by_id` to the acting user so the log names them.
- Admin and management only count as such for a session that passed two-step verification (`app_role()` returns `mfa_required` otherwise). Tests that act as those roles must set `request.jwt.claims` with `aal2`.
- A sale is a booking with a ledger payment (`createQuickSale` / `createBooking` + `recordPayment`). Shift reports are built from the ledger (`build_shift_report`); never add a way to type sales into a report.
- Show problems with `notifyError` (`src/lib/notify.js`) and confirm destructive actions with `ConfirmAction`; do not use `alert()` or `confirm()`.

## Before finishing code changes

Run what applies: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; for `supabase/functions` run `npm run test:functions` and `deno check supabase/functions/<name>/index.ts` (CI runs all of these); for `supabase/migrations` or policies run `npm run test:db` (needs a Postgres reachable through `PG*` variables).
