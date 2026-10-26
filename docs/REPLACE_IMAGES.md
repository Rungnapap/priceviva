# Replacing the site photos

Site photos live in `public/images/site/`. Product photos are separate: they come from the catalogue (DummyJSON in test mode, retailer feeds in live mode).

| Where | Desktop file | Mobile file | Set in |
|---|---|---|---|
| Homepage hero | `bg-home-mall-shopper.webp` (1983×793) | `bg-home-mall-shopper-mobile.webp` (1083×793) | `src/data/site-backgrounds.ts` → `home` |
| Fashion & Beauty pages | `bg-fashion-beauty.webp` | `bg-fashion-beauty-mobile.webp` | `fashionBeauty` |
| Global Compare (page + homepage card) | `bg-global-city.webp` | `bg-global-city-mobile.webp` | `global` |
| Local Deal Radar (page + homepage card) | `bg-mall-corridor.webp` | `bg-mall-corridor-mobile.webp` | `local` |
| Other category pages | `bg-boutique-mall.webp` | `bg-boutique-mall-mobile.webp` | `browse` |
| Favourites, alerts, price history, stores | `bg-calm-ceiling.webp` | `bg-calm-ceiling-mobile.webp` | `calm` |
| Category tiles | `cat-*.webp` (640×480) | — | `src/data/shop-categories.ts` |

Phones (under 768 px wide) get the mobile file: a tighter crop around the subject, shown as a band above the page title. From 768 px up, the desktop file fills the header behind a soft wash on the left, where the text sits.

## Replace a background with the same name (quickest)
1. Prepare the photo:
   - wide landscape, about 2000 px wide, `.webp` or `.jpg`;
   - keep the subject on the **right half**, because the left side is covered by the text wash;
   - no readable text or store logos in the image.
2. Make a mobile crop: cut a roughly 4:3 area around the subject, about 1000 px wide.
3. Overwrite the files, keeping the same names:
   ```powershell
   Copy-Item "$HOME\Pictures\my-hero.webp" "public\images\site\bg-home-mall-shopper.webp" -Force
   Copy-Item "$HOME\Pictures\my-hero-mobile.webp" "public\images\site\bg-home-mall-shopper-mobile.webp" -Force
   ```
4. If the pixel size changed, update `width` and `height` for that entry in `src\data\site-backgrounds.ts`. The browser uses them to reserve space and avoid layout shift.
5. Restart `npm run dev` and press Ctrl + F5.

## Adjusting the crop
Each entry in `src\data\site-backgrounds.ts` has `position` (CSS `object-position`, e.g. `"70% 35%"`), which applies to the desktop file. Increase the first number to move the focus to the right.

## After replacing
Update `public\images\site\CREDITS.md`. Next.js resizes and converts the images automatically, so you don't need to make several sizes yourself.
