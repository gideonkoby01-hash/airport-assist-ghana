# Platform audit: how Airport Assist Ghana should operate

Reviewer's stance: software engineer and system designer. Scope: the code on branch `claude/blissful-lamport-1dwade` at commit `4178bba` (React app, Supabase schema and security rules, 15 Edge Functions, email, storage), plus how the business should run on top of it.

**What this is and is not.** It is a static review: I read the code, ran the unit, SQL and type checks, and screenshotted the public pages. Nothing has run against a live Supabase, Resend or Cloudflare account, and I do not know your real booking volume, staffing or accounting rules. Where a recommendation depends on a business decision, it says so. Severity means "what goes wrong if you ignore it", not "how bad the code is".

### Decisions recorded from the owner

| Question | Answer | Consequence |
|---|---|---|
| Are walk-in meet-and-assist sales always bookings? | **No. Some are only typed into shift reports.** | F1 changes: the report cannot simply be generated from the ledger. See the revised F1 and the "quick sale" design. |
| Keep passenger ID photos? | **Yes, for 30 days.** | Built: `purgeIdPhotos` deletes them 30 days after the flight date (see F7 and section 8). The clock-start choice below needs your confirmation. |
| Volume | **About 50 bookings per day.** | The simple architecture is the right one. Sizing and plan choices are in section 8. |

---

## Status after the fixes

Every finding was worked on. **Fixed** means built, covered by automated tests that pass, and documented. **Partly** means the part that can be done in code is done and the rest needs an account, a provider or a decision from you. Nothing here has run against a live Supabase, Resend or Cloudflare account yet, so the first deployment is a rehearsal (see `MIGRATION.md`).

