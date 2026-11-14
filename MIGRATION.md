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

`APP_URL` is used for the links inside emails and for invitation redirects, so set it to the real production address.

## 3. Deploy the Edge Functions

```bash
supabase functions deploy
```

This deploys every folder in `supabase/functions` (booking, payment, discount, staff-request, notification and invitation functions). Check: Supabase > Edge Functions lists 15 functions.

## 4. Supabase Auth settings

In Supabase > **Authentication**:

- **URL Configuration**: Site URL = `https://airportassistghana.com` (your production address). Redirect URLs: add `https://airportassistghana.com/**`, and for Cloudflare preview deployments `https://*.pages.dev/**` if you want to test them.
- **Sign In / Providers > Email**: "Confirm email" **on**; minimum password length 8.
- **Emails > Templates > Confirm signup**: replace the body with the contents of `supabase/templates/confirmation.html` and set the subject to `Your Airport Assist Ghana verification code`. The registration screen asks for the 6-digit code, which only appears if the template contains `{{ .Token }}`.
- **Emails > SMTP Settings**: turn on custom SMTP so sign-up codes and password-reset emails go through Resend instead of Supabase's very limited built-in sender (it allows only a few emails per hour and will block real sign-ups). Host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, sender = the same address as `EMAIL_FROM`.
- **Multi-Factor**: TOTP (authenticator app) enabled. SMS codes are not supported by this app.
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

3. Sign out and in again. You land on the Admin dashboard. From there, **Staff Accounts** invites supervisors and management by email (the invite email lets them set a password); people who register themselves and ask for staff access appear under **Staff Requests** for approval.

Turn on two-step verification for admin accounts: sidebar > Account security.

## 8. Check everything before switching over

Use a private window and a second email address for the passenger.

- [ ] Register as a passenger: the code email arrives (from your Resend domain), sign-in works, Google sign-in works
- [ ] Forgot password: the reset email arrives and the link lets you set a new password
- [ ] Book an arrival package with a photo: confirmation email arrives; the booking appears; management/admin get an alert
- [ ] Create a discount code (Admin), apply it as the right email: price drops; a different email is refused
- [ ] Assign a supervisor; as that supervisor change the status and record a part payment, then the rest: the balance reaches 0 and a second payment is refused
- [ ] A passenger cannot see another passenger's booking or open `/admin`
- [ ] Rate a completed booking as the passenger; submit a shift report as a supervisor; reporting totals look right
- [ ] Turn on two-step verification, sign out, sign in with the app code
- [ ] Supabase > Edge Functions > Logs show no unexpected errors; Resend > Emails shows the sends as delivered

## 9. Switch over

1. Keep the Base44 site running until step 8 is fully ticked.
2. Move the public address to Cloudflare Pages (step 6.5). If the address currently points to Base44, change that record and allow a few minutes.
3. Tell staff: everyone must **register again** on the new site (passwords cannot be copied from Base44), then an admin re-approves staff roles. Old bookings stay in Base44; export anything you still need from there before you cancel it.
4. After a week of normal use, cancel Base44.

**Rollback:** point the domain back at Base44. Nothing on the new side is shared with it.

## Known limits and follow-ups

- **No data was migrated** by design. If you later need old bookings, export them from Base44 and import into `bookings` with a one-off script.
- **SMS verification codes are not available**, only authenticator apps. Adding SMS needs a phone provider (Twilio or similar) configured in Supabase.
- The per-customer discount limit can still be exceeded by two simultaneous bookings from the same customer (same weakness as before the migration).
- No Content-Security-Policy header yet, and booking statuses have no state machine (see `AUDIT.md`).
- `src/lib` and `src/api` are outside the ESLint and TypeScript checks configured in `eslint.config.js` and `jsconfig.json`.
- Four stock photos on the home page still load from Unsplash, and a fallback image from Wix; replace them if you want no third-party image hosts.
- Supabase's free plan pauses projects after a week of inactivity and has no automatic backups. For a live business, use the Pro plan and enable daily backups.
