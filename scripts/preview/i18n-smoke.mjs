// Interface-language checks on the demo preview (:4321): switching, persistence, translated screens, no overflow.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const base = process.env.BASE ?? "http://localhost:4321";
const b = await chromium.launch();
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };
const errors = [];

async function page(width, locale) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  if (locale) await ctx.addCookies([{ name: "pv_locale", value: locale, url: base }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const text = (p) => p.locator("body").innerText();

// 1. Default is English.
let p = await page(1440);
await p.goto(`${base}/`);
await p.getByRole("heading", { level: 1 }).waitFor();
check("default language is English", (await p.getByRole("heading", { level: 1 }).innerText()).includes("Compare Prices."));
check("html lang=en", (await p.evaluate(() => document.documentElement.lang)) === "en");

// 2. Switch to Swedish from the preferences menu → reload → Swedish everywhere, choice kept.
await p.getByRole("button", { name: /Delivery, currency and language/ }).click();
await Promise.all([p.waitForEvent("load"), p.locator("#lang-desktop").selectOption("sv")]);
await p.getByRole("heading", { level: 1 }).waitFor();
check("switching to Svenska translates the homepage", (await p.getByRole("heading", { level: 1 }).innerText()).includes("Jämför priser."));
check("html lang=sv", (await p.evaluate(() => document.documentElement.lang)) === "sv");
check("cookie pv_locale=sv saved", (await p.context().cookies()).some((c) => c.name === "pv_locale" && c.value === "sv"));
await p.goto(`${base}/compare`);
await p.waitForTimeout(400);
let t = await text(p);
check("compare page in Swedish", t.includes("Jämför produkter") && t.includes("Jämför butikernas erbjudanden"));
await p.goto(`${base}/deals`);
await p.waitForTimeout(400);
t = await text(p);
check("Local Deal Radar in Swedish", t.includes("Upptäck erbjudanden nära dig") || t.includes("Hitta område"));
await p.goto(`${base}/about`);
await p.waitForTimeout(300);
check("untranslated info page says it is English-only", (await text(p)).includes("finns bara på engelska"));
await p.goto(`${base}/`);
await p.waitForTimeout(300);
const price = await p.locator("article").first().innerText();
check("prices use Swedish number format with the ISO code (e.g. 1 299,00 SEK)", /\d,\d\d\sSEK/.test(price));
await p.context().close();

// 3. German and Thai (beta): labelled beta, no horizontal overflow at phone and tablet widths.
for (const [loc, w] of [["de", 1024], ["de", 820], ["th", 390], ["sv", 360], ["de", 360]]) {
  p = await page(w, loc);
  for (const path of ["/", "/compare", "/deals", "/search?q=headphones"]) {
    await p.goto(`${base}${path}`);
    await p.waitForTimeout(350);
    const o = await overflow(p);
    if (o > 1) check(`${loc} ${w}px ${path} no horizontal overflow (got ${o}px)`, false);
  }
  check(`${loc} ${w}px: no horizontal overflow on home/compare/deals/search`, true);
  await p.context().close();
}
p = await page(1440, "de");
await p.goto(`${base}/`);
await p.getByRole("button", { name: /Lieferung, Währung und Sprache/ }).click();
const opts = await p.locator("#lang-desktop option").allInnerTexts();
check("German and Thai are labelled beta in the selector", opts.some((o) => /Deutsch \(Beta\)/.test(o)) && opts.some((o) => /ไทย \(Beta\)/.test(o)));
check("English and Svenska are not labelled beta", opts.includes("English") && opts.includes("Svenska"));
await p.context().close();

check("no page errors", errors.length === 0);
if (errors.length) console.log(errors.slice(0, 5));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