| ID | Result | What was done | What is left, and who it needs |
|---|---|---|---|
| F1 | Fixed | Desk sales are **Quick sales** (booking + payment in one step, price from the package, lower only with a reason). Shift reports are built from the payments ledger; supervisors add only the cash counted and a remark; the system works out the variance; filed reports are locked (admin can remove one so it can be filed again). | Shift hours are assumed to be 06:00 and 18:00: change them in settings if yours differ. Porter commission on a report comes from the porters recorded on bookings. Report-only sales can no longer be typed in; if desk staff find Quick sale too slow, tell me what they need rather than reopening the report. |
| F2 | Fixed | Status changes follow a state machine enforced by the database; completing needs a zero balance; cancelling zeroes what is owed and gives the discount back; no payments on cancelled or no-show bookings; refunds and write-offs are ledger entries with a reason; admin can correct a closed booking with a reason. | The cancellation and refund **policy** (who may waive, fees) is still yours to decide; the system records what management does. |
| F3 | Fixed | One message for every discount failure, and 10 failed tries in 15 minutes locks the person out for the rest of the window. | |
| F4 | Fixed | Idempotency key on bookings and quick sales (a retry returns the first one); passengers limited to 10 new bookings an hour. | |
| F5 | Fixed | Insert-only audit log (bookings, payments, roles, packages, discounts, reports, staff invites and more) with a booking History timeline for management and admin; staff views of ID photos are logged. | There is no screen for browsing the whole audit log yet; admins read it in Supabase (`select * from audit_log`). |
| F6 | Fixed | Admin and management only get their powers after two-step verification (and must set it up first); accounts can be disabled; the last admin cannot be demoted, disabled or deleted; a documented break-glass setting. | Appoint a **second admin** (a people decision). |
| F7 | Partly | Privacy notice page, consent recorded with each online booking, ID photos deleted 30 days after the flight date, deletion of a person's data, written procedure (`docs/DATA_REQUESTS.md`), photo views logged. | The privacy text is a **draft**: a Ghanaian lawyer must confirm it, and you must check your registration with the Data Protection Commission. Decide how long payment records are kept and put it in the notice. |
| F8 | Partly | Failed emails retry automatically (3 tries) and from an Admin > Email screen; Resend webhook records delivered, bounced and spam; `health` endpoint for uptime monitors. | An **error tracker** and an **uptime monitor** with a phone alert need your accounts; the guide says where to point them. The webhook signature check has not been tried against real Resend. |
| F9 | Partly | The supervisor gets an **email** when assigned or reassigned and the passenger is told who their supervisor is; a booking with no supervisor after 15 minutes alerts management once, in the app and by email. | **SMS or WhatsApp** needs a provider and an account (Twilio, WhatsApp Business, a Ghanaian SMS gateway). Not built. |
| F10 | Partly | A CI workflow runs lint, types, tests, build, function checks and the database tests; ESLint now covers the auth and data code; email templates are checked for staleness. | The workflow has **not yet run on GitHub**. No staging project, no Playwright end-to-end tests (they need the local Supabase stack to be written and trusted), and no restore rehearsal yet: those need accounts and an afternoon. |
| F11 | Fixed | Photo paths must sit in the uploader's own folder, checked in the function and by a database constraint. | |
| F12 | Partly | Real dates and 24-hour times, not in the past, 2 hours' notice for online bookings (staff exempt), phone number format, bag limits. | Flight date and time are still stored as text, not a timestamp column, and there are no foreign keys; a migration for those is a larger change with little benefit at this size. |
| F13 | Partly | `anonymiseUser` clears personal data and keeps money records; `integrityCheck` reports broken links and figures that disagree with the ledger. | Enforced foreign keys are not added (see F12). |
| F14 | Partly | A passenger can cancel their own booking while nothing has been paid, and print a receipt once something has. | Optional online payment through Paystack is built (see MIGRATION.md section 2c). Changing flight details and automatic refunds still need decisions. The receipt is not a tax invoice. |
| F15 | Fixed | Browser access limited to your site, request size capped, every error carries a short reference code. | |
| F16 | Mostly | Content-Security-Policy in report-only mode (no violations found on the public pages), password minimum raised to 10. | Switch the policy from report-only to enforcing after a week of normal use (steps in the guide). The sign-in token still lives in the browser's local storage, which is the library's default. |
| F17 | Fixed | Booking lists load a page at a time; totals are counted by the database; user count uses a count; dashboards load on demand (largest script 827 kB to 255 kB). | Notification and rating lists are still capped at 50 to 100 rows. |
| F18 | Mostly | Blocking pop-ups replaced by messages and confirmation dialogs; icon buttons labelled. | No offline tolerance for supervisors in poor signal, and no automated accessibility scan has been run. |
| F19 | Partly | Admin can download the payments ledger and the bookings as a spreadsheet (CSV) for the accountant. | VAT and levy fields, receipt numbering, and a monthly period close need your accountant's rules. |

---

## 1. Verdict

The platform is a sound base for a small, single-site service business. The security model is better than most apps of this size: browsers cannot write prices, payments or roles, money moves in single database statements, and the rules are tested. The weaknesses are not in the plumbing. They are in **how the business process is modelled**:

1. **Money is recorded twice and never reconciled.** Bookings and a payments ledger say one thing; hand-typed shift reports (which management and admin dashboards treat as the source of truth) say another.
2. **A booking has no real lifecycle.** Any status can be set to any other, payments are accepted on cancelled bookings, and nothing says what happens to money and discounts when a booking is cancelled.
3. **There is no audit trail**, so nobody can answer "who changed this, and when?"
4. **Operations depend on people having the app open.** A supervisor is told about an assignment only inside the app.
5. **Go-live needs safety nets that do not exist yet**: monitoring, retries for failed email, backups you have restored once, a staging environment and CI.

Fix the ten items in section 4 before real passengers and real cash go through it. Everything after that can follow in order of value. (The "Status after the fixes" section above shows where each stands.)

---

## 2. How the platform should operate

This is the target operating model the code should enforce. Where the code already does it, I say so.

### 2.1 Who does what

