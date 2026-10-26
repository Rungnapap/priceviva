// Lightweight accessibility audit of the main pages (no axe-core available offline):
// one <h1>, no skipped heading levels, images have alt, buttons/links/inputs have accessible names, no positive tabindex.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const base = process.env.BASE ?? "http://localhost:4321";
const routes = ["/", "/search?q=headphones", "/compare", "/deals", "/saved", "/alerts", "/price-history", "/account", "/login", "/signup", "/forgot-password", "/reset-password", "/about", "/privacy", "/contact", "/shop/electronics", "/departments", "/stores"];
const b = await chromium.launch();
let problems = 0;
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const r of routes) {
    await p.goto(base + r); await p.locator("h1").first().waitFor({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(300);
    const issues = await p.evaluate(() => {
      const out = [];
      const vis = (el) => { const s = getComputedStyle(el); const rect = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && (rect.width > 0 || rect.height > 0); };
      const h1 = [...document.querySelectorAll("h1")].filter(vis);
      if (h1.length !== 1) out.push(`h1 count ${h1.length}`);
      let last = 0;
      for (const h of [...document.querySelectorAll("main h1, main h2, main h3, main h4")].filter(vis)) {
        const lvl = Number(h.tagName[1]);
        if (last && lvl > last + 1) out.push(`heading jump h${last}→h${lvl}: "${h.textContent.trim().slice(0, 40)}"`);
        last = lvl;
      }
      for (const img of document.querySelectorAll("img")) if (!img.hasAttribute("alt")) out.push(`img without alt ${img.src.slice(-40)}`);
      const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || el.textContent || el.getAttribute("title") || "").trim();
      for (const el of [...document.querySelectorAll("button, a[href]")].filter(vis)) if (!name(el) && !el.querySelector("img[alt]:not([alt=''])")) out.push(`${el.tagName.toLowerCase()} without name: ${el.outerHTML.slice(0, 80)}`);
      for (const el of [...document.querySelectorAll("input, select, textarea")].filter((e) => e.type !== "hidden")) {
        const labelled = el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
        if (!labelled) out.push(`unlabelled ${el.tagName.toLowerCase()} ${el.name || el.id}`);
      }
      for (const el of document.querySelectorAll("[tabindex]")) if (Number(el.getAttribute("tabindex")) > 0) out.push("positive tabindex");
      if (!document.documentElement.lang) out.push("no html lang");
      return out;
    });
    if (issues.length) { problems += issues.length; console.log(`${w}px ${r}:`, [...new Set(issues)].slice(0, 6).join(" | ")); }
  }
  await p.close();
}
console.log(problems ? `\n${problems} issue(s)` : "A11Y: no issues found");
await b.close();
process.exit(problems ? 1 : 0);
