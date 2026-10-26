import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES, LOCALE_INFO } from "../src/i18n/config";
import { interpolate, makeT, parseLocale, translate } from "../src/i18n";
import { en } from "../src/i18n/messages/en";
import { sv } from "../src/i18n/messages/sv";
import { de } from "../src/i18n/messages/de";
import { th } from "../src/i18n/messages/th";
import { formatMoney } from "../src/lib/money";

const dicts = { en, sv, de, th } as Record<string, Record<string, string>>;
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("every language has every key, no empty strings, same placeholders as English", () => {
  for (const l of LOCALES) {
    const d = dicts[l]!;
    assert.deepEqual(Object.keys(d).sort(), Object.keys(en).sort(), `${l} keys`);
    for (const [k, v] of Object.entries(d)) {
      assert.ok(v.trim().length > 0, `${l}.${k} empty`);
      assert.equal(vars(v), vars((en as Record<string, string>)[k]!), `${l}.${k} placeholders`);
    }
  }
});

test("Swedish is a real translation, not a copy of English", () => {
  const same = Object.keys(en).filter((k) => (sv as Record<string, string>)[k] === (en as Record<string, string>)[k]);
  // A few strings are legitimately identical (brand names, "Variant", "beta", "GTIN (demo)").
  assert.ok(same.length < Object.keys(en).length * 0.05, `too many untranslated: ${same.slice(0, 20).join(", ")}`);
});

test("only English and Swedish are claimed complete", () => {
  assert.deepEqual(LOCALES.filter((l) => LOCALE_INFO[l].status === "complete"), ["en", "sv"]);
});

test("interpolation, fallback and locale parsing", () => {
  assert.equal(interpolate("{n} of {m}", { n: 1, m: 3 }), "1 of 3");
  assert.equal(interpolate("keep {x}", {}), "keep {x}");
  assert.equal(translate("sv", "nav.home"), "Hem");
  assert.equal(makeT("de")("radar.away", { km: 5 }), "5 km entfernt");
  assert.equal(parseLocale("xx"), "en");
  assert.equal(parseLocale("th"), "th");
});

test("money follows the interface language but always shows the currency code", () => {
  assert.equal(formatMoney(129900, "SEK"), "SEK 1,299.00");
  assert.match(formatMoney(129900, "SEK", { locale: "sv-SE" }), /^1\s299,00\sSEK$/);
  assert.match(formatMoney(150000, "JPY", { locale: "de-DE" }), /1\.500\sJPY/);
});