| Actor | Does | Must never |
|---|---|---|
| Passenger | Registers, books, uploads an ID photo, sees their own bookings and assigned supervisor, rates a completed booking | See anyone else's booking or files; change price, status or payment |
| Supervisor | Sees bookings assigned to them, moves them through service, records payments, adds walk-ins, submits shift reports | See unassigned bookings; edit a submitted report; record money on a cancelled booking |
| Management | Sees all bookings, assigns supervisors, adds porters and commission, reads reports and ratings | Change prices, discounts, roles |
| Admin | Staff, roles, packages, lounges, porters, discounts, reporting baseline | Act without an audit record; remove the last admin |
| System | Prices, claims discounts, moves money, sends alerts and email | Trust any number from a browser |

Already true in the code: the first three "must never" columns are enforced by row-level security and function checks (tested). The rest are gaps listed below.

### 2.2 Booking lifecycle (target)

```
online booking ──► confirmed ──► assigned ──► in_progress ──► completed
walk-in booking ───────────────► assigned          │              │
                      │             │              ├──► no_show    └─ rate (passenger)
                      └─────────────┴──► cancelled ◄┘
```

| From | Allowed to | By whom | Money rule |
|---|---|---|---|
| confirmed | assigned, cancelled | management/admin (assign), passenger or staff (cancel) | none collected yet normally |
| assigned | in_progress, cancelled, confirmed (unassign) | assigned supervisor, management, admin | payments allowed |
| in_progress | completed, no_show, cancelled | assigned supervisor, management, admin | payments allowed |
| completed | nothing | none (corrections by admin through a logged adjustment) | **balance must be 0, or the shortfall explicitly written off with a reason** |
| cancelled, no_show | nothing | none | no new payments; any collected amount is refunded or retained by an explicit, logged ledger entry; a claimed discount is released |

**Today** the code accepts any status at any time (`updateBookingStatus` only checks the value is in a list), accepts payments in any status, lets a booking be completed with money owing, and does not release a discount on cancel. Section 4, finding F2.

### 2.3 Money (target)

- **One source of truth: the payments ledger.** Every cash, mobile money, card or account payment is a ledger row recorded by the system. Refunds and write-offs are negative or typed ledger rows with a reason and an actor. Nobody edits a ledger row.
- **Bookings hold derived figures** (collected, outstanding, status), always computable from the ledger.
- **Shift reports are attestations, not data entry.** At shift close the system builds the report from the ledger for that supervisor and window. The supervisor adds the physical cash counted and remarks. The report stores the variance. After submission it is locked.
- **Management and admin totals come from the ledger**, with the shift report as the cross-check.
- **Periods close.** Month-end produces a locked summary. The current "reporting baseline" reset button is a workaround for the lack of this.

Today the figures come from two separate places and are not compared (F1).

### 2.4 Day-to-day rhythm

| When | Who | What |
|---|---|---|
| Continuously | System | New online booking: alert management, email passenger. Unassigned for more than N minutes: escalate (recommended N = 15 during staffed hours) |
| Start of shift | Supervisor | Opens assigned list; confirms flights for the shift |
| During service | Supervisor | Status changes at each step; payment recorded when cash is taken, not later |
| End of shift | Supervisor | Closes shift: system-built report, counts cash, submits; it is locked |
| Next morning | Management | Reviews variances and unassigned or open bookings from yesterday |
| Weekly | Admin | Reviews failed emails, pending staff requests, discount usage |
| Month-end | Admin/finance | Closes the period, exports for the accountant |
| Staff leaves | Admin | Disables the account the same day (needs a "disable" action that does not exist yet, F8) |

### 2.5 Architecture and trust boundaries

```
Browser (React, anon key) ──reads──► Postgres via row-level security (read-only for money tables)
        │
        ├──function calls──► Edge Functions (verify caller + role) ──service role──► Postgres
        │                                   │                                    └► Storage (private bucket)
        │                                   └────────────────────────────────────► Resend (email)
        └──sign-in──► Supabase Auth (email+code, Google, authenticator-app MFA)

Cloudflare: DNS + static hosting of the React build.  Secrets: Supabase secrets only.
```

The boundary that matters: **anything that changes money, price, role or status goes through an Edge Function.** That is correct and should remain the rule for every new feature.

---

## 3. Summary of findings

