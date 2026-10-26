# Price-drop alerts

## Works today
- **Setting an alert**: on any product page, press **Price alert** and choose a target delivered total for your delivery country, in your display currency.
- **Managing alerts**:
  - **/alerts** and the **/account** dashboard both offer Pause/Resume, Edit target, Delete and (when logged in) "E-mail me".
  - There is also an in-app notification inbox (bell in the header).
- **Where alerts are kept**:
  - Guests: in this browser.
  - Logged in: in your Supabase account (`price_alerts`, row-level security), so they appear on every device.
- **How alerts are checked**:
  - in the browser, each time PriceViva is opened and when the tab becomes active again;
  - complete delivered totals only, one notification per drop, re-armed when the price rises above the target, and paused alerts are silent;
  - notifications based on test data are labelled as such.

## E-mail alerts: prepared, switched off
Code: `src/lib/server/alert-emails.ts`, route `/api/cron/price-alerts`, unsubscribe page `/unsubscribe`.

**TEST MODE rule:** e-mails are never sent from DummyJSON products or demonstration/sample offers. The code refuses in demo and sample mode, and it only ever counts offers from verified retailer feeds (`source = "awin"`) with a complete, current delivered total. Tests prove this (`tests/alert-emails.test.ts`, and the e-mail test in `tests/accounts.db.test.ts`).

To switch it on later, each of these is **your decision**:
1. Live mode with approved retailer feeds.
2. An e-mail provider account and a verified sender domain. Resend is wired in; others are easy to add. This may cost money.
3. `.env`:
   - `ALERT_EMAILS_ENABLED=true`
   - `RESEND_API_KEY`
   - `ALERT_EMAIL_FROM`
   - `ALERT_EMAIL_SECRET` (32+ random characters)
   - an https `NEXT_PUBLIC_SITE_URL`
4. **A scheduled job.** Yes, one is needed: alerts must be checked while nobody has the site open.
   - Call `/api/cron/price-alerts` with `Authorization: Bearer $CRON_SECRET`, e.g. a daily Vercel Cron entry right after the feed import.
   - It is not scheduled yet.

How it behaves once switched on:
- **Duplicates**: the database records each drop atomically, so two runs can never e-mail the same drop twice.
- **Errors**: delivery errors are stored in `price_alert_events`; they never crash the run, and never show addresses or keys.
- **Who gets e-mails**: only confirmed e-mail addresses, and only alerts with "E-mail me" on.
- **Unsubscribing**: every e-mail has a signed unsubscribe link. It needs no login and only switches e-mail off for that one alert.
- **No marketing**: no e-mails besides the alerts people set.
