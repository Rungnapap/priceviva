# Clean Supabase setup for PriceViva (replacing the old website)

**Status: prepared, NOT run.** Each step marked **(approval)** waits for your go-ahead. You chose not to keep a backup of the old website, so steps 3 and 4 are permanent.

Files (all in this repo, no secrets in any of them):

| File | What it does | Changes data? |
|---|---|---|
| `supabase/one-off/old-site-cleanup/01_preview_READ_ONLY.sql` | Lists exactly what step 3 would remove, plus anything that still depends on it | No |
| `supabase/one-off/old-site-cleanup/02_remove_old_site.sql` | Removes the old website's 4 tables and 2 functions | **Yes, permanent** |
| `supabase/one-off/old-site-cleanup/03_remove_old_sequence.sql` | Removes the leftover sequence `service_request_ref_seq` | **Yes, permanent** |
| `supabase/apply/priceviva_apply_all.sql` | Installs PriceViva (all 3 migrations), checks the result, then commits | Adds only |

## What gets removed (old website only)

| Object | How |
|---|---|
| `public.admin_users`, `public.company_settings`, `public.request_rate_limits`, `public.service_requests` | `drop table` (one statement, **no CASCADE**) |
| their triggers, RLS policies, API grants, indexes, constraints, ID sequences | removed automatically with each table (they belong to it) |
| `public.is_admin()`, `public.set_updated_at()` | `drop function` (**no CASCADE**), after the tables |
| the one Auth user | Supabase dashboard (step 4), not SQL |

**Not touched:** schemas `auth`, `storage`, `extensions` and all other Supabase schemas; all extensions (`pgcrypto` stays); all roles; Supabase's default permissions; project settings.

**Safety built into step 3:**
- It runs in one transaction, so it either completes fully or changes nothing.
- It stops with nothing changed if:
  - any of the 6 objects is missing (wrong project, or already done);
  - the old tables hold more than 50 rows (the inventory showed 6; a much larger number means the wrong project, or the old site is still writing);
  - anything outside the list depends on them, such as a view, or a Storage policy that calls `is_admin()`. Without CASCADE, PostgreSQL refuses instead of silently removing extra things.
- All of these were tested on a mock Supabase database with your old site's structure.

## Step 0 — Retire the old website first (your hosting account, not Supabase)
1. Take the Kalmarsunds-Marinteknik site offline, or delete its deployment, wherever it is hosted.
2. In that hosting account, delete its Supabase environment variables: URL, anon key and any service_role key.
3. If you open the Supabase dashboard's **Integrations** (e.g. Vercel) and it's linked to the old site's project, disconnect it.
4. If the old site's code is in Git (e.g. GitHub), check whether a `.env` file with keys was ever committed. Either way, step 6 makes those keys useless.

## Step 1 — Get the latest PriceViva files
Unzip the new package over your project folder, or pull it with Git. Then in PowerShell:
```powershell
Set-Location "C:\path\to\priceviva"     # your project folder
npm.cmd install
npm.cmd test                            # expect: 102 pass, 15 skipped (database tests need step 7)
```

## Step 2 — Preview (read-only) and send me the result
```powershell
# Copies the preview SQL to the clipboard (it's long, so this avoids copy mistakes)
Get-Content supabase\one-off\old-site-cleanup\01_preview_READ_ONLY.sql -Raw | Set-Clipboard
```
1. Supabase → your PriceViva project → **SQL Editor → New query** → paste (Ctrl+V) → **Run**.
2. Check the result:
   - **WILL REMOVE** rows: the 4 tables (1, 1, 3, 1 rows) and 2 functions.
   - **removed with its table** rows: the old triggers, policies, grants, constraints.
   - **There must be no `BLOCKER` and no `CHECK` rows.**
   - **NOT TOUCHED** rows: anything else in `public`. This should be empty.
3. Use **Download → CSV** and send it to me. If there are BLOCKER/CHECK/NOT TOUCHED rows, I'll adjust the plan before anything is removed.

