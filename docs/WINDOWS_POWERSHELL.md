# Run and preview PriceViva on Windows (PowerShell)

Copy each block into **Windows PowerShell** or **PowerShell 7**. Lines starting with `#` are comments.

## 1. One-time setup
```powershell
# Node.js 20.9 or newer is required. Check:
node -v
# If missing or older: install the LTS version from https://nodejs.org, then open a NEW PowerShell window.

# If PowerShell later says "running scripts is disabled on this system" for npm, allow local scripts for your user:
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Unzip and install
```powershell
# Adjust the zip name/location if you saved it elsewhere.
Expand-Archive -Path "$HOME\Downloads\priceviva-v0.7.zip" -DestinationPath "$HOME\Projects" -Force
Set-Location "$HOME\Projects\priceviva"
npm install
```

## 3. Start the site (free test mode, DummyJSON sample products)
```powershell
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue   # optional for test mode, needed later for admin
npm run dev
```
Wait for `Ready`, then open the site from a **second** PowerShell window, or just visit the address in your browser:
```powershell
Start-Process "http://localhost:3000"
```
The first page load fetches the sample products from dummyjson.com. It needs an internet connection and takes a few seconds. Stop the server with **Ctrl + C**.

## 3b. Optional: place and postcode search on Local Deal Radar
OpenStreetMap's free lookup service asks every site to identify itself. Add your email to `.env.local`:
```powershell
Add-Content .env.local "GEOCODER_CONTACT=you@example.com"
```
Without it, place search still works, but please set it before showing the site to others.

## 3c. Interface language
Use the globe menu in the header (or the phone menu) → **Language**. English and Svenska are complete; Deutsch and ไทย are marked **Beta**. The choice is kept in a cookie for a year.

## 3d. Database (live mode only)
Install or update PriceViva's database with one file that runs every migration in a single transaction and checks the result (it adds only, never deletes):
```powershell
Get-Content supabase\apply\priceviva_apply_all.sql -Raw | Set-Clipboard   # then paste into Supabase -> SQL Editor -> Run
```
Reusing a Supabase project that belonged to another website? Follow `docs/SUPABASE_CLEAN_SETUP.md` first.

## 3e. Contact address and search engines (v0.7)
```powershell
Add-Content .env.local "CONTACT_EMAIL=you@example.com"   # shown on /contact; leave out until you want it public
Add-Content .env.local "ALLOW_INDEXING=false"            # keep false until real retailer data is live
```

## 4. Turn on the admin page (mode switch, import reports)
```powershell
# Prints two lines: ADMIN_PASSWORD_HASH=... and ADMIN_SESSION_SECRET=...
npm run admin:hash -- "choose a long password here"
notepad .env.local    # paste the two printed lines over the empty ADMIN_ lines, save, close
```
Restart the server (Ctrl + C, then `npm run dev`) and open:
```powershell
Start-Process "http://localhost:3000/admin"
```
- **Overview → Catalogue source**: switch between **DEMO API (test mode)**, **REAL FEED (Awin)** (needs Supabase) and the **built-in demo**.
- **Test data (DummyJSON)**: fetch status, the sample-offer CSV import report, and **Refresh sample data now**.

## 5. Checks and a production preview
```powershell
npm test             # unit tests (sample mode, pricing, search, importer, admin session)
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run build        # production build
npm start            # serve the production build on http://localhost:3000
```
Or run the first four in one go: `npm run check`.

## 6. Replace the hero photo
See `docs\REPLACE_IMAGES.md`. Short version:
```powershell
Copy-Item "$HOME\Pictures\my-hero.webp" "public\images\site\hero-mall-shopper.webp" -Force
```

## 7. Edit the sample retailer offers
```powershell
notepad data\sample-offers.csv
```
Save, then press **Refresh sample data now** in admin, or restart the server. Column rules are in `docs\SAMPLE_MODE.md`.

## Troubleshooting
| Message | Fix |
|---|---|
| `npm : File ... npm.ps1 cannot be loaded` | Run the `Set-ExecutionPolicy` line in step 1, or use `npm.cmd` instead of `npm` |
| `'node' is not recognized` | Install Node.js LTS, then open a new PowerShell window |
| Port 3000 in use | `npm run dev -- -p 3001`, then open http://localhost:3001 |
| Yellow notice "Sample product API unavailable" | No internet, or DummyJSON is down. The site shows the saved copy or the built-in demo; try **Refresh** in admin later |
| Old content or old photo after a change | Hard refresh with Ctrl + F5 |
