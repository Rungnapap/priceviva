// Test-mode (DummyJSON sample data) checks for the sandbox preview: PREVIEW_MODE=sample build served on :4322.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import fs from "node:fs";
const base = process.env.BASE ?? "http://localhost:4322"; const shots = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
// The sandbox can't reach dummyjson.com, so the API is answered with the synthetic test fixture (22 rows).
const fixture = fs.readFileSync(new URL("../../tests/fixtures/dummyjson-products.json", import.meta.url), "utf8");
await p.route("https://dummyjson.com/products**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: fixture, headers: { "access-control-allow-origin": "*" } }));
const imageRequests = [];
await p.route("https://cdn.dummyjson.com/**", (r) => { imageRequests.push(r.request().url()); return r.abort(); });
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };

await p.goto(base + "/", { waitUntil: "networkidle" });
const home = await p.locator("body").innerText();
check("test-mode banner visible", /Test mode/i.test(home));
check("hero headline and brand tagline", home.includes("Compare Prices.") && home.includes("Find Better Value.") && /Discover More\. Compare Better\./i.test(home));
check("hero search asks what to compare", (await p.locator("main input[type=search]").first().getAttribute("placeholder")) === "What product would you like to compare?");
check("homepage explains how it works and shows the three benefits", /How PriceViva works/.test(home) && /Compare store prices/.test(home) && /Check total costs/.test(home) && /Shop across countries/.test(home) && /Make informed choices/.test(home));
check("featured grid labelled sample data", /Sample data/i.test(home) && /Explore Products/.test(home));
check("cards request the small thumbnail, not the full-size photo", imageRequests.length > 0 && imageRequests.every((u) => u.includes("thumbnail")));
check("failed photos fall back to a labelled placeholder, never a broken image", (await p.locator('main [aria-label^="No photo available"]').count()) > 0 && (await p.locator("main article img").count()) === 0);
await p.getByRole("button", { name: "Search by photo or barcode" }).first().click();
check("camera button opens the photo/barcode dialog (photo stays on the device)", /never uploaded/.test(await p.locator("dialog").innerText()));
await p.keyboard.press("Escape");
check("no 'Verified' status on sample totals", !/\bVerified\b/.test(await p.locator("main").innerText()));
check("no 'lowest price' / 'trusted retailer' claims", !/lowest price|trusted retailer|verified best deal/i.test(home));
check("no PriceAtlas branding visible", !/PriceAtlas/.test(home));
await p.screenshot({ path: `${shots}/sample_home.png`, fullPage: true });

await p.goto(base + "/shop/electronics", { waitUntil: "networkidle" });
check("electronics group page has products", (await p.locator("main article").count()) > 0);
await p.locator("main article a").first().click();
await p.waitForTimeout(400);
const prod = await p.locator("main").innerText();
check("product page labelled sample", /Sample product · DummyJSON test data/i.test(prod));
if (!/Sample product/i.test(prod)) console.log("URL", p.url(), prod.slice(0, 400));
await p.getByRole("button", { name: /Price alert/ }).click();
check("price alert opens a target-price form that promises in-site notifications only", /Tell me when it drops/.test(await p.locator("main").innerText()) && /no email or push notifications/.test(await p.locator("main").innerText()));
await p.getByRole("button", { name: "Cancel" }).click();
await p.screenshot({ path: `${shots}/sample_product.png`, fullPage: true });

await p.goto(base + "/stores", { waitUntil: "networkidle" });
const stores = await p.locator("main").innerText();
check("stores page: sample source + no trusted label", /Test mode/.test(stores) && /do not rate stores as “trusted”/.test(stores));
for (const s of (await p.locator("main li p.font-semibold").allInnerTexts())) check(`store "${s}" is labelled Sample`, /sample/i.test(s));

