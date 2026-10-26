# Accounts, saved products and price alerts

## What works now
- **Log in, sign up, log out, forgot/reset password**: `/login`, `/signup`, `/forgot-password`, `/reset-password`. These use **Supabase Auth**.
  - PriceViva never stores a password. Supabase holds it in `auth.users`.
- **Sessions**:
  - Two httpOnly, SameSite=Lax cookies (`pv_at`, `pv_rt`) that page scripts can't read. They're marked Secure on https.
  - People stay logged in for up to 30 days, with the token refreshed automatically.
  - Logging out ends the session at Supabase, too.
- **E-mail links use PKCE**: a link only works in the browser that asked for it.
  - Sign-up confirmation logs the person in.
  - A reset link opens "choose a new password".
- **No account enumeration**:
  - Sign-up, password reset and resend give the same answer whether or not an address is registered.
  - A wrong password and an unknown e-mail give the same message.
- **Dashboard (`/account`)**: shows the e-mail, saved products, price alerts (edit, pause/resume, e-mail on/off, delete), and log out.
- **Saved products and alerts are kept in the account** (tables `user_saved_products`, `price_alerts`).
  - Row-level security: `user_id = auth.uid()`. Every user sees and changes only their own rows.
  - Guests keep using browser storage exactly as before.
  - On first login, a guest's lists are added to the account.
  - On a shared computer, one account's lists are never copied into another account.
  - Logging out removes the account's lists from that browser.
- **Security checks on every state-changing request**:
  - an Origin check (CSRF protection);
  - JSON only;
  - the same validation as the forms;
  - limits of 200 saved products and 50 alerts.

Code:
- `src/lib/server/auth/*`: Supabase Auth client, sessions, request handlers.
- `src/lib/auth-rules.ts`: form rules.
- `src/components/auth-forms.tsx`, `account-dashboard.tsx`, `account-sync.tsx`.
- `supabase/migrations/20261026130000_accounts.sql`.

## What you need to switch it on
1. **Database update** (adds only, deletes nothing).
   - Run `supabase/apply/priceviva_apply_all.sql` in the Supabase SQL Editor. It is safe to run on the database you already installed.
   - Expected summary: `tables 19`, `account tables protected by row-level security 3`, `pa_* functions 36`, `functions callable with the public key 9`.
   - Until then you can log in, but saved products and alerts stay in the browser, and the dashboard says a database update is needed.
2. **Supabase → Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (later your real https address).
   - Redirect URLs: add `http://localhost:3000/auth/callback` (later also `https://<your-domain>/auth/callback`).
3. **Supabase → Authentication → Sign In / Providers**:
   - **Email** must be enabled.
   - "Allow new users to sign up" must be **on**. If you switched it off while cleaning up the old website, switch it back on.
   - Keep "Confirm email" on.
4. **E-mails from Supabase**:
   - Supabase's built-in mailer is meant for testing. It has a low hourly limit and may only deliver to your Supabase team's own addresses.
   - For real users, set up custom SMTP (Authentication → Emails → SMTP settings) with a provider you choose. That may cost money, so it's your decision.
5. `.env.local` already has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key). Nothing new is needed for accounts.

## Price-alert e-mails
They are prepared but **off**. In TEST MODE they can never be sent: `src/lib/server/alert-emails.ts` refuses unless every one of these holds:
- the catalogue is in live mode, with verified feed offers only;
- `ALERT_EMAILS_ENABLED=true`;
- an e-mail provider is configured (`RESEND_API_KEY`, `ALERT_EMAIL_FROM`);
- `ALERT_EMAIL_SECRET` is set, for the signed unsubscribe links;
- `NEXT_PUBLIC_SITE_URL` is an https address;
- the account's address is confirmed;
- the alert is active with e-mail on.

How it behaves once switched on:
- **One e-mail per price drop**, recorded atomically in the database (`pa_alert_observe`).
- **Re-notifying**: after the price rises above the target, a later drop can notify again.
- **Unsubscribing**: every e-mail has an unsubscribe link (`/unsubscribe`). It is signed, and it's a button, so mail scanners can't trigger it.
- **No marketing**: e-mails only ever contain the alert the person set.
- **Delivery errors** are logged in `price_alert_events` (server-only).
- **Schedule**: checking needs a scheduled call to `/api/cron/price-alerts` (`Authorization: Bearer $CRON_SECRET`), e.g. Vercel Cron once a day. It isn't scheduled yet; in test mode it answers `{"skipped":"test_mode"}`.

Without e-mails, alerts are checked whenever the person opens PriceViva, and shown in the browser.

## Testing locally (http://localhost:3000)
1. `npm.cmd run env:check`, then `npm.cmd run dev`.
2. Header **Log in** → **Create an account** with an address you can read.
   - Try the form errors on purpose: empty, bad e-mail, a password with no number, passwords that don't match.
3. Open the confirmation e-mail **in the same browser**. You land on `/account` with "Welcome!".
4. Save a product (heart). Set a price alert on a product page. On `/account`:
   - edit the target, pause it, untick "E-mail me", then delete it;
   - in Supabase → Table Editor, `user_saved_products` and `price_alerts` show your rows.
5. **Log out**, then log in with a wrong password (clear message), then the right one. Your saved product is back.
6. **Forgot password** → e-mail link → choose a new password → log in with it.
7. Create a second account in a private window: it shows none of the first account's data.

Automated tests:
- `npm.cmd test`
- with a local throwaway PostgreSQL: `npm.cmd run test:db`. This runs the account tests against a Supabase stand-in, never your real project.
