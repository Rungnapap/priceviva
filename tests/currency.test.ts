import assert from "node:assert/strict";
import { test } from "node:test";
import { fxSnapshot } from "../src/data/fx";
import { convertMinor, formatMoney, fxFromQuotes } from "../src/lib/money";
import { DISPLAY_CURRENCIES } from "../src/lib/types";

test("currencies: all ten display currencies have a rate in the demo table", () => {
  assert.deepEqual(DISPLAY_CURRENCIES, ["SEK", "EUR", "GBP", "USD", "NOK", "DKK", "CHF", "CAD", "AUD", "JPY"]);
  for (const c of DISPLAY_CURRENCIES) assert.ok(fxSnapshot.rates[c] > 0, c);
});

test("currencies: ECB quotes build a complete table, or none at all (never a partial one)", () => {
  const q = { USD: 1.08, JPY: 162.3, GBP: 0.86, SEK: 11.2, NOK: 11.6, DKK: 7.46, CHF: 0.94, CAD: 1.48, AUD: 1.65 };
  const fx = fxFromQuotes(q, "2026-10-24", "ECB euro reference rates", DISPLAY_CURRENCIES);
  assert.ok(fx && fx.rates.EUR === 1 && fx.rates.JPY === 162.3 && fx.asOf === "2026-10-24");
  const { JPY: _drop, ...missing } = q;
  void _drop;
  assert.equal(fxFromQuotes(missing, "2026-10-24", "ECB", DISPLAY_CURRENCIES), null);
});

test("currencies: JPY shows no decimals, others two; conversion via EUR", () => {
  assert.match(formatMoney(123456, "JPY"), /JPY\s1,235$/);
  assert.match(formatMoney(123456, "USD"), /USD\s1,234\.56$/);
  const fx = fxFromQuotes({ USD: 1.1, SEK: 11, GBP: 0.85, NOK: 11.5, DKK: 7.46, CHF: 0.95, CAD: 1.5, AUD: 1.6, JPY: 160 }, "2026-10-24", "ECB", DISPLAY_CURRENCIES)!;
  assert.equal(convertMinor(1100, "SEK", "USD", fx), 110); // 11 SEK = 1 EUR = 1.10 USD
  assert.equal(convertMinor(100, "EUR", "JPY", fx), 16000);
});