| ID | Severity | Finding | Effort |
|---|---|---|---|
| F1 | Critical | Two unreconciled financial records; shift reports hand-typed, editable after submission, spoofable supervisor | L |
| F2 | Critical | No booking state machine; money and status are not coupled; cancel does not release discount or define refunds | M |
| F3 | High | Discount codes can be enumerated and guessed; no rate limit | S |
| F4 | High | No rate limiting or idempotency on booking creation (spam alerts, duplicate bookings on retry) | M |
| F5 | High | No audit trail of who changed what; notification rows (the only history) are deletable by recipients | M |
| F6 | High | Admin accounts: MFA optional, any admin can demote themselves, no last-admin guard, no way to disable a user | M |
| F7 | High | Privacy and compliance: no privacy notice, consent, retention or deletion for ID photos and personal data | M |
| F8 | High | Operational blind spots: failed emails silent and never retried, no error tracking, no uptime or alerting | M |
| F9 | High | Assignment and status alerts reach people only inside the app; no SMS/WhatsApp | M |
| F10 | High | No CI, no staging environment, no end-to-end tests, restore never rehearsed | M |
| F11 | Medium | File-path fields not tied to the owner (`passenger_photo_uri`, `photo_uri`) | S |
| F12 | Medium | Business input not validated (past flight dates, formats, cut-off); date and time stored as text | S |
| F13 | Medium | Data model: text IDs without foreign keys, stale denormalised names, no plan for account deletion | M |
| F14 | Medium | Passenger self-service missing: cancel/amend, receipt, online payment | L |
| F15 | Medium | Edge Function hardening: CORS `*`, no body limit, no request IDs | S |
| F16 | Medium | Browser security: no CSP, tokens in local storage, 8-character passwords | S |
| F17 | Medium | Lists capped at 50–100 rows with no paging; one 827 kB bundle; user count loads every user | M |
| F18 | Low | UX and accessibility: 29 `alert()`/`confirm()` calls, unlabeled icon buttons, no offline tolerance for field staff | M |
| F19 | Low | Accounting: no tax/levy model, no CSV export, no period close | M |

Effort: S under a day, M a few days, L a week or more.

---

## 4. Findings in detail

### F1. Critical: two financial records that are never reconciled
**Evidence.** `ShiftReportForm.jsx` builds a report from amounts the supervisor types (`meet_assist_entries`, `porter_amount_paid`); nothing is read from `bookings` or `payments`. `ManagementDashboard.jsx` states "Single source of truth: sum every submitted shift report". Meanwhile `payments` and `bookings.amount_collected` hold the real transactions. The `shift_reports` policies let the author update the row after submission, and the insert check only requires `created_by_id = auth.uid()`, so `supervisor_id` and `supervisor_name` can be any value. Porter commission is computed in the browser and stored.
**Risk.** The headline revenue figure is whatever supervisors typed. A mistake, or fraud, produces a number nobody can challenge, and a report can be edited after management has seen it.
**Fix.**
1. Add `create_shift_report(period, shift, cash_counted, remarks)` as a database function called by an Edge Function. It builds totals from `payments` where `recorded_by_id` is the caller and the time falls in the window, computes commission from `bookings.porters`, and stores `expected_total`, `cash_counted` and `variance`.
2. Force `supervisor_id` and `supervisor_name` from the caller. Remove client inserts and updates on `shift_reports`.
3. Lock reports on submit. Only admin can issue a logged correction.
4. Point management and admin totals at the ledger; show shift-report variance beside it.
**Decision made: some walk-in sales exist only in shift reports.** That is exactly how money goes missing without a trace, so the fix is to stop the report being a place where sales are created:

