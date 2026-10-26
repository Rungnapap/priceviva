// Live-mode preview check against the local test database (synthetic fixtures only).
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const base = process.env.BASE ?? "http://localhost:4323"; const [shots, slug] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
// Fixture image URLs point at an unresolvable test domain; answer them with a labeled placeholder so the gallery can be exercised.
await ctx.route("https://images.test.invalid/**", (route) => {
  const name = new URL(route.request().url()).pathname.slice(1);
  route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#eef4ff"/><text x="300" y="290" font-size="40" text-anchor="middle" fill="#155eef" font-family="sans-serif">TEST IMAGE</text><text x="300" y="340" font-size="28" text-anchor="middle" fill="#667085" font-family="sans-serif">${name}</text></svg>` });
});
await ctx.addInitScript(() => { try { if (!localStorage.getItem("priceatlas:v1")) localStorage.setItem("priceatlas:v1", JSON.stringify({ deliveryDestination: "GB", currency: "GBP", savedArea: { cityId: "london", radiusKm: 10 } })); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text()) && errors.push(m.text()));
// (Map tiles come from tile.openstreetmap.org, which this sandbox cannot reach; those load errors are expected here.)
let pass = 0, fail = 0; const check = (n, c) => { c ? pass++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const text = () => p.locator("main").innerText();
const openPrefs = async () => { if (!(await p.locator("#prefs-menu").isVisible().catch(() => false))) await p.getByRole("button", { name: /Delivery, currency and language/ }).click(); };

await p.goto(base + "/", { waitUntil: "networkidle" });
const home = await text();
check("home: no demo labels in live mode", home.includes("Explore Products") && !/fictional demo|Demo illustration|Sample data/i.test(home));
check("home: header shows affiliate disclosure, not demo banner", (await p.locator("header").innerText()).includes("affiliate links"));
check("home: shelves filled from imported products", (await p.locator("main article").count()) >= 3);
check("home: price-drop section hidden (no 30-day history, nothing invented)", !home.includes("Price drops we can back up"));
check("home: short and focused (search, benefits, categories, how it works, products), no demo deals", home.includes("Explore Products") && home.includes("Browse by category") && home.includes("How PriceViva works") && !home.includes("Your shopping tools") && !home.includes("(demo)"));
await p.screenshot({ path: `${shots}/live_home.png`, fullPage: true });

await p.goto(base + "/departments/electronics?sub=headphones", { waitUntil: "networkidle" });
check("department page lists imported headphones", (await p.locator("main article").count()) >= 2);
await p.goto(base + "/departments/fashion", { waitUntil: "networkidle" });
check("empty department explains no data", (await text()).includes("No connected retailer feed has products"));

await p.goto(base + "/search?q=fixture%20hedphones", { waitUntil: "networkidle" });
check("search (typo) returns imported products", (await p.locator("main article").count()) >= 2);

await p.goto(base + "/product/" + slug, { waitUntil: "networkidle" });
const prod = await text();
check("product: verified cheapest from Beta at GBP 94.50", /Lowest verified delivered total to United Kingdom[\s\S]*GBP\s?94\.50[\s\S]*TEST Retailer Beta/.test(prod));
const links = await p.locator('a[href^="/go/"]').evaluateAll((as) => as.map((a) => [a.getAttribute("href"), a.getAttribute("rel"), a.getAttribute("target")]));
check("every offer has a Visit store link via /go/ (sponsored, new tab)", links.length >= 2 && links.every(([h, rel, t]) => /^\/go\/[0-9a-f-]{36}$/.test(h) && rel.includes("sponsored") && t === "_blank"));
const thumbs = p.getByRole("button", { name: /Show photo \d of 3/ });
check("gallery shows 3 thumbnails", (await thumbs.count()) === 3);
await thumbs.nth(1).click();
check("clicking a thumbnail switches the main photo", (await p.locator("figure img").getAttribute("alt"))?.includes("photo 2 of 3"));
check("withdrawn white variant (offer deactivated) is not linked", !prod.includes("Other variants"));
await p.getByRole("button", { name: /View details and shopping options for TEST Retailer Alpha/ }).click();
const detail = await text();
check("offer details show source & timestamp & RRP note", detail.includes("Awin product feed") && detail.includes("Last confirmed in the retailer feed") && detail.includes("not a verified discount"));
await p.screenshot({ path: `${shots}/live_product.png`, fullPage: true });

await openPrefs();
await p.locator("#dest-desktop").selectOption("SE");
check("other destination: no cheapest claimed (no delivery data)", (await text()).includes("No offer has a complete, current delivered total to Sweden"));
await openPrefs();
await p.locator("#dest-desktop").selectOption("GB");
await p.keyboard.press("Escape");

await p.getByRole("button", { name: /^Save Fixturebrand/ }).first().click();
await p.getByRole("button", { name: "Add to comparison", exact: true }).first().click();
await p.goto(base + "/saved", { waitUntil: "networkidle" });
await p.locator("main article").first().waitFor({ timeout: 5000 });
check("saved items load from live catalogue by UUID", (await p.locator("main article").count()) === 1);
await p.goto(base + "/compare", { waitUntil: "networkidle" });
await p.getByText("Comparing 1 of max 3").waitFor({ timeout: 5000 });
check("compare loads live product", true);

await p.goto(base + "/deals", { waitUntil: "networkidle" });
const deals = await text();
check("deals: no fictional stores in live mode, honest empty state for London", /No verified store offers near London yet/.test(deals) && !/Demonstration stores|Show demonstration stores|Fictional store/.test(deals));

await p.goto(base + "/about", { waitUntil: "networkidle" });
check("about: live data source + affiliate disclosure", (await text()).includes("Where our product data comes from") && (await text()).includes("affiliate links"));

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await b.close();
