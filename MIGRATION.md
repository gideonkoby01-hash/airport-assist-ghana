# Go-live guide: Supabase + Cloudflare + Resend

This takes the app from this repository to a running production site. The app starts **empty** (no data is copied from Base44), so the old site can keep running until the new one is checked.

Work through it in order. Each section ends with how to confirm it worked. Nothing here has been run against real accounts yet, so treat the first pass as a rehearsal on a staging project.

## 0. What you need

- A **Supabase** account (the Free plan is fine to start; see the note on email limits in step 4)
- A **Resend** account, and a domain you control for sending email (for example `airportassistghana.com`)
- A **Cloudflare** account with that domain's DNS on Cloudflare
- A **Google Cloud** project for "Continue with Google" (optional but the app offers it)
- On your computer: Node 22, the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), Git

## 1. Create the Supabase project

1. supabase.com > New project. Pick the region closest to your users (Europe or South Africa is closest to Ghana), set a strong database password and keep it somewhere safe.
2. From the project's **Settings > API** note the **Project URL**, the **anon public key** and the **service_role key**. The service role key bypasses all security: it never goes in the frontend, in Git, or in a chat.
3. In a terminal in this repository:

```bash
supabase login
supabase link --project-ref <your-project-ref>      # the ref is the part of the URL before .supabase.co
supabase db push                                    # applies supabase/migrations
```

4. Add the starting data (the four service packages): Supabase **SQL editor**, paste the contents of `supabase/seed.sql`, run. **Check the prices first**; they are the ones in `src/lib/packages.js`, not necessarily your live price list.

Check: Table editor shows `service_packages` with 4 rows, and `bookings`, `payments`, `profiles` and the other tables exist with a lock icon (row-level security on).

## 2. Resend (email)

