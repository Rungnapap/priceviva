# Open PriceViva to Google (and Bing)

Today Google is told to stay away (`robots.txt` says `Disallow: /`, every page says `noindex`).
The code is ready; these steps switch it on. About 30 minutes, plus waiting for Google.

## 1. Database: add the two new functions (Supabase, 3 minutes)
Do this first: it makes search fast and lets the sitemap list your products.

1. Open https://supabase.com → your project → **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261102120000_catalog_speed.sql` in Notepad, copy everything, paste, click **Run**.
   You should see "Success". (A notice that something "already exists, skipping" is fine.)
3. **New query** again. Same for `supabase/migrations/20261102130000_sitemap.sql` → **Run** → "Success".

## 2. Vercel: switch indexing on (5 minutes)
1. https://vercel.com → your PriceViva project → **Settings** → **Environment Variables**.
2. Add (or edit) these for **Production**:

   | Name | Value |
   |---|---|
   | `ALLOW_INDEXING` | `true` |
   | `NEXT_PUBLIC_SITE_URL` | `https://www.priceviva.com` |

   Also check that `CATALOG_SOURCE` is `live` (indexing stays off for demo/test data, on purpose).
   Never paste `http://localhost:3000` here — that is only for your PC.
3. Deploy the new code the way you normally do. (If you only changed settings: **Deployments** → the newest one → **⋯** → **Redeploy**. Settings only take effect after a deploy.)

## 3. Check it worked (2 minutes)
Open these in your browser:
- https://www.priceviva.com/robots.txt → must say `Allow: /` and end with `Sitemap: https://www.priceviva.com/sitemap.xml`.
- https://www.priceviva.com/sitemap.xml → a long list; product addresses (`/product/…`) included.
- Any product page → right-click → **View page source** → search (Ctrl+F) for `noindex`: it must NOT be found on product pages.
- https://search.google.com/test/rich-results → paste a product page address → it should find a valid **Product**.

If `robots.txt` still says `Disallow: /`, the setting is missing or the deploy did not run.

## 4. Google Search Console (10 minutes + DNS wait)
1. Go to https://search.google.com/search-console and sign in with your Google account.
2. **Add property** → choose **Domain** → type `priceviva.com` → **Continue**.
3. Google shows a **TXT record** (starts with `google-site-verification=`). Copy it.
4. Log in where you bought the domain (your domain registrar, or Vercel if the domain is managed there: Vercel → **Domains** → priceviva.com → **DNS records**). Add a record: type **TXT**, name `@` (or empty), value = the text you copied. Save.
5. Back in Search Console click **Verify**. If it fails, wait 10–60 minutes and try again.
6. Left menu **Sitemaps** → enter `https://www.priceviva.com/sitemap.xml` → **Submit**.
7. Top search bar (**URL inspection**) → enter `https://www.priceviva.com/` → **Request indexing**.

## 5. Bing Webmaster Tools (5 minutes; Bing also feeds DuckDuckGo and Ecosia)
1. https://www.bing.com/webmasters → sign in.
2. Choose **Import from Google Search Console** (easiest; it copies the site and sitemap).

## What to expect
- First pages usually appear in Google within a few days; the full catalogue takes weeks.
- Google will not index every product. Pages sold by only one shop look a lot like the shop's own page; pages
  that compare several shops do much better. More approved retailers in the same niche = more indexed pages.
- Each week, check Search Console → **Pages** (what is indexed and why not) and **Performance** (searches,
  clicks). These numbers are the start of the weekly list in the brief (section 7).

## What the code does (v0.7.5)
- `robots.txt` and `sitemap.xml` open only when `ALLOW_INDEXING=true` AND real data is live.
- Sitemap: home, info pages, category pages with products, and every product with an active offer.
- Product pages: clean title (brand once), our own description built from real prices, canonical address,
  share preview, and schema.org Product data with real prices only — no ratings or reviews.
- Search results and Global Compare pages are `noindex` (endless URL variations); their links are still followed.
- If `NEXT_PUBLIC_SITE_URL` is missing — or is the localhost value from `.env.local` — Vercel's real domain is used,
  so Google never sees `localhost` addresses.
