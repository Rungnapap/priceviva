// Interaction checks for Phase 1 acceptance flows (sandbox preview).
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const base = "http://localhost:4321"; const shots = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 57.70, longitude: 11.95 } });
const p = await ctx.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };
const header = () => p.locator("header").first().innerText();
const DEMO_GTIN = "2001234500012", DEMO_NAME = "Aria ANC Wireless Headphones";
const openPrefs = async () => { if (!(await p.locator("#prefs-menu").isVisible().catch(() => false))) await p.getByRole("button", { name: /Delivery, currency and language/ }).click(); };

await p.goto(base + "/", { waitUntil: "networkidle" });
// 1 guest selects city & radius, saved
await p.getByRole("button", { name: /Choose shopping area/ }).first().click();
await p.getByRole("dialog").getByText("Gothenburg", { exact: true }).click();
await p.getByRole("dialog").getByText("25 km", { exact: true }).click();
await p.getByRole("button", { name: "Set as my area" }).click();
check("header shows saved area", (await header()).includes("Gothenburg · 25 km"));
await p.reload({ waitUntil: "networkidle" });
check("saved area persists after reload", (await header()).includes("Gothenburg · 25 km"));

// 2 temporary area does not overwrite saved
await p.getByRole("button", { name: /Shopping area: Gothenburg/ }).first().click();
await p.getByRole("dialog").getByText("Berlin", { exact: true }).click();
await p.getByRole("button", { name: "Browse here for now" }).click();
check("header shows temporary Berlin", /Berlin · 25 km\s*temporary/.test(await header()));
await p.goto(base + "/account", { waitUntil: "networkidle" });
const acct = await p.locator("main").innerText();
check("account: saved area still Gothenburg", acct.includes("Gothenburg, 25 km"));
check("account: temporary area Berlin", acct.includes("Berlin, 25 km"));
await p.goto(base + "/deals", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Back to saved area" }).click();
check("back to saved area restores Gothenburg", (await header()).includes("Gothenburg · 25 km") && !(await header()).includes("temporary"));

// 3 delivery destination separate
await openPrefs();
await p.locator("#dest-desktop").selectOption("GB");
check("destination change keeps shopping area", (await header()).includes("Gothenburg · 25 km"));
await p.goto(base + "/product/kestrel-audio-aria-anc-wireless-headphones-midnight-blue", { waitUntil: "networkidle" });
const prod = await p.locator("main").innerText();
check("product page priced for United Kingdom", /Lowest (verified|complete) delivered total to United Kingdom/.test(prod));
check("Nordhem (no UK delivery) shown unavailable", /No delivery to this destination/.test(prod));
await openPrefs();
await p.locator("#cur-desktop").selectOption("GBP");
await p.keyboard.press("Escape");
check("currency switch to GBP", (await p.locator("main").innerText()).toLowerCase().includes("delivered (gbp)"));
await p.getByRole("button", { name: /View details and shopping options for Blauwerk/ }).click();
check("breakdown shows seller VAT removed (no double count)", (await p.locator("main").innerText()).includes("Seller VAT removed for export"));
await p.screenshot({ path: `${shots}/flow_product_gb.png`, fullPage: false });

// 4 search autocomplete via keyboard
const sb = p.getByRole("combobox").first();
await sb.fill("aria");
await p.getByRole("listbox").getByRole("option").first().waitFor({ timeout: 5000 });
check("autocomplete lists suggestions", (await p.getByRole("listbox").getByRole("option").count()) > 0);
await sb.press("ArrowDown"); await sb.press("Enter");
await p.waitForTimeout(300);
check("Enter on suggestion opens product", p.url().includes("/product/"));
await sb.fill("hedphones"); await sb.press("Enter"); await p.waitForTimeout(300);
check("typo search returns results", (await p.locator("main article").count()) >= 2);

// 5 compare rules
await p.goto(base + "/departments/electronics?sub=headphones", { waitUntil: "networkidle" });
const cmp = p.getByRole("button", { name: /^Add to comparison/ });
await cmp.nth(0).click(); await cmp.nth(0).click();
await p.goto(base + "/departments/outdoors", { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^Add to comparison/ }).first().click();
await p.waitForTimeout(100);
check("cross-category compare blocked with toast", (await p.getByRole("status").allInnerTexts()).join(" ").includes("same type"));
await p.goto(base + "/compare", { waitUntil: "networkidle" });
check("compare page shows 2 products", (await p.locator("main").innerText()).includes("Comparing 2 of max 3"));

// 6 mega-menu keyboard
const megaBtn = p.getByRole("button", { name: "All Categories" });
await megaBtn.click();
check("mega menu opens", await p.locator("#mega-menu").isVisible());
await p.keyboard.press("Escape");
check("Escape closes mega menu & returns focus", !(await p.locator("#mega-menu").count()) && (await megaBtn.evaluate((e) => e === document.activeElement)));

// 7 use my location (permission granted in this test only)
await ctx.grantPermissions(["geolocation"]);
await p.getByRole("button", { name: /Shopping area/ }).first().click();
await p.getByRole("button", { name: "Use my location" }).click();
await p.waitForTimeout(400);
const dlg = await p.getByRole("dialog").innerText();
check("geolocation is only a suggestion: shown as 'Detected', nothing changed until confirmed", /Detected: /.test(dlg) && /Selected:\s*Gothenburg/.test(dlg));
await p.keyboard.press("Escape");

// 8 deals: no expired promos, radius filter
await p.goto(base + "/deals", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "50 km", exact: true }).click();
let deals = await p.locator("main").innerText();
check("no expired promotion shown", !deals.includes("EXPIRED example"));
await p.getByRole("button", { name: "5 km", exact: true }).click();
deals = await p.locator("main").innerText();
check("5 km excludes 33 km outskirts store", !deals.includes("Outskirts"));
await p.screenshot({ path: `${shots}/flow_deals.png`, fullPage: true });

// 9 dark mode
await openPrefs();
await p.getByRole("button", { name: /Colour theme/ }).click(); // system -> light
await p.getByRole("button", { name: /Colour theme/ }).click(); // light -> dark
check("dark mode applies", await p.evaluate(() => document.documentElement.classList.contains("dark")));
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.screenshot({ path: `${shots}/flow_dark_home.png` });

// 9b barcode = exact identification (demo GTINs use the in-store 02… range)
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Search by photo or barcode" }).first().click();
await p.locator("dialog").getByRole("tab", { name: "Barcode" }).click();
await p.locator("#bc").fill(DEMO_GTIN);
await p.locator("dialog").getByRole("button", { name: "Look up" }).click();
await p.locator("dialog").getByText("Exact product match (barcode)").first().waitFor({ timeout: 5000 }).catch(() => {});
check("barcode lookup gives an exact product match", (await p.locator("dialog").innerText()).includes(DEMO_NAME));
await p.locator("#bc").fill("1234567890123");
await p.locator("dialog").getByRole("button", { name: "Look up" }).click();
await p.waitForTimeout(300);
check("invalid barcode (check digit) is rejected, not guessed", /not a valid barcode/.test(await p.locator("dialog").innerText()));
await p.keyboard.press("Escape");

// 10 delete local data
await p.goto(base + "/account", { waitUntil: "networkidle" });
p.once("dialog", (d) => d.accept());
await p.getByRole("button", { name: "Delete my local data" }).click();
check("delete clears saved area", (await p.locator("main").innerText()).includes("Saved shopping area\tNot set") || (await p.locator("main").innerText()).match(/Saved shopping area\s+Not set/) !== null);

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await b.close();