1. Resend > Domains > Add domain. Use a sending subdomain such as `mail.airportassistghana.com` if you want to keep it apart from everyday company email.
2. Resend shows DNS records (SPF, DKIM, and a return-path record). Add each in Cloudflare DNS exactly as shown, set to **DNS only (grey cloud)**, not proxied. Click **Verify** in Resend; it can take from minutes to a few hours.
3. Resend > API Keys > create a key with "Sending access" for that domain. Copy it once.
4. Store the function secrets in Supabase (replace the values):

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set EMAIL_FROM="Airport Assist Ghana <noreply@mail.airportassistghana.com>"
supabase secrets set APP_URL=https://airportassistghana.com        # your final site address, no trailing slash
```

`APP_URL` is used for the links inside emails and for invitation redirects, so set it to the real production address. It is also the only website the functions will talk to (add preview sites to `ALLOWED_ORIGINS`, comma separated, if you test on them).

Optional settings, with the values used if you do not set them:

```bash
supabase secrets set MIN_LEAD_HOURS=2              # online bookings need this many hours' notice
supabase secrets set UNASSIGNED_ALERT_MINUTES=15   # alert management when a booking has no supervisor after this long
supabase secrets set PHOTO_RETENTION_DAYS=30       # see 3b
```

### 2a. Admin Settings page (API keys and code-level settings)

Most of the settings in this guide can be changed later from **Admin > Settings** instead of the terminal: how emails are sent (Resend, or **any SMTP mail server**: server, port, security, username, password), the Resend API key and webhook secret, the sender address, business contact details, booking rules, shift hours, escalation time, porter commission, and the photo retention period. Each field says what it does and whether its current value was saved there, comes from a server setting, or is the built-in default. Saved values win over server settings, which win over defaults, and a change reaches every function within seconds. Every change is recorded in the audit log (API keys by name and last four characters only, never the value).

One thing must be set in the terminal first, because the page stores API keys **encrypted** and needs a key that lives outside the database:

```bash
supabase secrets set SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32)
supabase functions deploy adminSettings
```

Keep a safe copy of that value (a password manager). If it is lost or changed, saved API keys become unreadable and must be entered again (nothing else is affected). Until it is set, the page shows a notice and the "Save key" buttons stay off; the `supabase secrets set RESEND_API_KEY=...` commands below keep working either way.

**SMTP instead of Resend.** Under Email, choose "An SMTP mail server", pick your provider from the list (Gmail, Microsoft 365, Zoho, Resend, SendGrid) or type the details, save the SMTP password with **Save key**, then use **Check connection** (signs in without sending) and **Send me a test email**. Things to know:
- Use **port 465 with SSL/TLS** if you can. As far as I know Supabase blocks outbound SMTP on ports 25 and 587 from Edge Functions; check its current documentation, and if the connection check times out, that is the likely reason.
- Gmail and Microsoft 365 need an **app password** (your normal password is refused). The message tells you if the server refuses the login.
- Certificates are always checked; a server with a self-signed certificate will be refused.
- The server must be a public mail host. Private and local addresses are rejected.
- SMTP gives no delivery reports, so **Admin > Email** shows a problem only when the server refuses the message, not when it bounces later. The Resend webhook (step 2b) is not used with SMTP.
- Booking confirmations, alerts and invitations use whichever way is chosen here. **Sign-up codes and password-reset emails are sent by Supabase's own sign-in service** and are configured in the Supabase dashboard (Authentication > Emails > SMTP Settings); the page shows the values to copy there.

Not editable on the page, on purpose: the website address (`APP_URL`, `ALLOWED_ORIGINS`: a wrong value would lock everyone out of the page itself), the scheduler secret, the Supabase service key, Google sign-in and the sign-up email SMTP password (the sign-in service needs those itself). The page lists where each of these lives.

### 2b. Resend webhook (delivered, bounced, spam)

So the Admin > Email screen can show emails that bounced:

1. After step 3 (the functions must be deployed first), in Resend > Webhooks > Add endpoint: URL `https://<project-ref>.supabase.co/functions/v1/resendWebhook`, events `email.delivered`, `email.bounced`, `email.complained`.
2. Copy the endpoint's **signing secret** (starts `whsec_`) and store it: `supabase secrets set RESEND_WEBHOOK_SECRET=whsec_xxxxxxxx`, then `supabase functions deploy resendWebhook`.
3. Check: send a test booking email; a few seconds later its row in `email_deliveries` changes from `sent` to `delivered`. (The signature check follows Resend's documented scheme but has only been tested against its own implementation, so confirm this once.)

## 3. Deploy the Edge Functions

```bash
supabase functions deploy
```

This deploys every folder in `supabase/functions` (booking, payment, discount, shift report, staff, notification, email and scheduler functions). Check: Supabase > Edge Functions lists 32 functions. `supabase/config.toml` turns off sign-in checking for the five that are called by a scheduler, by Resend or by an uptime monitor (`purgeIdPhotos`, `retryFailedEmails`, `escalateUnassigned`, `resendWebhook`, `health`); each of those protects itself with a secret or reveals nothing.

### 3b. ID photo retention (30 days)

Passenger ID photos are deleted 30 days after the flight date by the `purgeIdPhotos` function, which a daily database job calls. Set it up once:

1. Generate a long random secret (for example `openssl rand -hex 32`) and store it for the function and for the job:

```bash
supabase secrets set CRON_SECRET=<the secret>
supabase secrets set PHOTO_RETENTION_DAYS=30
```

2. Redeploy so the function picks them up: `supabase functions deploy purgeIdPhotos`.
3. **Try it without deleting anything first** (replace the project ref and secret):

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/purgeIdPhotos" \
  -H "x-cron-secret: <the secret>" -H "Content-Type: application/json" -d '{"dry_run": true}'
```

It returns how many files it would delete and why. On a new system this is `0`.
4. Schedule it. Supabase dashboard > Database > Extensions: enable `pg_cron` and `pg_net`. Then in the SQL editor (this stores the secret in Supabase Vault and runs the job every day at 03:15, which is 03:15 in Ghana because Ghana uses GMT all year):

```sql
select vault.create_secret('<the secret>', 'cron_secret');

select cron.schedule(
  'purge-id-photos', '15 3 * * *',
  $$ select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/purgeIdPhotos',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
       body := '{}'::jsonb) $$);
```

5. Check the next day: Edge Functions > purgeIdPhotos > Logs shows a line starting `purgeIdPhotos:` with the counts, and `select * from cron.job_run_details order by start_time desc limit 5;` shows `succeeded`.

The privacy notice must tell passengers that ID photos are kept for 30 days after the flight date. Backups may hold older photos until the backup itself expires.

### 3c. Scheduled jobs

Three small jobs keep the system tidy. They use the same `CRON_SECRET` as 3b (the Vault secret named `cron_secret` is already stored). With `pg_cron` and `pg_net` enabled, run once in the SQL editor (replace the project ref):

```sql
-- every 15 minutes: send again any email that failed (up to 3 tries in all)
select cron.schedule('retry-failed-emails', '*/15 * * * *', $$ select net.http_post(
  url := 'https://<project-ref>.supabase.co/functions/v1/retryFailedEmails',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
  body := '{}'::jsonb) $$);