1. **Add a "Quick sale" for the desk** (recommended). One short form for walk-in meet-and-assist and porter sales: service, number of passengers, amount, payment method, optional name and phone. No flight number or flight time required, which is the likely reason supervisors skip the booking form today. A single function creates a minimal booking (`booking_channel = walk_in`, status `completed`) and its payment ledger row together. Every sale then has an id, a timestamp, an owner and an audit entry.
2. The shift report is then **built by the system from the ledger**, as described above. The supervisor only counts cash and adds remarks.
3. If you still want report-only entries, allow them as a separate, clearly labelled block ("Unbooked sales"): each line needs a count and a reason, they are stored as immutable rows when the report is submitted, they are **never added to the ledger totals**, and management sees them as a separate unverified figure with the supervisor's name. Treat any growth in that block as an operational warning.
4. Historic reports stay as they are; only new reports follow the new rules.

**Still to confirm:** how many sales per day are report-only today (this shows how much revenue is currently untraceable), and whether those sales capture any passenger detail you would want to keep.

### F2. Critical: no booking lifecycle
**Evidence.** `updateBookingStatus/index.ts` validates only that the status is one of six values. `recordPayment` checks role and amount but not booking status. Cancelling does not call `release_discount` and does not touch `amount_collected`. `BookingActions.jsx` offers all six statuses at all times.
**Risk.** A completed booking can be reopened, a cancelled booking can take payment, a booking can be completed with money owing, and a cancelled booking keeps its discount "used", which exhausts limited codes.
**Fix.** Implement the table in 2.2: a transition map in the function, a database trigger as the backstop (so a future function cannot bypass it), `record_payment` refusing cancelled and no-show bookings, release of the discount on cancel, and a `refund` ledger type with a mandatory reason. Add tests for every illegal transition.

### F3. High: discount codes can be enumerated
**Evidence.** `validateDiscountCode` and `createBooking` answer "does not exist" differently from "reserved for a different customer", "expired", "exhausted". There is no limit on attempts. Generated codes are `AAG-` plus six characters from a 32-letter alphabet (about 10⁹ values), but admins can type short codes like `SAVE10`.
**Risk.** A registered user can learn which codes exist and what state they are in. Redeeming still needs the right email, so this leaks information rather than money.
**Fix.** Return one message for every failure ("This code isn't valid for your account"), and keep the detail in the admin view only. Count failed attempts per user in a small table and block after, say, 10 in 15 minutes.

### F4. High: no abuse limits or idempotency
**Evidence.** `createBooking` runs for any signed-in non-pending user and notifies every management and admin user plus emails the passenger on each call. There is no cap and no idempotency key. The booking form disables its button while submitting, but a timeout and retry on a mobile network still sends a second request.
**Risk.** One account can flood management with alerts; a flaky connection creates duplicate bookings and duplicate emails.
**Fix.** Add `bookings.idempotency_key` (unique per passenger); the form sends one key per attempt and `createBooking` returns the existing booking on a repeat. Add per-user limits (for example 5 bookings per hour, 20 open bookings) in the function using a counter table.

### F5. High: no audit trail
**Evidence.** There is no history table (`grep` finds none). Status changes leave only notifications, and `notifications_delete` lets each recipient delete theirs. Role changes, price changes, discount edits and report edits leave nothing. `payments` is the only append-only record.
**Risk.** You cannot answer a dispute ("who marked this no-show?") or investigate a loss.
**Fix.** One `audit_log` table (actor, action, table, record id, before, after, time), insert-only for everyone, readable by admin, written by triggers on `bookings`, `profiles`, `service_packages`, `discount_codes`, `shift_reports`, `staff_role_assignments`. Add a `booking_events` view for the booking page timeline. Stop relying on notifications as history.

### F6. High: admin account governance
**Evidence.** Two-step verification is optional (`MfaSetup`). `profiles_admin_write` lets any admin change any role including their own, so the last admin can demote themselves. `StaffManager` can change roles but nothing can disable an account, so a departed supervisor keeps a working login (as a passenger).
**Risk.** A stolen admin password is a full compromise (prices, discounts, roles); losing the last admin locks you out of administration; offboarding is incomplete.
**Fix.**
1. Require MFA for admin and management: enrol on first sign-in and enforce `aal2` in policies for admin writes and in `requireCaller` for admin functions.
2. A trigger that refuses to remove the last active admin.
3. A `disabled` flag plus an Edge Function that bans the Supabase user, with an audit entry.
4. Keep at least two admins, one of them held by someone other than the day-to-day manager.

