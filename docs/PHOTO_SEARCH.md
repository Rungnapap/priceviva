# Photo and barcode search

## What works today (free, no external service)
- **Opening it:** the camera button in every search bar opens **Search by photo or barcode**.
- **Photo:**
  - upload, take a photo (phones open the camera), or drag and drop on a computer;
  - preview, select the product area by dragging, and Reset crop / Replace / Remove;
  - JPEG, PNG or WebP only, up to 10 MB; other files are rejected with a message.
- **Barcode:** type the EAN/UPC (check digit validated) → `/api/barcode`. In browsers with the `BarcodeDetector` API (Chrome/Edge on Android, some desktops), a barcode visible in an uploaded photo is read automatically.
- **Results:**
  - **Exact product match** comes **only** from a barcode that equals a catalogue GTIN;
  - photo results are always **Visually similar**, with High/Medium/Low similarity and a percentage;
  - below the similarity threshold the answer is "No visually similar product found", never random products;
  - a text search field is always available.

## How the photo matching works (`src/lib/visual-search.ts`)
1. Both your photo (or the selected area) and every catalogue photo are reduced to:
   - a colour histogram of the object, with the background removed using the border colour;
   - a 64-bit shape/brightness hash;
   - the object's proportions.
2. A weighted similarity score (0–1) ranks the catalogue.
- **Catalogue index:** built in your browser on first use. Catalogue photos come through `/api/image-proxy` (allow-listed hosts, images only, ≤3 MB, rate-limited), because browsers can't read pixels of other sites' images. It takes about 200 small images (~2 MB) for the test catalogue.
- **Privacy:** your photo is never uploaded. It is analysed in the browser and discarded when the dialog closes.

## Accuracy — honest limits
- **Tested here** with the real DummyJSON catalogue: 5 catalogue photos placed on a table background found the right product in the top 3 every time (4 of 5 at rank 1). An unrelated photo returned no high-similarity results.
- These test photos were made from the catalogue's own images, which is easier than a real phone photo with different lighting and angles. Expect lower accuracy for real photos.
- It recognises colour and shape, **not** brands, text or exact models. Two red sneakers look alike. This is **not** comparable to Google Lens.
- **Demo mode** uses drawings instead of photos, so photo search there says it cannot compare. Barcode search works in every mode.

## Live mode
Retailer photos are hosted on the retailers' own domains. Add those hosts to `IMAGE_PROXY_HOSTS` (comma-separated), or the index skips them; the dialog reports how many photos were compared. For thousands of products, build the index on the server instead (see the upgrade path).

## Upgrade path (needs your approval before any cost)
| Option | Accuracy | Cost | Privacy |
|---|---|---|---|
| Today: colour + shape on device | Look-alikes only | Free | Photo stays on device |
| Image embeddings (e.g. CLIP) computed at import, stored with `pgvector` in Supabase; query embedding in the browser | Much better "same kind of product"; still not exact identity | Free software; model download about 90 MB per visitor, or a small server | Photo can stay on device |
| Hosted visual product search (cloud vision APIs) | Best for real photos | Paid per request | Photos sent to a third party (must be disclosed) |

The ranking and labels (`rankVisual`, Exact/Visually similar) stay the same whichever feature extractor is used.
