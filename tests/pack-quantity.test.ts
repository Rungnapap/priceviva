import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePackQuantity } from "../src/lib/importers/normalize";
import { mapAwinRow } from "../src/lib/importers/awin/map-row";

for (const [title, expected] of [["Cream 2-pack", 2], ["Socks 3 pack", 3], ["Pack of 4 cups", 4], ["Cream 500 ml", null], ["Cream 2 x 500ml", null], ["Backpack 20L", null], ["Model 24", null]] as const) {
  test(`explicit pack quantity: ${title}`, () => {
    assert.deepEqual(normalizePackQuantity([], title), { quantity: expected, uncertain: false });
  });
}

test("missing is unknown; structured counts are positive integers", () => {
  assert.deepEqual(normalizePackQuantity([null, undefined, ""], "Cream"), { quantity: null, uncertain: false });
  assert.deepEqual(normalizePackQuantity(["1"], "Cream"), { quantity: 1, uncertain: false });
  assert.deepEqual(normalizePackQuantity(["2", "2"], "Cream 2-pack"), { quantity: 2, uncertain: false });
  for (const raw of ["0", "-1", "1.5", "1e2", "100001", "unknown"]) {
    assert.deepEqual(normalizePackQuantity([raw], "Cream"), { quantity: null, uncertain: true });
  }
});

test("contradictory quantities cannot become cross-retailer matching evidence", () => {
  for (const [raw, title] of [[["2", "3"], "Cream"], [["1"], "Cream 2-pack"], [[], "2-pack and pack of 3"]] as const) {
    assert.deepEqual(normalizePackQuantity(raw, title), { quantity: null, uncertain: true });
  }
});

const ctx = { feedId: "test", source: "awin" as const, country: "SE", currency: "SEK", vatIncluded: true, retailer: { external_id: "TEST", name: "TEST", country: "SE" } };
const base = { merchant_product_id: "TEST1", product_name: "TEST cream", search_price: "99", aw_deep_link: "https://www.awin1.com/pclick.php?p=test" };

test("mapper propagates pack counts without changing prices or rejecting valid offers", () => {
  const known = mapAwinRow({ ...base, multipack: "2" }, 1, ctx);
  assert.equal(known.row?.pack_quantity, 2);
  assert.equal(known.row?.price_minor, 9900);
  const uncertain = mapAwinRow({ ...base, multipack: "1", product_name: "TEST cream 2-pack" }, 2, ctx);
  assert.ok(uncertain.row);
  assert.equal(uncertain.row.pack_quantity, null);
  assert.equal(uncertain.row.pack_quantity_uncertain, true);
  assert.ok(uncertain.issues.some(i => i.code === "pack_quantity_uncertain" && i.severity === "warning"));
  assert.equal(mapAwinRow(base, 3, ctx).row?.pack_quantity, null);
});