### F7. High: privacy and compliance
**Evidence.** The app has no privacy notice, terms, or consent text. It collects names, phone numbers, nationality, flight details and a photo of passenger identification. There is no retention rule, no deletion job and no process for a person asking to see or delete their data.
**Risk.** Legal exposure under Ghana's Data Protection Act, 2012 (Act 843), which, as I understand it, expects data controllers to register with the Data Protection Commission and to state purpose, retention and rights. **Confirm this and the exact obligations with a Ghanaian lawyer; this is not legal advice.**
**Fix.**
1. Add a privacy notice and terms page, linked from the footer and the booking form, with an explicit consent line at booking. It must say: ID photos are kept for 30 days after your flight date, then deleted.
2. **Retention (built, 30 days).** The `purgeIdPhotos` Edge Function runs daily, deletes the photo file of every booking whose flight date is more than 30 days ago, clears the booking's reference (`passenger_photo_uri`) and stamps `passenger_photo_deleted_at`. It also deletes uploads that were never attached to a booking after 7 days. It has a dry-run mode and is tested (SQL and Deno). The period is the `PHOTO_RETENTION_DAYS` setting. **Confirm the clock:** I started it from the **flight date**, not the upload date, because people book weeks ahead and an upload-based clock would delete the photo before the service. If you meant 30 days from upload, it is a one-line change.
3. Log who views ID photos (signed-URL creation goes through one place, `createFileSignedUrl`, so it can write an audit row).
4. Write a short procedure for access and deletion requests, and a function that anonymises a user (see F13).
5. Remember that backups can hold deleted photos for as long as your backup retention. Note this in the privacy notice if backups keep them longer than 30 days.

### F8. High: operational blind spots
**Evidence.** A failed email becomes a row in `email_deliveries` with status `failed` that nobody is shown and nothing retries. Bounces and complaints are not received (no Resend webhook). There is no error tracking, no uptime check and no alert on function errors. Supabase function logs are short-lived on lower plans.
**Risk.** A passenger never gets a confirmation and no one knows; an outage is discovered by a customer.
**Fix.**
1. An admin "Email problems" panel (failed rows with a Resend button) and a scheduled retry of `failed` rows (up to 3 times).
2. A Resend webhook function that records delivered, bounced and complained.
3. Sentry (or similar) in the browser and a log drain for functions; request IDs returned in error responses.
4. An uptime monitor on the site and on a cheap health function; alert to a phone, not just email.

### F9. High: alerts reach people only inside the app
**Evidence.** Supervisor assignment creates an in-app notification only. The phone number is mandatory on bookings, and supervisors work at the airport, not at a screen.
**Risk.** A booking is assigned and nobody knows. This is the operational failure that costs you customers.
**Fix.** Send assignment and reassignment alerts by WhatsApp or SMS (provider choice and cost are yours: WhatsApp Business API, Twilio, or a Ghanaian SMS gateway). Send the passenger "your supervisor is Ama, phone, where to meet" on assignment. Add the unassigned-booking escalation from 2.4.

### F10. High: delivery and recovery safety nets
**Evidence.** No CI, no staging project, no end-to-end tests. The Edge Function handlers have not run against real Supabase Auth or PostgREST; the DB tests run on a stand-in. `jsconfig.json` and `eslint.config.js` exclude `src/lib` and `src/api`, which hold auth and data access. Backups depend on your Supabase plan.
**Risk.** A bad migration or deploy goes straight to the live business, and a restore you have never done may not work.
**Fix.**
1. GitHub Actions: lint, typecheck, `npm test`, `npm run test:functions`, `npm run test:db` (Postgres service container), build.
2. A second Supabase project as staging, Cloudflare preview deployments pointed at it.
3. Playwright end-to-end tests run against `supabase start`: register, book, assign, pay, complete, rate; staff request and approval; discount; role access denials.
4. Include `src/lib` and `src/api` in lint and typecheck.
5. Pro plan with point-in-time recovery; rehearse a restore into staging once before launch, then quarterly. Write down your targets (suggested: lose at most 1 hour of data, back within 4 hours).

