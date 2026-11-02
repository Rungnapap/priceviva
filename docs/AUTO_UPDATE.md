# Automatic product updates

## What was wrong
1. **Database timeout.** Supabase cancels any single request after a few seconds. The importer sent 250 products per request, and every product is several database writes, so Bazta SE and Strumpor-online failed with
   `canceling statement due to statement timeout`.
2. **Vercel time limit.** The nightly import ran as a Vercel function, which is stopped after about 5 minutes. A full feed takes longer, so runs ended as "partial". A partial run is never counted as a success, so the same first rows were re-imported every night and the rest never updated.

## What changed (v0.7.5)
- The importer sends 50 products per request. If a request still times out, it is split in half and retried automatically. This is safe: a request that timed out saved nothing.
- The nightly import runs in **GitHub Actions** (up to 100 minutes) at 02:37 UTC.
- `vercel.json` no longer schedules the import. It still runs price alerts at 04:45 UTC.
- A failed or partial nightly import makes the GitHub job fail, and GitHub emails you.

## One-time setup (about 15 minutes)

### 1. Test the fix from your PC (optional, recommended)
Open PowerShell in the `priceviva` folder:
```powershell
npm.cmd run import:feeds -- --force
```
This writes to your live database, the same as "Run import now" in admin. At the end every feed should say `"status": "succeeded"`. Check `/admin/feeds` too.

### 2. Put the project on GitHub (private)
1. Sign in at https://github.com, click **+** (top right) → **New repository**.
2. Name: `priceviva`. Choose **Private**. Do NOT add a README. Click **Create repository**.
3. In PowerShell, in the `priceviva` folder, run these one by one (replace `YOUR-NAME`):
   ```powershell
   git init
   git add .
   git status
   ```
   Check the list: `.env.local` must **not** appear. If it does, stop and ask.
   ```powershell
   git commit -m "PriceViva v0.7.5"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/priceviva.git
   git push -u origin main
   ```
   A browser window may ask you to sign in to GitHub. That is normal.

### 3. Add the secrets to GitHub
On the repository page: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
Add these 4 secrets. Copy each value from your `.env.local` file (the text after `=`):

| Name | Value from `.env.local` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same name |
| `SUPABASE_SERVICE_ROLE_KEY` | same name |
| `AWIN_DATAFEED_API_KEY` | same name |
| `AWIN_PUBLISHER_ID` | same name |

### 4. Run it once by hand
1. Repository → **Actions** tab. If asked, click **I understand my workflows, go ahead and enable them**.
2. Click **Import product feeds** → **Run workflow** → tick **Import all enabled feeds now** → **Run workflow**.
3. Click the run to watch it. A green tick = done. Open `/admin/feeds`: each feed should say **succeeded**.

### 5. Deploy the site
Deploy to Vercel the way you normally do. This removes the old import schedule from Vercel.

## Good to know
- GitHub pauses scheduled jobs in a repository with no activity for 60 days. It emails you first. Click **Enable workflow** in the Actions tab to resume.
- Scheduled GitHub jobs can start up to about 30 minutes late at busy times.
- A feed with more than 50,000 rows stops at 50,000 ("partial"). To raise the limit, go to Settings → Secrets and variables → Actions → **Variables** tab and add `IMPORT_MAX_ROWS_PER_FEED`.
- If the error still says `statement timeout` even with small batches, the next step is the database speed-up (skip rows that did not change).
