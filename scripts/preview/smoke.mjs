// Visits every page at desktop & mobile widths, records console errors, saves screenshots.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const base = process.env.BASE ?? "http://localhost:4321";
const shots = process.argv[2];
const routes = ["/", "/departments", "/departments/electronics", "/departments/groceries", "/departments/fashion", "/search?q=hedphones",
  "/search?q=zzqxwv", "/search?q=phone&sort=price_asc", "/product/kestrel-audio-aria-anc-wireless-headphones-midnight-blue",
  "/product/pantrygold-organic-coffee-beans-medium-roast-1-kg-1-kg", "/compare", "/deals", "/saved", "/account", "/login", "/signup", "/forgot-password", "/reset-password", "/unsubscribe", "/about", "/nope", "/product/bogus",
  "/shop/electronics", "/shop/pets", "/shop/fashion", "/alerts", "/price-history", "/stores", "/privacy", "/shop/travel-luggage", "/shop/kitchen-appliances", "/shop/garden-outdoor", "/account", "/contact", "/shop/travel-luggage"];
const overflow = [];
const browser = await chromium.launch();
const errors = [];
for (const [name, vp] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} ${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name} ${page.url()}: PAGEERROR ${e.message}`));
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle" });
    await page.waitForTimeout(150);
    const h1 = await page.locator("h1").first().textContent().catch(() => "(no h1)");
    console.log(name, r, "→", h1?.trim().slice(0, 70));
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (ov > 0) overflow.push(`${name} ${r}: ${ov}px`);
    const file = `${shots}/${name}${r.replace(/[^a-z0-9]+/gi, "_")}.png`;
    await page.screenshot({ path: file, fullPage: r === "/" || r.startsWith("/product/kestrel") || r === "/deals" });
  }
  await page.close();
}
await browser.close();
console.log("HORIZONTAL OVERFLOW:", overflow.length ? overflow.join(", ") : "none");
console.log("ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
