import assert from "node:assert/strict";
import { test } from "node:test";
import { features, rankVisual, similarity, validateUpload } from "../src/lib/visual-search";

/** Synthetic 48×48 image: background colour + a filled shape. */
function img(bg: [number, number, number], fg: [number, number, number], shape: "tall" | "wide" | "circle", offset = 0, scale = 1) {
  const w = 48, h = 48, a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = 24 + offset, cy = 24 + offset, dx = (x - cx) / scale, dy = (y - cy) / scale;
    const inside = shape === "tall" ? Math.abs(dx) < 6 && Math.abs(dy) < 16 : shape === "wide" ? Math.abs(dx) < 16 && Math.abs(dy) < 6 : dx * dx + dy * dy < 120;
    const shade = inside && dy > 0 ? 0.8 : 1; // a little shading so the shape hash has structure
    const c = inside ? fg.map((v) => Math.round(v * shade)) : bg;
    const i = (y * w + x) * 4;
    a[i] = c[0]!; a[i + 1] = c[1]!; a[i + 2] = c[2]!; a[i + 3] = 255;
  }
  return features(a, w, h);
}

test("visual: the same object on a different background, moved and smaller, still matches best", () => {
  const catalogue = [
    { item: "red-tall", f: img([255, 255, 255], [200, 30, 30], "tall") },
    { item: "red-wide", f: img([255, 255, 255], [200, 30, 30], "wide") },
    { item: "blue-tall", f: img([255, 255, 255], [30, 60, 200], "tall") },
    { item: "green-circle", f: img([255, 255, 255], [40, 160, 60], "circle") },
  ];
  const photo = img([180, 170, 150], [205, 35, 35], "tall", 3, 0.8); // beige table, slightly off-centre, smaller
  const ranked = rankVisual(photo, catalogue);
  assert.equal(ranked[0]?.item, "red-tall");
  assert.ok(similarity(photo, catalogue[0]!.f) > similarity(photo, catalogue[1]!.f), "shape matters");
  assert.ok(similarity(photo, catalogue[0]!.f) > similarity(photo, catalogue[2]!.f), "colour matters");
});

test("visual: nothing similar -> empty result (no random products)", () => {
  const catalogue = [{ item: "red-tall", f: img([255, 255, 255], [200, 30, 30], "tall") }];
  const photo = img([255, 255, 255], [20, 200, 220], "circle");
  assert.deepEqual(rankVisual(photo, catalogue), []);
});

test("visual: upload validation (type, size)", () => {
  assert.equal(validateUpload({ type: "image/jpeg", size: 1000 }), null);
  assert.equal(validateUpload({ type: "image/gif", size: 1000 }), "type");
  assert.equal(validateUpload({ type: "image/png", size: 11 * 1024 * 1024 }), "size");
  assert.equal(validateUpload({ type: "image/png", size: 0 }), "empty");
});
