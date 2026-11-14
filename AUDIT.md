# Audit: security, UI and performance

Scope: static review of `src/`, `base44/entities` (row-level security rules), `base44/functions`, `base44/shared`, `index.html` and dependencies, plus `npm audit`, lint, typecheck and build. Nothing was tested against the live Base44 backend, so items marked **verify** need a quick test with real accounts.

## Fixed in this branch

- Lint: 9 errors cleared (unused imports).
- Typecheck: 519 errors to 0. Cause was mostly untyped shadcn wrappers (`src/components/ui/*.d.ts` loose typings added), required-by-inference props made optional, and a few annotations. No runtime behaviour changed.
- Dependencies: `npm audit fix` (non-breaking) cleared 4 of 9 advisories, including the critical `dompurify` (pulled in by `jspdf`) and the high `follow-redirects` / `source-map-js`. Build, lint and typecheck still pass.

## Security

### High

1. **Row-level security lets clients bypass the server-side pricing and payment logic.**
   - `Booking` create is allowed for `passenger`, `user`, `supervisor`, `management`, `admin`. `createBooking` recomputes price and discount server-side, but a passenger can call `base44.entities.Booking.create({...})` directly with any `total_value`, `discount_*`, `status`, `payment_status` or `assigned_supervisor_id`.
   - `Booking` update is allowed for the assigned supervisor on every field, so a supervisor can edit totals, discounts and payments directly.
   - Fix: make `createBooking` write with `asServiceRole` and restrict entity create/update to `admin`. Move payment, porter, lounge and assignment edits into functions with a field allowlist.

2. **Payments are a client-side read-modify-write** (`BookingActions.jsx:79`): `amount_collected = booking.amount_collected + amt` from possibly stale state, written back with `Booking.update`. Two supervisors, or a double tap, lose or duplicate money, and there is no ledger. Fix: a `recordPayment` function that appends to a payments array and recalculates the balance server-side with an atomic `$inc`.

3. **Verify: `User.role` self-update.** `entities/User.jsonc` has no RLS block. Confirm with a passenger account that `base44.entities.User.update(<own id>, { role: 'admin' })` is rejected. If it is allowed, this is a full privilege escalation.

### Medium

4. `submitStaffRequest` accepts any signed-in user, including admin, management and supervisor, and sets them to `pending`. An admin who submits it locks themselves out. It has no rate limit and no check for an existing pending request, so repeated calls spam every admin with notifications and emails.
5. `updateBookingStatus` has no state machine: `completed` to `no_show`, or `cancelled` to `completed`, is accepted. Cancelling does not release a claimed discount.
6. `notifyManagementBooking` accepts requests with no token for bookings under 10 minutes old. The booking id is needed, so exposure is low, but it can trigger emails.
7. Dependencies still flagged after the safe fix: `zod` (high, needs a v4 major upgrade), `react-router` / `react-router-dom` (moderate, open redirect), `quill` / `react-quill-new` (low). Also 14 declared but unused packages: `three`, `jspdf`, `html2canvas`, `react-quill-new`, `react-leaflet`, `moment`, `date-fns`, `framer-motion`, both `@stripe/*`, `canvas-confetti`, `@hello-pangea/dnd`, `react-markdown`, `react-hot-toast`, `lodash`. Removing them cuts install size and attack surface.

### Low

8. Discount codes and booking references use `Math.random`. Use `crypto.getRandomValues`.
9. Functions return `error.message` from 500s to the browser. Log it and return a generic message.
10. No Content-Security-Policy or other security headers, and the SDK keeps the access token in `localStorage`, so any future XSS becomes token theft. No XSS sinks exist today (no `dangerouslySetInnerHTML`, `innerHTML`, `eval`).
11. Personal data (names, phone numbers, nationality, passenger photos): confirm a privacy notice, retention period and consent text that meet Ghana's Data Protection Act. Not a legal opinion.
12. Absolute URLs to `airportassistghana.base44.app` are hard-coded in email functions. Move to config.

### Already good

Every function calls `auth.me()` and checks role before acting. Prices and discounts are recomputed server-side. The discount claim is atomic with a token and rollback. Emails are idempotent. Photo uploads are private with signed URLs. `safeReturnTo` blocks open redirects. `postMessage` targets the same origin. No secrets are committed and `.env*` is ignored.

## UI / accessibility

1. `index.html`: title is "Base44 APP", there is no meta description, Open Graph tags or `theme-color`, and `/manifest.json` is referenced but missing (404 on every load).
2. Contrast: `text-accent` (gold on white) is 2.67:1, below the 4.5:1 AA minimum for small text. It is used on 11px uppercase labels in the supervisor profile card and dialog. Use a darker gold for text.
3. 30 uses of blocking `alert()` / `confirm()` for errors and destructive actions. Replace with toasts and the existing `AlertDialog`.
4. Mobile menu backdrop is a clickable `<div>` (`AppLayout.jsx:126`) with no keyboard or role handling.
5. Only 32 `aria-*` attributes across the app. Icon-only buttons and dashboard tabs need labels. Run an axe pass.
6. `BookingForm` computes `photoUploading` but never shows it, so users get no feedback while a photo uploads.
7. Lists are capped (50 to 100 rows) with no pagination or "load more", so older bookings become unreachable from the dashboards. Summary totals use server aggregates, so those stay correct.

## Performance

1. One JS bundle of about 738 kB (215 kB gzip): every page is imported statically in `App.jsx`. Use `React.lazy` per route, which keeps the home page small for visitors who never sign in.
2. Hero and other images are hosted on `base44.app`, `media.base44.com`, Wix and Unsplash. The hero has no `fetchpriority="high"` or preload, and no image uses `loading="lazy"`. Self-host and compress them, which also matters for the migration.
3. `@tanstack/react-query` is installed but used in one file. The other 33 files fetch in `useEffect`, so there is no caching or request de-duplication. Moving the dashboards to `useQuery` would cut repeat requests.
4. `User.filter({})` loads every user just to count them (`AdminDashboard.jsx:76`). Use `count()`.
5. Realtime: `Booking.subscribe` is only used on the booking page, which is fine.

## Suggested order

1. Confirm item 3 (role self-update) with a test account today.
2. Lock down Booking RLS and move payments server-side (items 1 and 2).
3. Guard `submitStaffRequest` and add a status state machine.
4. Remove unused dependencies, add route code-splitting, fix `index.html` and the contrast issue.
