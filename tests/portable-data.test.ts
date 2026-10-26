import { test } from "node:test";
import assert from "node:assert/strict";
import { exportSnapshot, mergeImport } from "../src/lib/portable-data";
import type { PriceAlert } from "../src/lib/alerts";

const alert = (id: string, productId: string): PriceAlert => ({
  id, productId, productName: "X", productSlug: "x", targetMinor: 10000, currency: "SEK", destination: "SE",
  createdAt: "2026-10-01T00:00:00Z", paused: false, lastNotifiedMinor: 9000, lastNotifiedAt: "2026-10-02T00:00:00Z", lastCheckedAt: null, lastBestMinor: null,
});

test("export → import round-trip merges favourites and alerts without duplicates", () => {
  const snap = exportSnapshot({ saved: ["p1", "p2"], alerts: [alert("a1", "p1")], currency: "SEK", theme: "light", location: { deliveryDestination: "SE" } }, new Date("2026-10-25T00:00:00Z"));
  const r = mergeImport(JSON.stringify(snap), { saved: ["p2", "p3"], alerts: [] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.saved, ["p2", "p3", "p1"]);
  assert.equal(r.addedFavourites, 1);
  assert.equal(r.addedAlerts, 1);
  // Imported alerts are re-armed on the new device.
  assert.equal(r.alerts[0]!.lastNotifiedMinor, null);
  // Importing the same file again adds nothing.
  const again = mergeImport(JSON.stringify(snap), { saved: r.saved, alerts: r.alerts });
  assert.ok(again.ok && again.addedFavourites === 0 && again.addedAlerts === 0);
});

test("legacy v0.5 export (saved array) is accepted", () => {
  const r = mergeImport(JSON.stringify({ exportedAt: "2026-09-01", saved: ["p9"], location: {} }), { saved: [], alerts: [] });
  assert.ok(r.ok && r.saved[0] === "p9");
});

test("untrusted files are rejected or sanitised", () => {
  assert.deepEqual(mergeImport("not json", { saved: [], alerts: [] }), { ok: false, error: "not_json" });
  assert.deepEqual(mergeImport(JSON.stringify({ hello: 1 }), { saved: [], alerts: [] }), { ok: false, error: "unknown_format" });
  assert.deepEqual(mergeImport("x".repeat(600 * 1024), { saved: [], alerts: [] }), { ok: false, error: "too_large" });
  const r = mergeImport(JSON.stringify({ format: "priceviva-export", version: 1, favourites: ["ok", 5, "x".repeat(100)], alerts: [{ id: "bad" }] }), { saved: [], alerts: [] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.saved, ["ok"]);
    assert.equal(r.skipped, 3);
  }
});
