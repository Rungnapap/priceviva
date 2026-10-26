// Accounts end to end in the sample-mode preview (:4322) with the local Supabase stand-in (:54400):
// sign up → confirm by e-mail link → saved products and alerts in the account → log out → log in → password reset,
// second-user isolation, guest-data merge, shared-computer privacy, mobile layout, and the no-Supabase fallback (:4321).
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
const base = process.env.BASE ?? "http://localhost:4322";
const demo = "http://localhost:4321";
const mock = "http://127.0.0.1:54400";
const shots = process.argv[2] ?? "/tmp/claude-0/ss";
const b = await chromium.launch();
let pass = 0, fail = 0;
const check = (n, c) => { c ? pass++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const errors = [];
const sql = (q) => execFileSync("psql", ["-h", "/tmp", "-p", "54329", "-U", "postgres", "-d", "pa_it", "-qAt", "-c", q]).toString().trim();
const mail = async (to, type) => (await (await fetch(`${mock}/__mail?to=${encodeURIComponent(to)}`)).json()).filter((m) => m.type === type).at(-1);
const run = Date.now().toString(36);
const U1 = { email: `anna-${run}@example.invalid`, password: "Testing-pass-1" };
const U2 = { email: `ben-${run}@example.invalid`, password: "Another-pass-2" };
const uid = (email) => sql(`select id from auth.users where email = '${email}'`);
const count = (table, email) => Number(sql(`select count(*) from public.${table} where user_id = '${uid(email)}'`));

async function newPage(width = 1280) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
const main = (p) => p.locator("main").innerText();
async function signupAndConfirm(p, u) {
  await p.goto(`${base}/signup`, { waitUntil: "networkidle" });
  await p.getByLabel("E-mail address").fill(u.email);
  await p.getByLabel("Password", { exact: true }).fill(u.password);
  await p.getByLabel("Confirm password").fill(u.password);
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByText("Check your e-mail").waitFor({ timeout: 8000 });
  await p.goto((await mail(u.email, "signup")).link);
  await p.waitForURL(/\/account\?welcome=1/, { timeout: 8000 });
  await p.getByTestId("account-email").waitFor({ timeout: 8000 });
}
async function login(p, u, next) {
  await p.goto(`${base}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, { waitUntil: "networkidle" });
  await p.getByLabel("E-mail address").fill(u.email);
  await p.getByLabel("Password", { exact: true }).fill(u.password);
  await p.getByRole("button", { name: "Log in" }).click();
}

// 1. Guest header and sign-up validation
let p = await newPage();
await p.goto(base + "/", { waitUntil: "networkidle" });
check("guest: header shows a clear Log in button", await p.locator("header").getByRole("link", { name: "Log in" }).first().isVisible());
await p.goto(`${base}/signup`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Create account" }).click();
check("sign-up: empty form shows field errors", /Enter your e-mail address\.[\s\S]*Enter your password\./.test(await main(p)));
await p.getByLabel("E-mail address").fill("not-an-email");
await p.getByLabel("Password", { exact: true }).fill("short");
await p.getByLabel("Confirm password").fill("different");
await p.getByRole("button", { name: "Create account" }).click();
const v = await main(p);
check("sign-up: invalid e-mail, short password messages", v.includes("Enter a valid e-mail address") && v.includes("Use at least 8 characters"));
check("sign-up: invalid fields are marked for screen readers", (await p.locator('input[aria-invalid="true"]').count()) >= 2);
await p.getByLabel("E-mail address").fill(U1.email);
await p.getByLabel("Password", { exact: true }).fill("onlyletters");
await p.getByRole("button", { name: "Create account" }).click();
check("sign-up: password needs a letter and a number", (await main(p)).includes("Use at least one letter and one number"));
await p.getByLabel("Password", { exact: true }).fill(U1.password);
await p.getByLabel("Confirm password").fill("Testing-pass-2");
await p.getByRole("button", { name: "Create account" }).click();
check("sign-up: confirm password must match", (await main(p)).includes("The passwords don't match"));
await p.getByRole("button", { name: "Show password" }).first().click();
check("password can be shown", (await p.getByLabel("Password", { exact: true }).getAttribute("type")) === "text");
await p.screenshot({ path: `${shots}/acct_signup_errors.png`, fullPage: true });

// 2. Sign up → login before confirming → e-mail link
await p.getByLabel("Confirm password").fill(U1.password);
await p.getByRole("button", { name: "Create account" }).click();
await p.getByText("Check your e-mail").waitFor({ timeout: 8000 });
check("sign-up: 'check your e-mail' without saying whether the address is new", (await main(p)).includes(`If ${U1.email} can be used for a new account`));
await p.screenshot({ path: `${shots}/acct_check_email.png`, fullPage: true });
await login(p, U1);
await p.getByText("Please confirm your e-mail address first").waitFor({ timeout: 8000 });
check("login before confirming: clear message", true);
await p.getByRole("button", { name: "Send the confirmation e-mail again" }).click();
await p.getByText("a new e-mail is on its way").waitFor({ timeout: 8000 });
check("resend confirmation works", true);
await p.goto((await mail(U1.email, "signup")).link);
await p.waitForURL(/\/account\?welcome=1/, { timeout: 8000 });
await p.getByTestId("account-email").waitFor({ timeout: 8000 });
const acct = await main(p);
check("e-mail link confirms and signs in; dashboard shows the e-mail", acct.includes(U1.email) && acct.includes("Welcome! Your e-mail address is confirmed"));
check("header shows the signed-in account", (await p.locator("header").getByRole("link", { name: new RegExp(`Your account \\(${U1.email.replace(/[.]/g, "\\.")}\\)`) }).count()) === 1);
check("no session token is readable by page scripts' cookies (httpOnly in the real app)", !(await p.evaluate(() => document.cookie)).includes("pv_at"));

// 3. Save a product and set an alert → stored in the account
await p.goto(`${base}/search?q=headphones`, { waitUntil: "networkidle" });
await p.locator("main article").first().getByRole("button", { name: /^Save / }).click();
await p.waitForTimeout(1500);
check("saved product is stored in the account", count("user_saved_products", U1.email) === 1);
const slug = (await p.locator("main article h3 a").first().getAttribute("href")).split("/").pop();
await p.goto(`${base}/product/${slug}`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Set price alert|price alert/i }).first().click();
await p.locator('input[id^="target-"]').fill("90");
await p.getByRole("button", { name: /^Set alert$|^Set$/ }).first().click();
await p.waitForTimeout(1500);
check("price alert is stored in the account", count("price_alerts", U1.email) === 1);
await p.goto(`${base}/account`, { waitUntil: "networkidle" });
await p.getByText("Saved products (1)").waitFor({ timeout: 8000 });
const dash = await main(p);
check("dashboard lists saved products and the alert", dash.includes("Saved products (1)") && /Your alerts|alerts \(1\)/i.test(dash));
check("dashboard: test mode says e-mail alerts are off", dash.includes("E-mail alerts are off in test mode"));
await p.screenshot({ path: `${shots}/acct_dashboard.png`, fullPage: true });
// Edit, pause, e-mail off, delete — each saved to the account
await p.getByRole("button", { name: "Edit target" }).first().click();
await p.locator('input[id^="edit-"]').fill("80");
await p.getByRole("button", { name: "Save", exact: true }).first().click();
await p.waitForTimeout(1500);
check("edit target saved in the account", sql(`select target_minor from public.price_alerts where user_id = '${uid(U1.email)}'`) === "8000");
await p.getByRole("button", { name: "Pause" }).first().click();
await p.waitForTimeout(1500);
check("pause saved in the account", sql(`select paused from public.price_alerts where user_id = '${uid(U1.email)}'`) === "t");
await p.getByRole("button", { name: "Resume" }).first().click();
await p.getByLabel("E-mail me").first().uncheck();
await p.waitForTimeout(1500);
check("resume and e-mail off saved", sql(`select paused::text || email_enabled::text from public.price_alerts where user_id = '${uid(U1.email)}'`) === "falsefalse");
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(800);
check("after reload the alert still shows (from the account)", (await main(p)).includes("Resume") === false && (await p.getByRole("button", { name: "Pause" }).count()) === 1);
await p.getByRole("button", { name: "Delete" }).first().click();
await p.waitForTimeout(1500);
check("delete alert removes it from the account", count("price_alerts", U1.email) === 0);

// 4. Log out → guest, browser cleared; log in → data back
await p.getByRole("button", { name: "Log out" }).first().click();
await p.waitForURL(/\/login\?notice=signed_out/, { timeout: 8000 });
check("log out: message and header Log in again", (await main(p)).includes("You are logged out") && await p.locator("header").getByRole("link", { name: "Log in" }).first().isVisible());
check("log out: account lists removed from this browser", await p.evaluate(() => JSON.parse(localStorage.getItem("priceatlas:v1") || "{}").saved?.length === 0));
await login(p, { ...U1, password: "Wrong-pass-9" });
await p.getByText("The e-mail address or password is not correct").waitFor({ timeout: 8000 });
check("wrong password: clear, non-revealing message", true);
await p.screenshot({ path: `${shots}/acct_login_error.png`, fullPage: true });
await login(p, U1, "/saved");
await p.waitForURL(/\/saved$/, { timeout: 8000 });
await p.waitForTimeout(1200);
check("login redirects to the page asked for (next=)", p.url().endsWith("/saved"));
check("login brings the saved product back", (await p.locator("main article").count()) === 1);

// 5. Second user can't see the first user's data; guest data merges on login; shared computer
const p2 = await newPage();
await signupAndConfirm(p2, U2);
check("second user: own empty account", (await main(p2)).includes("Saved products (0)"));
await p2.getByRole("button", { name: "Log out" }).first().click();
await p2.waitForURL(/\/login/, { timeout: 8000 });
await p2.goto(`${base}/search?q=headphones`, { waitUntil: "networkidle" });
await p2.locator("main article").nth(1).getByRole("button", { name: /^Save / }).click().catch(() => p2.locator("main article").first().getByRole("button", { name: /^Save / }).click());
await login(p2, U2);
await p2.waitForURL(/\/account/, { timeout: 8000 });
await p2.waitForTimeout(1500);
check("guest's saved product is added to the account on login", count("user_saved_products", U2.email) === 1);
await p2.getByRole("button", { name: "Log out" }).first().click();
await p2.waitForURL(/\/login/, { timeout: 8000 });
await login(p2, U1);
await p2.waitForURL(/\/account/, { timeout: 8000 });
await p2.waitForTimeout(1500);
check("shared computer: user 2's data is not copied into user 1's account", count("user_saved_products", U1.email) === 1 && count("user_saved_products", U2.email) === 1);

// 6. Forgot password → e-mail link → new password
const p3 = await newPage();
await p3.goto(`${base}/forgot-password`, { waitUntil: "networkidle" });
await p3.getByLabel("E-mail address").fill(U1.email);
await p3.getByRole("button", { name: "Send reset link" }).click();
await p3.getByText(`If ${U1.email} has a PriceViva account`).waitFor({ timeout: 8000 });
check("forgot password: same answer for any address", true);
await p3.goto((await mail(U1.email, "recovery")).link);
await p3.waitForURL(/\/reset-password/, { timeout: 8000 });
await p3.getByLabel("New password").waitFor({ timeout: 8000 });
await p3.getByLabel("New password").fill("Brand-new-pass-3");
await p3.getByLabel("Confirm password").fill("Brand-new-pass-4");
await p3.getByRole("button", { name: "Save new password" }).click();
check("reset: mismatch caught", (await main(p3)).includes("The passwords don't match"));
await p3.getByLabel("Confirm password").fill("Brand-new-pass-3");
await p3.getByRole("button", { name: "Save new password" }).click();
await p3.getByText("Your password has been changed").waitFor({ timeout: 8000 });
check("reset: new password saved", true);
const p4 = await newPage();
await login(p4, { ...U1, password: "Brand-new-pass-3" });
await p4.waitForURL(/\/account/, { timeout: 8000 });
check("login with the new password works", true);
await p4.goto(`${base}/reset-password`, { waitUntil: "networkidle" });
const p5 = await newPage();
await p5.goto(`${base}/reset-password`, { waitUntil: "networkidle" });
await p5.waitForTimeout(800);
check("reset page without a reset link explains and offers a new link", (await main(p5)).includes("Request a new link"));

// 7. Mobile layout
const m = await newPage(390);
for (const path of ["/login", "/signup", "/forgot-password", "/account"]) {
  await m.goto(base + path, { waitUntil: "networkidle" });
  const o = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (o > 1) check(`mobile ${path}: no horizontal overflow (${o}px)`, false);
}
check("mobile: account pages fit the screen", true);
await m.goto(base + "/login", { waitUntil: "networkidle" });
await m.screenshot({ path: `${shots}/acct_login_mobile.png`, fullPage: true });
await m.getByRole("button", { name: "Open menu" }).click().catch(async () => m.getByLabel(/menu/i).first().click());
check("mobile menu offers Log in and Sign up", await m.locator("#mobile-nav").getByRole("link", { name: "Sign up" }).isVisible());

// 8. Without Supabase settings (demo preview): honest message, site works as before
const d = await newPage();
await d.goto(`${demo}/login`, { waitUntil: "networkidle" });
await d.waitForTimeout(600);
check("no Supabase: login page says accounts are not switched on", (await main(d)).includes("Accounts are not switched on yet"));
await d.goto(`${demo}/account`, { waitUntil: "networkidle" });
await d.waitForTimeout(600);
check("no Supabase: account page keeps the browser-only tools", (await main(d)).includes("Export"));

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.length ? errors.slice(0, 5).join(" | ") : "none"}`);
await b.close();
process.exit(fail ? 1 : 0);
