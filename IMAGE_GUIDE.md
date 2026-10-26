# Product photography

**Demo mode:** fictional demo products use clearly labeled drawn illustrations. Never attach a photo of a real branded product to a fictional model.

**Live mode (implemented):**
- Photos come only from the retailer's own product feed (Awin columns `large_image`, `merchant_image_url`, `aw_image_url`, `alternate_image*`, or Enhanced `image_link` / `additional_image_link`).
- Only `https://` URLs are accepted, up to 8 per product. They are stored per variant with their source and feed in `variant_images`, along with a licence note.
- Images are **hot-linked**, not copied, resized or re-hosted. When a retailer stops supplying an image, it disappears from the site within 30 days. This keeps us within the feed's usage terms and avoids holding copies.
- Product pages show a main photo with clickable thumbnails. A broken image falls back to a "Photo not supplied by retailer" placeholder.
- Products without any photo are listed in Admin → Missing photos.
- Before launch, confirm in each advertiser's programme terms that feed images may be shown on a comparison site.
