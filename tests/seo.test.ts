import { test } from "node:test";
import assert from "node:assert/strict";
import { indexingAllowed } from "../src/lib/server/seo";

test("search indexing needs both the owner's switch and live data", () => {
  assert.equal(indexingAllowed({}, "live"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "true" }, "sample"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "true" }, "demo"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "1" }, "live"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "true" }, "live"), true);
});