### F11. Medium: file paths not tied to their owner
**Evidence.** `createBooking` stores `passenger_photo_uri` as sent by the browser, and a supervisor writes `supervisor_directory.photo_uri` directly. The storage read rule (`can_read_private_file`) grants access to whatever path those fields name.
**Risk.** Someone could point their record at another user's file so that the person who can read the record can read the file. It needs the other user's id and a random file name, so it is unlikely, but it is a door that costs one line to close.
**Fix.** In `createBooking` reject a path that does not start with `<caller id>/`. Add a check constraint on both columns that the path starts with the owning user's id.

### F12. Medium: business input and dates
**Evidence.** `createBooking` checks that `flight_date` and `scheduled_flight_time` are present, not that they are valid, in the future, or far enough ahead. Both are stored as text, as are reporting dates. Contact numbers are not validated.
**Risk.** Bookings for yesterday, for "tomorrow", or for flights that cannot be served; reports that sort wrongly.
**Fix.** Parse and validate in the function, store `flight_at timestamptz` (Ghana is on GMT all year, UTC+0, so there is no daylight-saving trap, but keep the zone explicit), enforce a minimum lead time you choose (for example 2 hours for arrivals), validate phone numbers to a standard format, cap bags and passengers per rule.

### F13. Medium: data model integrity
**Evidence.** User and record references are `text` with no foreign keys (`passenger_user_id`, `booking_id` on payments and ratings). `assigned_supervisor_name`, `passenger_name` and `package_name` are copied at write time. Deleting a user in Supabase deletes the profile through cascade but leaves bookings pointing at nothing.
**Risk.** Orphan rows, stale names on old records, and no safe way to honour a deletion request.
**Fix.** A follow-up migration to add uuid foreign keys with `on delete set null` for user links and `on delete restrict` from payments to bookings. Treat copied names as historical snapshots by design (say so), and add an `anonymise_user` function that blanks personal fields but keeps money rows.

### F14. Medium: passenger self-service
**Evidence.** A passenger can book and rate but cannot cancel, amend flight details, get a receipt, or pay online. Every "online" booking is unpaid until staff take money.
**Risk.** Phone calls and staff time for changes; no-shows with no deposit; passengers with nothing to show a bank or employer.
**Fix (business decisions first).** Cancellation window and fee rules; self-service amend until a cutoff; a PDF receipt; optional online payment through a Ghana gateway (Paystack, Flutterwave or mobile-money checkout) with the webhook writing to the same ledger. Do this after F1 and F2, because both depend on a clean ledger.

### F15. Medium: Edge Function hardening
**Evidence.** `corsHeaders` allows any origin; request bodies are unbounded; errors carry no request ID.
**Fix.** Restrict CORS to `APP_URL` (and preview domains), cap body size, generate a request ID, log it, and return it in 500 responses so a user can quote it.

### F16. Medium: browser security
**Evidence.** No Content-Security-Policy; the Supabase session sits in local storage (the library default); minimum password length is 8.
**Fix.** Add a CSP in `public/_headers` (self, the Supabase URL for connect and images, Google for sign-in, data: for the QR image) and test it in report-only mode first; keep JWT expiry at one hour with refresh-token rotation on; raise the minimum password to 10 and turn on leaked-password protection if your plan has it. Admin MFA (F6) is the strongest control here.

### F17. Medium: lists, bundle, counts
**Evidence.** Dashboards cap at 50 to 100 rows with no "load more" (`PassengerDashboard` 50, `SupervisorDashboard` 100). `AdminDashboard` loads every profile to count users. The JavaScript bundle is one 827 kB file.
**Risk.** At a few hundred bookings, older bookings become unreachable from the dashboards, even though totals stay right.
**Fix.** Cursor paging (the adapter already supports `cursor` and `next_cursor`), `count()` for user totals, route-level `React.lazy`. At the likely scale, a single small Postgres instance is fine: do not add caching layers, queues or microservices.