-- every 5 minutes: alert management about a booking still without a supervisor after 15 minutes (once per booking)
select cron.schedule('escalate-unassigned', '*/5 * * * *', $$ select net.http_post(
  url := 'https://<project-ref>.supabase.co/functions/v1/escalateUnassigned',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
  body := '{}'::jsonb) $$);
```

Check after an hour: `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;` shows `succeeded`.

**Shift hours.** Shift reports cover the morning shift 06:00 to 18:00 and the night shift 18:00 to 06:00 the next morning (Ghana time). If your shifts differ, change them before anyone files a report:

```sql
update public.app_settings set value = '07:00' where key = 'shift_morning_start';
update public.app_settings set value = '19:00' where key = 'shift_night_start';
```

## 4. Supabase Auth settings

In Supabase > **Authentication**:

- **URL Configuration**: Site URL = `https://airportassistghana.com` (your production address). Redirect URLs: add `https://airportassistghana.com/**`, and for Cloudflare preview deployments `https://*.pages.dev/**` if you want to test them.
  - **Invitation links depend on this.** The staff invitation email sends people to `<your site>/reset-password`. Supabase only honours that address if it is in the Redirect URLs list; otherwise it silently sends them to the Site URL (the homepage). Add the exact address people really use (for example `https://airport-assist-ghana.pages.dev/**` until your own domain is live) and set the function secret `APP_URL` to the same address.
- **Authentication > Sign In / Providers > Email**: set *Email OTP expiration* to 86400 seconds (24 hours) so an invitation sent in the evening still works the next day.
- **Sign In / Providers > Email**: "Confirm email" **on**; minimum password length **10**.
- **Emails > Templates > Confirm signup**: replace the body with the contents of `supabase/templates/confirmation.html` and set the subject to `Your Airport Assist Ghana verification code`. The registration screen asks for the 6-digit code, which only appears if the template contains `{{ .Token }}`.
- **Emails > SMTP Settings**: turn on custom SMTP so sign-up codes and password-reset emails go through Resend instead of Supabase's very limited built-in sender (it allows only a few emails per hour and will block real sign-ups). Host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, sender = the same address as `EMAIL_FROM`. (If you chose SMTP on the Settings page, enter that mail server instead; the page shows the values.)
- **Multi-Factor**: TOTP (authenticator app) enabled. SMS codes are not supported by this app. The app **requires** it for admin and management accounts.
- **Providers > Google**: see step 5.

## 5. Google sign-in (optional)

