import { test } from "node:test";
import assert from "node:assert/strict";
import { sendBatch, type ImportSink } from "../src/lib/importers/run";
import type { NormalizedRow } from "../src/lib/importers/types";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ external_id: `R${i}` }) as unknown as NormalizedRow);
const payload = (n: number) => ({ run_id: "run", feed_id: "feed", source: "awin", retailer: { external_id: "1", name: "Shop", country: "SE" }, rows: rows(n) });

/** A sink whose database "times out" on any batch larger than `limit` rows, like Supabase does on heavy batches. */
function timeoutSink(limit: number, message = "Database error in pa_import_batch (500): canceling statement due to statement timeout") {
  const stored: string[] = [];
  const calls: number[] = [];
  const sink = {
    batch: async (p: { rows: NormalizedRow[] }) => {
      calls.push(p.rows.length);
      if (p.rows.length > limit) throw new Error(message);
      stored.push(...p.rows.map((r) => r.external_id));
    },
  } as unknown as ImportSink;
  return { sink, stored, calls };
}

test("import batch: a timed-out batch is split and every row is stored exactly once, in order", async () => {
  const { sink, stored, calls } = timeoutSink(12);
  await sendBatch(sink, payload(50));
  assert.deepEqual(stored, rows(50).map((r) => r.external_id));
  assert.ok(calls.length > 1, "the batch was retried in smaller pieces");
});

test("import batch: no retry when the batch succeeds", async () => {
  const { sink, calls } = timeoutSink(100);
  await sendBatch(sink, payload(50));
  assert.deepEqual(calls, [50]);
});

test("import batch: gives up (throws) when even tiny batches time out", async () => {
  const { sink, stored } = timeoutSink(0);
  await assert.rejects(sendBatch(sink, payload(50)), /statement timeout/);
  assert.equal(stored.length, 0);
});

test("import batch: other database errors are not retried", async () => {
  const { sink, calls } = timeoutSink(10, "Database error in pa_import_batch (400): invalid input syntax");
  await assert.rejects(sendBatch(sink, payload(50)), /invalid input/);
  assert.deepEqual(calls, [50]);
});
