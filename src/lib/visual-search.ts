/**
 * Visual similarity for photo search — a small, free, on-device method.
 *
 * What it is: each image is reduced to (1) a 64-bin colour histogram of the object (the near-uniform background
 * is removed using the border colour), (2) a 64-bit "difference hash" of its shape/brightness layout and
 * (3) its aspect ratio. Two images are compared with a weighted score from 0 to 1.
 *
 * What it is NOT: product recognition. It finds catalogue photos that LOOK alike (colour, shape, layout);
 * it cannot read brands or tell two similar models apart. Results are therefore always labelled
 * "visually similar" with a confidence level — never "exact match". Exact identification comes only from a
 * barcode (GTIN) that matches a catalogue product. Upgrade path: replace `features()` with an image-embedding
 * model (e.g. CLIP) and keep the same ranking/labelling interface (docs/PHOTO_SEARCH.md).
 */

export const FEATURE_SIZE = 48; // images are resampled to 48×48 before feature extraction

export interface VisualFeatures {
  hist: Float32Array; // 64 bins, sums to 1
  hash: Uint8Array; // 64 bits as 0/1
  aspect: number; // object bounding-box width / height
}

const q = (v: number) => Math.min(3, v >> 6); // 0..255 -> 0..3

/**
 * Features from RGBA pixels (length = w*h*4). The background colour is estimated from the border pixels;
 * pixels close to it are ignored, so a product on white and the same product on a table compare fairly.
 */
export function features(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, sourceAspect = 1): VisualFeatures {
  // Background estimate: per-channel median of the border pixels (robust to an object touching one edge).
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const push = (x: number, y: number) => { const i = (y * w + x) * 4; rs.push(rgba[i]!); gs.push(rgba[i + 1]!); bs.push(rgba[i + 2]!); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { push(0, y); push(w - 1, y); }
  const med = (a: number[]) => a.sort((p, q2) => p - q2)[a.length >> 1]!;
  const br = med(rs), bg = med(gs), bb = med(bs);

  const hist = new Float32Array(64);
  const gray = new Float32Array(w * h);
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!, a = rgba[i + 3]!;
      const isBg = a < 16 || Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) < 60;
      gray[y * w + x] = isBg ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
      if (isBg) continue;
      hist[q(r) * 16 + q(g) * 4 + q(b)]! += 1;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (count > 0) for (let k = 0; k < 64; k++) hist[k]! /= count;

  // dHash over the object's bounding box (falls back to the whole image).
  const bx0 = count ? minX : 0, by0 = count ? minY : 0, bx1 = count ? maxX : w - 1, by1 = count ? maxY : h - 1;
  const sample = (sx: number, sy: number) => {
    const x = Math.min(w - 1, Math.max(0, Math.round(bx0 + (sx / 8) * (bx1 - bx0))));
    const y = Math.min(h - 1, Math.max(0, Math.round(by0 + (sy / 7) * (by1 - by0))));
    return gray[y * w + x]!;
  };
  const hash = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash[y * 8 + x] = sample(x, y) < sample(x + 1, y) ? 1 : 0;

  // The image was stretched to a square; restore the real proportions of the object.
  const aspect = (count ? (bx1 - bx0 + 1) / (by1 - by0 + 1) : w / h) * sourceAspect;
  return { hist, hash, aspect };
}

export function similarity(a: VisualFeatures, b: VisualFeatures): number {
  let inter = 0;
  for (let k = 0; k < 64; k++) inter += Math.min(a.hist[k]!, b.hist[k]!);
  let same = 0;
  for (let k = 0; k < 64; k++) same += a.hash[k] === b.hash[k] ? 1 : 0;
  const shape = same / 64;
  const ar = Math.min(a.aspect, b.aspect) / Math.max(a.aspect, b.aspect);
  return 0.55 * inter + 0.3 * shape + 0.15 * ar;
}

export type VisualConfidence = "high" | "medium" | "low";

/** Below this, a catalogue image is not shown as a result at all ("no match" is a valid answer). */
export const MIN_SCORE = 0.62;

export function confidenceOf(score: number): VisualConfidence {
  return score >= 0.85 ? "high" : score >= 0.74 ? "medium" : "low";
}

export interface IndexedImage<T> {
  item: T;
  f: VisualFeatures;
}

export function rankVisual<T>(query: VisualFeatures, index: IndexedImage<T>[], limit = 12): { item: T; score: number; confidence: VisualConfidence }[] {
  return index
    .map((e) => ({ item: e.item, score: similarity(query, e.f) }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({ ...r, confidence: confidenceOf(r.score) }));
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Returns a problem code (the interface shows a translated message) or null when the file is acceptable. */
export type UploadProblem = "type" | "size" | "empty";
export function validateUpload(file: { type: string; size: number }): UploadProblem | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  if (file.size === 0) return "empty";
  return null;
}