1. Google Cloud console > APIs & Services > Credentials > Create credentials > OAuth client ID > Web application.
2. Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`. Authorised JavaScript origin: your site address.
3. Supabase > Authentication > Providers > Google: paste the client ID and secret, enable.

## 6. Cloudflare Pages (the website)

1. Cloudflare > Workers & Pages > Create > Pages > Connect to Git, choose this repository and the branch to deploy (normally `main`).
2. Build settings: framework preset **Vite**, build command `npm run build`, output directory `dist`.
3. Environment variables (Production, and Preview if you use it):
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon public key
   - `NODE_VERSION` = `22`
4. Deploy. `public/_redirects` makes every route load the app, and `public/_headers` adds basic security headers and caching.
5. Pages project > Custom domains > add `airportassistghana.com` (and `www`). Because DNS is on Cloudflare the records are created for you.

These `VITE_` values are public by design; the data is protected by the database rules, not by hiding them. Changing them needs a new deploy.

## 7. Create the first admin

1. Open the live site, register with your own email, enter the 6-digit code.
2. In Supabase SQL editor run (with your email):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

3. Sign out and in again. Admin and management accounts must use two-step verification, so you are first asked to set up an authenticator app (scan the QR code, enter the 6-digit code), then to sign in once more with a code. After that you land on the Admin dashboard. From there, **Staff Accounts** can **create** a supervisor or management account directly (no email needed: you are shown a one-time temporary password to hand over, and they must choose their own at first sign-in), or invite supervisors and management by email (the invite email opens a page where they choose their own password, then they sign in normally; **Resend access email** sends a fresh invitation to someone who has not accepted, or a password reset link to someone already active); people who register themselves and ask for staff access appear under **Staff Requests** for approval.

**Make a second admin straight away**: have a trusted person register normally, then change their role to Admin in the **User Accounts** list (the invite form cannot create admins). The system refuses to demote, disable or delete the last active admin, and a lost phone with no second admin means working in the Supabase SQL editor.

**If an admin is locked out** (lost phone): another admin removes their authenticator in the Supabase dashboard (Authentication > Users > the person > remove factors). If nobody can get in, as a last resort run `update public.app_settings set value = 'false' where key = 'require_staff_mfa';` in the SQL editor, sign in, then set it back to `'true'`.

**Who left?** Admin > Staff Accounts > **Disable** removes their access at once (history is kept). Use **Erase** only to delete someone's personal data on request (see `docs/DATA_REQUESTS.md`).

## 8. Check everything before switching over

Use a private window and a second email address for the passenger.

- [ ] Register as a passenger: the code email arrives (from your Resend domain), sign-in works, Google sign-in works
- [ ] Forgot password: the reset email arrives and the link lets you set a new password
- [ ] Book an arrival package with a photo: confirmation email arrives; the booking appears; management/admin get an alert
- [ ] Create a discount code (Admin), apply it as the right email: price drops; a different email is refused
- [ ] Assign a supervisor; as that supervisor change the status and record a part payment, then the rest: the balance reaches 0 and a second payment is refused
- [ ] A passenger cannot see another passenger's booking or open `/admin`
- [ ] Rate a completed booking as the passenger
- [ ] As a supervisor: record a **Quick sale** (cash), then open Shift Report for today: the sale is in it, the cash check expects that amount, and after you submit the report cannot be edited
- [ ] A cancelled booking refuses payments; completing a booking with money owing is refused with a clear message; management can record a refund or a write-off with a reason, and it shows in the booking History
- [ ] A passenger can cancel their own unpaid booking, and print a receipt for a paid one
- [ ] Two-step verification: admin and management are made to set it up and sign in with the code
- [ ] The privacy notice opens from the home page footer and the booking form needs the consent box ticked
- [ ] Admin > Email shows no problems; Admin > Summary > Export downloads a payments CSV that opens correctly in Excel
- [ ] Supabase > Edge Functions > Logs show no unexpected errors; Resend > Emails shows the sends as delivered

## 9. Switch over

1. Keep the Base44 site running until step 8 is fully ticked.
2. Move the public address to Cloudflare Pages (step 6.5). If the address currently points to Base44, change that record and allow a few minutes.
3. Tell staff: everyone must **register again** on the new site (passwords cannot be copied from Base44), then an admin re-approves staff roles. Old bookings stay in Base44; export anything you still need from there before you cancel it.
4. After a week of normal use, cancel Base44.

**Rollback:** point the domain back at Base44. Nothing on the new side is shared with it.

## 10. After go-live: monitoring, backups, security headers

- **Uptime**: point a monitor (UptimeRobot, Better Stack, or similar) at `https://<project-ref>.supabase.co/functions/v1/health` and at your site, alerting a phone, not only email. `health` answers 200 only when the functions and the database both work.
- **Errors**: this guide does not set up an error tracker (Sentry or similar) because that needs your account. Until then, Edge Functions > Logs is the place to look; every failure shows a short reference code that the person saw on screen.
- **Backups**: use a paid Supabase plan with point-in-time recovery. Rehearse a restore into a second (staging) project once before launch and again every three months. Write down how much data loss you can accept (suggested: one hour) and how fast you must be back (suggested: four hours).
- **Content-Security-Policy**: `public/_headers` sends it in report-only mode. After a week of normal use with no policy messages in the browser console on the main screens, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in that file and deploy.
- **CI**: `.github/workflows/ci.yml` runs lint, types, tests, the build, the function checks and the database tests on every pull request. It has not yet run on GitHub; open a pull request and look at the Actions tab.
- **Integrity check**: once a month an admin can call the `integrityCheck` function (or run `select * from data_integrity_check();`); every count should be 0.

