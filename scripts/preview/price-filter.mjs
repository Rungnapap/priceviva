// Price-range filter in the browser (sample preview :4322): every card shown must be within the range, alone or
// combined with a name, a category and sorting; invalid input is caught; currency conversion is consistent.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const base = process.env.BASE ?? "http://localhost:4322";
const shots = process.argv[2] ?? "/tmp/claude-0/ss";
const b = await chromium.launch();
let pass = 0, fail = 0;
const check = (n, c, extra = "") => { c ? pass++ : fail++; console.log(c ? "PASS" : "FAIL", n, c ? "" : extra); };
const errors = [];

async function page(width = 1280, prefs = null) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  if (prefs) await ctx.addInitScript((v) => localStorage.setItem("priceatlas:v1", v), JSON.stringify(prefs));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
/** The price each result is filtered and sorted by (lowest listed offer price, without delivery), in major units. */
async function cardPrices(p) {
  const v = await p.locator("main li[data-filter-price]").evaluateAll((ls) => ls.map((l) => Number(l.getAttribute("data-filter-price")) / 100));
  const all = await p.locator("main article").count();
  return all > v.length ? [...v, ...Array(all - v.length).fill(null)] : v;
}
async function allPages(p, url) {
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(300);
  const out = await cardPrices(p);
  const pages = await p.locator('nav[aria-label] a[aria-current], nav[aria-label] a').count();
  for (let n = 2; n <= Math.max(1, pages); n++) {
    const link = p.locator(`nav a:text-is("${n}")`);
    if (!(await link.count())) break;
    await link.first().click();
    await p.waitForTimeout(300);
    out.push(...(await cardPrices(p)));
  }
  return out;
}
const within = (xs, lo, hi) => xs.length > 0 && xs.every((x) => x !== null && (lo === null || x >= lo) && (hi === null || x <= hi));

const p = await page();
// Baseline
await p.goto(`${base}/search`, { waitUntil: "networkidle" });
const totalAll = Number((await p.locator("main h1 + p").innerText()).match(/(\d+) products/)[1]);

// 1. Price range without a product name
const r1 = await allPages(p, `${base}/search?min=500&max=2000&cur=SEK`);
check("min + max without a name: every card is within 500–2,000 SEK", within(r1, 500, 2000), JSON.stringify(r1));
const nb = (x) => x.replace(/[\u00a0\u202f]/g, " ");
check("status line says how many are in range and labels TEST DATA", /\d+ of \d+ products cost SEK 500\.00 – SEK 2,000\.00\./.test(nb(await p.locator("main").innerText())) && /Test data/i.test(await p.locator("main [role=status]").innerText()));
await p.goto(`${base}/search?min=500&max=2000&cur=SEK`, { waitUntil: "networkidle" });
await p.screenshot({ path: `${shots}/price_range_desktop.png`, fullPage: false });

// 1b. The filter price is exactly the price printed on each card
const pairs = await p.locator("main li[data-filter-price]").evaluateAll((ls) => ls.map((l) => {
  const t = (l.querySelector(".text-xl")?.textContent ?? "").replace(/[\u00a0\u202f]/g, " ");
  const m = t.match(/(\d[\d,]*\.\d{2})/);
  return [Number(l.getAttribute("data-filter-price")) / 100, m ? Number(m[1].replace(/,/g, "")) : null];
}));
check("every card in range shows the same price the filter used", pairs.length > 0 && pairs.every(([f, c]) => f === c), JSON.stringify(pairs));

// 2. Only a minimum / only a maximum
check("only minimum", within(await allPages(p, `${base}/search?min=3000&cur=SEK`), 3000, null));
{ const rmax = await allPages(p, `${base}/search?max=300&cur=SEK`); check("only maximum", within(rmax, null, 300), JSON.stringify(rmax)); }