## Step 3 — Remove the old website's objects **(approval, permanent)**
```powershell
Get-Content supabase\one-off\old-site-cleanup\02_remove_old_site.sql -Raw | Set-Clipboard
```
1. SQL Editor → **New query** → paste → **Run**.
2. Supabase may ask you to confirm a *destructive operation*. That's expected for this step only.
3. Expected result: `left in public | nothing` and `functions left in public | none`.
4. If you see an error starting with **"Stopped, nothing changed"** or *"cannot drop … because other objects depend on it"*, nothing was removed. Send me the message.

### Step 3b — Leftover sequence `public.service_request_ref_seq` **(approval, permanent)**
The old website used a separate number counter for request references. It wasn't owned by a table column, so step 3 didn't remove it.
```powershell
Get-Content supabase\one-off\old-site-cleanup\03_remove_old_sequence.sql -Raw | Set-Clipboard
```
Paste into **SQL Editor → New query → Run**. The script:
- removes only this one sequence, in one transaction, with no CASCADE;
- stops with nothing changed if it is missing, is not a sequence, belongs to an extension, is owned by a column, is used by anything (defaults, views), is mentioned in any function or policy, or if PriceViva is already installed.

Expected result: `left in public | nothing` and `functions left in public | none`.

## Step 4 — Remove the old Auth user and Auth settings **(approval)**
Do this **after** step 3. Step 3 removes `admin_users`, which referred to this user.
1. **Authentication → Users**. In the user's row, open the **⋯** menu → **Delete user** → confirm.
   - This is Supabase's supported way. It also removes the user's sessions. (The same thing is available in code as `auth.admin.deleteUser()`; you don't need that.)
   - Don't delete users with SQL.
2. PriceViva doesn't use Supabase sign-in (the `/admin` page has its own password). So, in **Authentication → Sign In / Providers**:
   - turn **off** "Allow new users to sign up", so nobody can create accounts in an unused login system;
   - turn off any social providers, e.g. Google, the old site configured. Also revoke those app credentials in the provider's console (Google Cloud, etc.).
3. **Authentication → URL Configuration**: remove the old site's Site URL and Redirect URLs.
4. **Authentication → Emails / SMTP**: if the old site used its own mail server, remove those SMTP credentials.

## Step 5 — Install PriceViva's database **(approval)**
```powershell
Get-Content supabase\apply\priceviva_apply_all.sql -Raw | Set-Clipboard
```
SQL Editor → **New query** → paste → **Run**.

This creates:
- 16 tables;
- 29 `pa_*` functions;
- the extensions `pg_trgm` and `unaccent` in schema `extensions` (`pgcrypto` is already there).

Before it commits, it checks that:
- row-level security is on everywhere;
- the public key can call only the 9 catalogue read functions;
- the secret key can call the import and admin functions;
- nothing else is open.

If any check fails, it rolls back with *"PriceViva verification failed, so nothing was changed: …"*.

Expected summary:

| item | value |
|---|---|
| tables | 16 |
| pa_* functions | 29 |
| functions callable with the public key | 9 |
| extensions | pg_trgm in extensions, pgcrypto in extensions, unaccent in extensions |

Running it a second time is harmless.

Use this file instead of `npx supabase db push` for this project. It contains the same migrations.

## Step 6 — New API keys, then retire the old ones **(approval)**
Supabase's dashboard: **Project Settings → API Keys**.
1. Create a **secret key** for PriceViva, e.g. named `priceviva-server`. Note the existing **publishable key** (`sb_publishable_…`), or create one.
2. Put them into `.env.local` (next section) and into your hosting's environment variables. Check the site and `/admin`.
3. Then, on the same page:
   - **disable the legacy `anon` and `service_role` keys** (reversible if something breaks);
   - **delete** any other secret keys the old site used (not reversible).

   After this, any key the old website or its code still holds stops working.
4. Recommended: **Project Settings → Database → Reset database password.** The old site or its developer may know it, and PriceViva never uses it.

**Old credentials that must be retired:**

| Credential | Where it may still live | Action |
|---|---|---|
| Legacy `service_role` key (full database access) | old hosting env vars, old Git repo, old developer's PC | Disable legacy keys (step 6.3) |
| Legacy `anon` key | old site's browser code (public) | Disable legacy keys (step 6.3) |
| Any `sb_secret_…` key created for the old site | old hosting | Delete it (step 6.3) |
| Database password | old site (if it connected directly), old notes | Reset it (step 6.4) |
| Social login app secrets (Google etc.), SMTP password | Supabase Auth settings, provider consoles | Step 4 |
| Old deployment and its env vars, Vercel/Supabase integration | hosting account | Step 0 |

## Environment variables (`.env.local` on your PC, and your hosting's settings)

| Variable | Supabase dashboard | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Connect** button or **Project Settings → Data API**: Project URL, `https://<project-ref>.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project Settings → API Keys**: **publishable** key `sb_publishable_…` | No: public by design, and it can only call the 9 read functions |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API Keys**: **secret** key `sb_secret_…` | **Yes.** Server only. Never `NEXT_PUBLIC_`, never in Git, chat or screenshots |

PriceViva never needs the database password or a `postgresql://` connection string. Don't put either in `.env.local`.

```powershell
Set-Location "C:\path\to\priceviva"
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local          # fill the three lines above, keep CATALOG_SOURCE=sample, save and close
git check-ignore -v .env.local   # must print a line ending in .env.local (= Git ignores the file)
npm.cmd run env:check            # shows set / not set, and flags mix-ups; never prints a value
```
Then test the real connection (read-only, writes nothing, the site stays in sample mode):
```powershell
npm.cmd run db:ping
```
Expected: three `OK` lines (public read with 0 products before any import, public key refused by server-only functions, secret key works) and `Result: connection is working.`

`npm run env:check` (and the `/admin` Overview page) report, by variable name only:
- a secret key in any `NEXT_PUBLIC_` variable;
- the public key in the secret variable, or the same key in both;
- a malformed URL;
- a database connection string that shouldn't be there.

**Hosting (e.g. Vercel):** **Project → Settings → Environment Variables**. Add the same three. Mark `SUPABASE_SERVICE_ROLE_KEY` as **Sensitive**.

## Step 7 — Run the 15 database tests safely (local throwaway PostgreSQL only)
These tests delete and recreate a database called `pa_it` on the server in `PA_TEST_PG`.

**Safety guard (new):** the tests refuse to start, before any connection, unless:
- `PA_TEST_PG` points at `localhost`, `127.0.0.1` or a local socket;
- none of `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE` is set (these could redirect the connection).

A Supabase address is always refused, and the run shows a clear failure instead of silently skipping.

1. Install **PostgreSQL 17** for Windows from postgresql.org, *with* "PostgreSQL Server". Remember the password you choose for the local `postgres` user, and keep port 5432.
2. Add `C:\Program Files\PostgreSQL\17\bin` to PATH (Start → "Edit the system environment variables" → Environment Variables → Path → New). Open a **new** PowerShell.
3. Run:
```powershell
psql --version                                   # 17.x
Set-Location "C:\path\to\priceviva"
$pw = Read-Host "Password of your LOCAL postgres user" -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $pw).Password
$env:PA_TEST_PG = "localhost:5432:postgres"      # local only; anything else is refused
npm.cmd run test:db                              # expect: pass 15, fail 0
Remove-Item Env:PA_TEST_PG, Env:PGPASSWORD       # clean up this window
```

## Afterwards
- Keep the site in sample mode (`CATALOG_SOURCE=sample`) until one approved Awin feed has been imported and checked (`docs/SETUP_REAL_DATA.md` §4).
- The one-off cleanup files can stay in the repo as a record. They contain no data or secrets.