## Automatic function deployment (no terminal)

The Edge Functions deploy themselves from GitHub: whenever anything under `supabase/functions/` changes on `main`, the **Deploy functions** workflow type-checks them and publishes them to Supabase. You set it up once:

1. **Create a Supabase access token.** In Supabase, click your profile picture (bottom left), **Account preferences**, **Access Tokens**, **Generate new token**. Name it "GitHub deploy" and copy it now (it is shown once).
2. **Add two secrets in GitHub.** In your repository: **Settings**, **Secrets and variables**, **Actions**, **New repository secret**.
   - `SUPABASE_ACCESS_TOKEN`: the token from step 1.
   - `SUPABASE_PROJECT_REF`: the part of your Supabase address before `.supabase.co` (for `https://abcd1234.supabase.co` it is `abcd1234`).
3. **Run it the first time.** In the repository open the **Actions** tab, choose **Deploy functions** on the left, **Run workflow**, **Run workflow**. When it shows a green tick, every function is live. From then on it runs by itself.

Function secrets such as `APP_URL` are not part of this. Set them in Supabase under **Edge Functions**, **Secrets**.
Database changes are not deployed from here either: run new files from `supabase/migrations` in the SQL Editor as described below.

## Updating a live system with a new database change

Some updates include a new file in `supabase/migrations/`. The site itself updates by itself when `main` changes, but database changes do not. Without a terminal: open the Supabase dashboard, **SQL Editor**, **New query**, paste the whole contents of the new migration file, and press **Run**. Run new files in date order, once each. Run new files in date order. `20261115000002_profile_self_service.sql` adds the phone number and the self-service "My profile" save; `20261115000003_customer_crm.sql` adds the Customers area (and links every existing booking to a customer); `20261115000004_staff_account_creation.sql` adds the forced password change for admin-created accounts; `20261116000001_porter_pay_and_quick_sale_flight.sql` adds flight details to Quick sale and the Porter pay screen (daily earnings and payouts); `20261116000002_shift_net_of_porter_commission.sql` makes shift reports show sales minus porter commission and stops a shift being closed while a service sold at the desk has no porter. `20261117000001_extra_porters.sql` and `20261117000002_remove_extra_porter_adding.sql` go together: extra porters were added and then withdrawn, so after both only the removal of an already recorded extra porter remains. `20261118000001_supervisor_commission.sql` adds the supervisor commission (GHS 50 by default, set under Settings, Operations): the tick box on a booking and in Sales, the line in the shift report, and the Commissions section for admin and management. `20261119000001_accounts_and_analytics.sql` adds the Accounts section (ledger, receivables, cash book, expenses, profit and loss, payables) and the dashboard analytics for admin and management. `20261120000001_accounts_role.sql` adds the Accounts staff role (for the person who keeps the books): they see only the analytics dashboard and the Accounts section, and must use two-step verification. Until the matching file is applied, those screens show an error.

New or changed Edge Functions (`supabase/functions/...`) must also be deployed before the feature works. `createStaffAccount` is new.

## Known limits and follow-ups

See `docs/PLATFORM_AUDIT.md` section "Status after the fixes" for the finding-by-finding list. In short:

- **No data was migrated** by design. If you later need old bookings, export them from Base44 and import into `bookings` with a one-off script.
- **SMS verification codes are not available**, only authenticator apps. Adding SMS needs a phone provider (Twilio or similar) configured in Supabase.
- Four stock photos on the home page still load from Unsplash, and a fallback image from Wix; replace them if you want no third-party image hosts.
- Supabase's free plan pauses projects after a week of inactivity and has no automatic backups. For a live business, use the Pro plan and enable daily backups.
- **Not built, because they need an account, a provider or a decision from you:** SMS or WhatsApp alerts, online card or mobile-money payment, a cancellation and refund policy for the website to apply automatically, passenger self-service changes to a booking, VAT/levy fields and tax-invoice numbering, and a monthly period close.
- The per-customer discount limit can still be exceeded by two simultaneous bookings from the same customer.
- Flight date and time are validated but still stored as text; foreign keys between tables are not enforced (the integrity check watches for broken links instead).

## Sign-up emails and Google sign-in (Supabase dashboard)