### F18. Low: UX and accessibility
**Evidence.** 29 `alert()`/`confirm()` calls; icon-only buttons without labels; supervisors work on phones with patchy signal and nothing queues a failed action.
**Fix.** Replace dialogs with toasts and the existing `AlertDialog`; run an axe pass; show clear "not saved, retry" states, and consider a small offline retry for payment and status actions once F2 makes them safe to repeat.

### F19. Low: accounting
**Evidence.** Only a gross booking total and discounts exist. No tax or levy fields, no export, and the baseline reset stands in for period close.
**Fix.** Ask your accountant how VAT and any levies apply and whether receipts must follow a specific format, then add the fields and a receipt number. Add CSV export of the ledger and bookings, and the period close from 2.3.

---

## 5. What is already right (keep it)

- Writes to bookings, payments, discounts, ratings and roles are impossible from the browser, and tests prove it.
- Payments cannot overpay or double-apply: one SQL statement checks and updates, and a ledger row is written in the same transaction.
- Prices and discounts are recomputed on the server; a tampered request cannot change the amount.
- Discount claims are atomic and capped.
- Email sending is idempotent per event and logged; templates escape their variables.
- Private files are private; signed links last five minutes; access follows the booking relationship.
- Passenger data is isolated per account; supervisors see only what is assigned to them.
- Staff access is approval-based, and an admin cannot be created from the public form.

## 6. Recommended order

**Before go-live (about 1–2 weeks of work):** F1, F2, F3, F4, F5, F6 (MFA and last-admin guard), F7 (privacy page and retention decision), F8 (email retry and monitoring), F9 (at least SMS or WhatsApp for assignment), F10 (CI, staging, restore rehearsal), F11, F12.

**First month live:** F13, F15, F16, F17, the cancel and receipt parts of F14.

**Later, driven by use:** online payment, tax and period close (F19), offline tolerance and accessibility polish (F18).

## 7. Questions

**Answered by the owner:** walk-in sales are sometimes report-only (F1 revised); ID photos are kept 30 days (F7, built); about 50 bookings per day (section 8).

**Still open:**
1. How many sales per day are report-only today, and what detail does the supervisor have about them?
2. Does the 30-day clock start at the **flight date** (as built) or at upload?
3. What is the cancellation and refund policy, and who may waive it? (F2, F14)
4. Which channel do supervisors actually read in the field: WhatsApp, SMS or calls? (F9)
5. Who is the second admin, and who owns the Supabase, Cloudflare and Resend accounts? (F6, F10)
6. How do VAT and receipts have to work for your business? (F19)

---

## 8. Sizing at about 50 bookings a day

| Measure | Estimate | What it means |
|---|---|---|
| Bookings per year | about 18,000 | A few dozen MB of rows a year. A single small Postgres instance is far more than enough. No caching, queues or extra services. |
| Peak load | roughly 4 bookings an hour over a 12-hour day, plus staff browsing | Trivial for Supabase and for Edge Functions. |
| ID photos stored | 50 a day for 30 days is about 1,500 files at any time. **At the 5 MB upload limit that is up to 7.5 GB**; typical phone photos of 2–4 MB give 3–6 GB | **More than the Free plan's storage and close to what a small plan allows.** Photos are now shrunk in the browser before upload (about 1,600 px on the long side, JPEG at 80%, roughly 300 KB), so the steady state is about 450 MB. This is the one sizing risk; do it before launch. |
| Email | about 50 booking confirmations a day, plus sign-up codes, password resets and staff emails | Check Resend's current free-plan daily and monthly limits against this. You are likely to need a paid plan, and sign-up codes must not be blocked by a limit. |
| Database plan | n/a | Use a paid Supabase plan: the Free plan pauses after inactivity and has no point-in-time recovery, which F10 requires. |

The audit's priorities do not change with volume, but their urgency does: at 50 bookings a day with some sales outside the ledger, the daily money to reconcile is real, so F1 and F2 come first.