// Nominatim is mocked with synthetic answers (the sandbox has no internet); the app code path is the real one.
const NOMINATIM = {
  kalmar: [{ display_name: "Kalmar, Kalmar kommun, Kalmar län, Sverige", name: "Kalmar", addresstype: "city", lat: "56.6634", lon: "16.3568", address: { city: "Kalmar", country_code: "se" } }],
  berlin: [{ display_name: "Berlin, Deutschland", name: "Berlin", addresstype: "city", lat: "52.52", lon: "13.405", address: { city: "Berlin", country_code: "de" } }],
};
let nominatimDown = false;
await p.route("https://nominatim.openstreetmap.org/**", (r) => {
  if (nominatimDown) return r.abort();
  const q = new URL(r.request().url()).searchParams.get("q")?.toLowerCase() ?? "";
  return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(NOMINATIM[q] ?? []), headers: { "access-control-allow-origin": "*" } });
});
await p.route("https://tile.openstreetmap.org/**", (r) => r.abort());
const findArea = async (text) => {
  await p.getByPlaceholder(/Town, municipality or postcode/).first().fill(text);
  await p.getByRole("button", { name: "Find area" }).first().click();
  await p.waitForTimeout(400);
};

await p.goto(base + "/deals", { waitUntil: "networkidle" });
await findArea("Kalmar");
await p.getByRole("button", { name: /Kalmar.*Choose/ }).first().click();
await p.waitForTimeout(400);
const kal = await p.locator("main").innerText();
check("Kalmar: chosen exactly (never Malmö) and shown in the radar", /Shopping area:\s*Kalmar/.test(kal) && !/Malmö/.test(kal.split("Show demonstration stores")[0]));
check("Kalmar: header shows Kalmar · 25 km", /Kalmar · 25 km/.test(await p.locator("header").first().innerText()));
check("Kalmar: honest empty state (no real merchant data, nothing invented)", /No verified store offers near Kalmar yet/.test(kal) && (await p.locator("main article").count()) === 0);
await p.getByLabel(/Show demonstration stores/).check();
await p.waitForTimeout(200);
check("Kalmar + demo switch: demo section says no demo stores here (suggests real demo cities)", /no demo stores within 25 km of Kalmar/i.test(await p.locator("main").innerText()));
await p.reload({ waitUntil: "networkidle" });
check("Kalmar and radius survive a refresh", /Kalmar · 25 km/.test(await p.locator("header").first().innerText()));

await findArea("Berlin");
await p.getByRole("button", { name: /Berlin.*Choose/ }).first().click();
await p.waitForTimeout(300);
await p.getByLabel(/Show demonstration stores/).check();
await p.fill("#local-q", "running shoes near me");
await p.waitForTimeout(200);
const shoeCards = await p.locator("main article").allInnerTexts();
check("radar: product search finds only the matching demo offer", shoeCards.length >= 1 && shoeCards.every((t) => /running shoes/i.test(t)));
check("radar: demo cards never show a distance", shoeCards.every((t) => !/km away/.test(t)));
await p.fill("#local-q", "garden hose");
await p.waitForTimeout(200);
check("radar: no match shows an honest empty state, not other offers", (await p.locator("main article").count()) === 0 && /No store offers for “garden hose”/.test(await p.locator("main").innerText()));
nominatimDown = true;
await findArea("10115");
check("radar: lookup failure says so (no invented place)", /could not be reached|unavailable/i.test(await p.locator("main").innerText()));
nominatimDown = false;
await p.goto(base + "/alerts", { waitUntil: "networkidle" });
check("alerts page is honest about e-mail alerts (verified prices only, none in test mode)", /E-mail alerts:\s*for logged-in accounts, sent only when a verified retailer offer \(not test data\)[\s\S]*In test mode no e-mails are sent/i.test(await p.locator("main").innerText()));

await p.setViewportSize({ width: 390, height: 844 });
for (const r of ["/", "/compare", "/deals", "/shop/fashion"]) {
  await p.goto(base + r, { waitUntil: "networkidle" });
  check(`no horizontal overflow on mobile ${r}`, (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
}
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.screenshot({ path: `${shots}/sample_home_mobile.png`, fullPage: true });

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await b.close();