// 3. Name + range, category + range, sorting with range
const r3 = await allPages(p, `${base}/search?q=headphones&min=1000&max=3000&cur=SEK`);
check("name + price range", within(r3, 1000, 3000), JSON.stringify(r3));
const r4 = await allPages(p, `${base}/search?dept=electronics&max=2500&cur=SEK`);
check("category + price range", within(r4, null, 2500), JSON.stringify(r4));
await p.goto(`${base}/search?dept=electronics&max=5000&cur=SEK&sort=price_asc`, { waitUntil: "networkidle" });
const s = (await cardPrices(p)).filter((x) => x !== null);
check("range + sort low→high is in ascending order", s.length > 1 && s.every((x, i) => i === 0 || s[i - 1] <= x), JSON.stringify(s));
await p.goto(`${base}/search?sort=price_desc`, { waitUntil: "networkidle" });
const d = (await cardPrices(p)).filter((x) => x !== null);
check("sort high→low without a range", d.length > 1 && d.every((x, i) => i === 0 || d[i - 1] >= x), JSON.stringify(d));

// 4. Filters survive paging (URL keeps them)
await p.goto(`${base}/search?max=100000&cur=SEK`, { waitUntil: "networkidle" });
const pageLink = p.locator('nav a:text-is("2")');
if (await pageLink.count()) {
  const href = await pageLink.first().getAttribute("href");
  check("page links keep min/max/currency", /max=100000/.test(href) && /cur=SEK/.test(href));
} else check("page links keep min/max/currency (single page)", true);

// 5. Form validation: min > max, negative/invalid values
await p.goto(`${base}/search?q=headphones`, { waitUntil: "networkidle" });
await p.locator("#smin").fill("2000");
await p.locator("#smax").fill("500");
await p.getByRole("button", { name: "Apply filters" }).click();
await p.waitForTimeout(300);
check("min > max is stopped with a message (nothing applied)", (await p.locator("#price-range-error").innerText()).includes("can't be higher") && !p.url().includes("min="));
await p.locator("#smin").fill("-5");
await p.locator("#smax").fill("");
await p.getByRole("button", { name: "Apply filters" }).click();
await p.waitForTimeout(300);
check("negative price is refused", (await p.locator("#price-range-error").innerText()).includes("0 or more") && !p.url().includes("min="));
await p.locator("#smin").fill("1 000,50");
await p.getByRole("button", { name: "Apply filters" }).click();
await p.waitForURL(/min=1000\.5/, { timeout: 5000 });
check("'1 000,50' is understood as 1000.50 and keeps the name", /q=headphones/.test(p.url()) && /cur=SEK/.test(p.url()));
await p.goto(`${base}/search?q=headphones&min=900&max=100&cur=SEK`, { waitUntil: "networkidle" });
check("min > max in a link: explained, filter not applied", (await p.locator("main").innerText()).includes("was not applied"));
await p.goto(`${base}/search?q=headphones&min=500&cur=SEK&dept=electronics`, { waitUntil: "networkidle" });
await p.getByRole("link", { name: "Clear filters" }).click();
await p.waitForTimeout(300);
check("Clear filters removes price and category but keeps the search words", p.url().endsWith("/search?q=headphones"));
await p.goto(`${base}/search?min=999999&cur=SEK`, { waitUntil: "networkidle" });
check("no products in range: helpful message, nothing invented", (await p.locator("main").innerText()).includes("No products in this price range") && (await p.locator("main article").count()) === 0);

// 6. Currency: a range typed in SEK, viewed in EUR, is converted (same rates as the prices)
const e = await page(1280, { currency: "EUR", deliveryDestination: "SE" });
await e.goto(`${base}/search?max=2000&cur=SEK`, { waitUntil: "networkidle" });
await e.waitForTimeout(300);
const eur = (await cardPrices(e)).filter((x) => x !== null);
const status = (await e.locator("main [role=status]").innerText()).replace(/[\u00a0\u202f]/g, " ");
const limit = Number(status.match(/EUR ([\d,]+\.\d{2})/)[1].replace(/,/g, ""));
check("range converted from SEK to EUR and every card is within it", /converted from SEK/.test(status) && limit > 100 && limit < 300 && within(eur, null, limit), `${limit} ${JSON.stringify(eur)}`);

// 7. Mobile
const m = await page(390);
await m.goto(`${base}/search?q=headphones&min=500&max=3000&cur=SEK`, { waitUntil: "networkidle" });
const o = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check("mobile: filters and results fit (no horizontal scroll)", o <= 1, `${o}px`);
await m.screenshot({ path: `${shots}/price_range_mobile.png`, fullPage: true });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(`\n${pass} passed, ${fail} failed (catalogue: ${totalAll} products)`);
await b.close();
process.exit(fail ? 1 : 0);