**Email look.** The emails people get when they sign up or reset a password come from Supabase's sign-in service, not from this website, so their design is set in the dashboard. Ready-made branded versions are in `supabase/templates/`. In **Authentication > Emails > Templates**, open each template, paste the matching file into **Message body**, set the **Subject**, and save:

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirmation.html` | Confirm your email for Airport Assist Ghana |
| Reset password | `recovery.html` | Reset your Airport Assist Ghana password |
| Magic link | `magic_link.html` | Your Airport Assist Ghana sign-in link |
| Change email address | `email_change.html` | Confirm your new email address |
| Reauthentication | `reauthentication.html` | Your Airport Assist Ghana confirmation code |

The sign-up email has a **Confirm my email** button and also shows a 6-digit code, and the website accepts either. The sender still reads "Supabase Auth" until you set up your own SMTP sender under **Authentication > Emails > SMTP Settings** (Admin > Settings > Email shows the values to use).

**Google sign-in.** It only works once Google is switched on in Supabase, and until then the website hides the "Continue with Google" button. To turn it on:
1. In Google Cloud Console, create an OAuth client (type **Web application**). Under **Authorized redirect URIs** add `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase shows the exact address on the Google provider page).
2. In Supabase, **Authentication > Sign In / Providers > Google**: switch it on and paste the **Client ID** and **Client Secret**. Save.
3. In **Authentication > URL Configuration**, make sure the website address is in the Redirect URLs, for example `https://airport-assist-ghana.pages.dev/**`.
The button appears on the sign-in and sign-up pages by itself within a minute of saving.

**One porter, one passenger (run once in the SQL Editor).** Run `supabase/migrations/20261120000002_one_porter_per_passenger.sql`. After it, a porter handles exactly one passenger and earns the porter commission (GHS 30) once for that job, on every service including meet and assist. A booking or desk sale with 3 passengers needs 3 different porters, and a shift report cannot be submitted while a desk sale has fewer porters than passengers. Only the supervisor gets the separate GHS 50 commission, and only on a meet and assist. Porters already recorded on older bookings are left as they were.

**Supervisor commission is automatic (run once in the SQL Editor).** Run `supabase/migrations/20261120000004_automatic_supervisor_commission.sql`. Every meet and assist now earns the supervisor GHS 50 (the Supervisor commission setting) automatically when its first payment is recorded, so nobody has to tick it. It is taken off the day's takings in the shift report, but supervisors still record the full amount of cash. Porter Service Only earns none, and a cancelled or no-show booking loses it unless it is already in a submitted shift report. It applies to bookings paid from now on.

**A meet and assist does not always need a porter (run once in the SQL Editor).** Run `supabase/migrations/20261120000003_meet_assist_no_porter.sql` after `20261120000002_one_porter_per_passenger.sql`. Staff can now mark passengers on a meet and assist as needing no porter: on a desk sale, choose "No porter needed" for that passenger; on a website booking, use "No porter needed" in the Porters & Commission panel. No porter commission is paid for those passengers and they do not hold up the shift report. Porter Service Only always needs a porter for each passenger.

**Booking page and package wording (run once in the SQL Editor).** Run `supabase/ensure_all_services.sql` (a one-off script, not a migration). It makes sure all four services exist and are switched on for the booking page (any that is missing is added at the standard price), updates what each includes (the wording passengers see) and removes the "not included" lists; the names and prices of services that already exist are not touched. Passengers now book on their own page, `/book`, with no dashboard around it: they pick a service, enter flight and traveller details, review, and only then sign in or create an account. Their answers are kept through signing in and a refresh, and the browser's Back button goes to the previous step. Passengers can view prices in GHS or US dollars; set the **Dollar exchange rate** under Admin > Settings > Bookings (the default is 15 cedis to the dollar, so check it). Payments and reports stay in cedis.

**Email confirmation at sign-up is off until a super admin switches it on.** The website works with either setting: while **Confirm email** is off in Supabase (Authentication > Sign In / Providers > Email), a new passenger is signed in as soon as they create their account. When the mail server works (Admin > Settings > Email, and the same details in Supabase > Authentication > Emails > SMTP Settings), turn **Confirm email** on and new accounts will be asked to confirm their email by link or 6-digit code. Accounts that are stuck waiting for a confirmation email can be confirmed by hand in the SQL Editor: `update auth.users set email_confirmed_at = now() where email_confirmed_at is null;`
