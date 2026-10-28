/** Normalisation helpers shared by all importers (Awin now; eBay/Amazon/direct later). */
import type { Condition } from "@/lib/types";

/** Validate a GTIN-8/12/13/14 (EAN/UPC) check digit and return it zero-padded to 14 digits, or null. */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return null;
  if (/^0+$/.test(digits)) return null;
  const g = digits.padStart(14, "0");
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g[i]) * (i % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(g[13]) ? g : null;
}

/** Explicit pack counts only; missing counts are unknown, never assumed to be one.
 * Invalid or contradictory evidence must not enter a cross-retailer identity.
 * Dimensions, volume, stock quantity and an unqualified number are not pack counts.
 */
export function normalizePackQuantity(raw: readonly (string | null | undefined)[], title: string): { quantity: number | null; uncertain: boolean } {
  const counts = new Set<number>();
  let uncertain = false;
  const add = (value: string) => {
    if (!/^[1-9]\d{0,5}$/.test(value) || Number(value) > 100_000) uncertain = true;
    else counts.add(Number(value));
  };
  for (const value of raw) if (value?.trim()) add(value.trim());
  for (const match of title.matchAll(/\b(\d{1,6})[ -]?(?:pack|pk)\b|\bpack of\s+(\d{1,6})\b/gi)) add(match[1] ?? match[2]!);
  if (counts.size > 1) uncertain = true;
  return { quantity: uncertain ? null : [...counts][0] ?? null, uncertain };
}

/**
 * Parse a price like "1 299,00", "1,299.00", "15.00 GBP", "£15" into minor units.
 * Returns null when the value is empty or not a clean number — never guesses.
 */
export function parsePriceMinor(raw: string | null | undefined): { minor: number; currency: string | null } | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  let currency: string | null = null;
  const code = s.match(/\b([A-Z]{3})\b/);
  if (code) {
    currency = code[1]!;
    s = s.replace(code[0], "");
  }
  const sym: Record<string, string> = { "£": "GBP", "€": "EUR", kr: "SEK" };
  for (const [k, v] of Object.entries(sym)) if (s.includes(k)) { currency ??= v; s = s.replace(k, ""); }
  s = s.replace(/[\s ']/g, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    // comma is decimal separator if followed by 1–2 digits, else thousands
    normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    normalized = s.replace(/,/g, "");
  }
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return { minor: Math.round(value * 100), currency };
}

export function normalizeCondition(raw: string | null | undefined): Condition | "invalid" {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || s === "new" || s === "brand new") return "new";
  if (/refurb|renewed|reconditioned/.test(s)) return "refurbished";
  if (/open.?box|opened|ex.?display|b.?stock/.test(s)) return "open_box";
  if (/used|pre.?owned|second.?hand/.test(s)) return "used";
  return "invalid";
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export function normalizeStock(inStock?: string, status?: string, quantity?: string): StockStatus {
  const s = `${status ?? ""}`.trim().toLowerCase();
  if (/out.?of.?stock|out_ouf_stock|sold.?out|unavailable|discontinued/.test(s)) return "out_of_stock";
  if (/limited|low/.test(s)) return "low_stock";
  if (/in.?stock|available|preorder|backorder/.test(s)) return "in_stock";
  const f = (inStock ?? "").trim().toLowerCase();
  if (["1", "y", "yes", "true"].includes(f)) {
    const q = Number(quantity);
    return Number.isFinite(q) && q > 0 && q <= 3 ? "low_stock" : "in_stock";
  }
  if (["0", "n", "no", "false"].includes(f)) return "out_of_stock";
  return "unknown";
}

/** Only absolute https URLs; http is upgraded only for known image CDNs is NOT done — we skip it instead. */
export function httpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function cleanText(raw: string | null | undefined, max = 5000): string | null {
  if (!raw) return null;
  const t = raw
    .replace(/<[^>]*>/g, " ") // strip HTML tags from feed descriptions
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return t ? t.slice(0, max) : null;
}

export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw.trim().replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
