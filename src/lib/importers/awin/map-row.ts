/**
 * Map one Awin product-feed row (Legacy "standard" columns or Enhanced Google-format columns)
 * to a NormalizedRow. Never invents values: missing data stays null / unknown.
 */
import { guessDepartment } from "../categories";
import {
  cleanText,
  httpsUrl,
  normalizeCondition,
  normalizeGtin,
  normalizePackQuantity,
  normalizeStock,
  parseDate,
  parsePriceMinor,
} from "../normalize";
import { KNOWN_ZERO, type FeedContext, type NormalizedRow, type RowIssue } from "../types";
import type { CostComponent } from "@/lib/types";

/** Hosts an Awin outbound link may point to. Anything else is rejected. */
export const AWIN_CLICK_HOSTS = ["www.awin1.com", "awin1.com"];

const pick = (v: Record<string, string>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const x = v[k];
    if (x != null && x.trim() !== "") return x.trim();
  }
  return null;
};

/** Enhanced feeds express shipping as "GB:::4.99 GBP" (country:region:service:price), possibly several, comma-separated. */
function enhancedShipping(raw: string | null, country: string): { minor: number; currency: string | null } | null {
  if (!raw) return null;
  for (const part of raw.split(",")) {
    const bits = part.split(":");
    if (bits.length >= 4 && bits[0]!.trim().toUpperCase() === country) return parsePriceMinor(bits.slice(3).join(":"));
  }
  return null;
}

export function isPermittedAwinLink(url: string | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && AWIN_CLICK_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function mapAwinRow(values: Record<string, string>, rowNumber: number, ctx: FeedContext): { row?: NormalizedRow; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const externalId = pick(values, "merchant_product_id", "aw_product_id", "id");
  const fail = (code: string, message: string) => {
    issues.push({ row: rowNumber, external_id: externalId ?? undefined, severity: "error", code, message, raw: trimRaw(values) });
    return { issues };
  };
  const warn = (code: string, message: string) =>
    issues.push({ row: rowNumber, external_id: externalId ?? undefined, severity: "warning", code, message });

  if (!externalId) return fail("missing_id", "Row has no merchant_product_id / aw_product_id / id.");
  const title = cleanText(pick(values, "product_name", "title"), 300);
  if (!title) return fail("missing_title", "Row has no product name.");

  // Price: Enhanced uses "price" / "sale_price" with currency suffix; Legacy uses search_price + currency.
  const saleRaw = pick(values, "sale_price");
  const priceRaw = pick(values, "search_price", "store_price", "display_price") ?? saleRaw ?? pick(values, "price");
  const price = parsePriceMinor(priceRaw);
  if (!price || price.minor <= 0) return fail("invalid_price", `Price "${priceRaw ?? ""}" is missing or not a valid amount.`);
  // Plausibility guard: obviously broken values (e.g. a product id in the price column) are rejected, not shown.
  if (price.minor > 100_000_000 * 100) return fail("implausible_price", `Price "${priceRaw}" is implausibly high; row not imported.`);
const currency = (pick(values, "currency") ?? price.currency ?? ctx.currency ?? "").toUpperCase();
  if (!currency) return fail("missing_currency", "Row has no currency.");
  if (currency !== ctx.currency) return fail("currency_mismatch", `Currency ${currency} does not match the feed currency ${ctx.currency}.`);

  const click = pick(values, "aw_deep_link");
  if (!isPermittedAwinLink(click)) return fail("missing_link", "No valid https Awin tracking link (aw_deep_link); offer cannot be linked.");

  const conditionRaw = pick(values, "condition");
 const condition = normalizeCondition(conditionRaw?.trim().toLowerCase() === "ny" ? "new" : conditionRaw);
  if (condition === "invalid") return fail("unknown_condition", `Unrecognised condition "${conditionRaw}". Not imported, to avoid mixing conditions.`);

  const gtinRaw = pick(values, "ean", "product_GTIN", "gtin", "upc", "isbn");
  const gtin = normalizeGtin(gtinRaw);
  if (gtinRaw && !gtin) warn("invalid_gtin", `GTIN "${gtinRaw}" failed validation and was ignored (row still imported, not matched by GTIN).`);

  const brand = cleanText(pick(values, "brand_name", "brand"), 120);
  const mpn = cleanText(pick(values, "mpn", "model_number", "product_model"), 80);
  const colour = cleanText(pick(values, "colour", "color", "Fashion:colour"), 60);
  const size = cleanText(pick(values, "Fashion:size", "size"), 40);
  const pack = normalizePackQuantity([values.multipack, values.pack_quantity], title);
  if (pack.uncertain) warn("pack_quantity_uncertain", "Pack quantity is invalid or contradictory; this listing will not be matched across retailers.");
  const category = cleanText(pick(values, "merchant_product_category_path", "merchant_category", "category_name", "product_type", "google_product_category"), 300);
  const guess = guessDepartment(category, title, condition);

  // Images: prefer the merchant's full-size image, then Awin's copy, then alternates. https only.
  const imageCandidates = [
    pick(values, "large_image"),
    pick(values, "merchant_image_url", "image_link"),
    pick(values, "aw_image_url"),
    pick(values, "alternate_image"),
    pick(values, "alternate_image_two"),
    pick(values, "alternate_image_three"),
    pick(values, "alternate_image_four"),
    ...(pick(values, "additional_image_link") ?? "").split(","),
  ];
  const images = [...new Set(imageCandidates.map(httpsUrl).filter((u): u is string => !!u))].slice(0, 8);
  if (images.length === 0) warn("missing_image", "No https product image in this row.");

  // Shipping to the feed's home market only. Unknown stays unknown (null), never 0.
  const legacyDelivery = pick(values, "delivery_cost");
  const ship = legacyDelivery != null ? parsePriceMinor(legacyDelivery) : enhancedShipping(pick(values, "shipping"), ctx.country);
  let shipping: CostComponent;
  if (ship && (!ship.currency || ship.currency === currency)) {
    shipping = { amountMinor: ship.minor, basis: "verified", note: "Delivery cost stated in the retailer's feed." };
  } else {
    shipping = { amountMinor: null, basis: "unknown", note: "The retailer's feed does not state a delivery cost." };
    if (legacyDelivery) warn("unparsed_shipping", `Delivery cost "${legacyDelivery}" could not be read; treated as unknown.`);
  }

  // Freshness: a "last updated" date in the future is a feed error; very old dates are flagged for review.
  const updatedRaw = pick(values, "last_updated");
  const updatedIso = parseDate(updatedRaw);
  if (updatedRaw && !updatedIso) warn("invalid_timestamp", `last_updated "${updatedRaw}" could not be read; ignored.`);
  if (updatedIso) {
    const age = Date.now() - new Date(updatedIso).getTime();
    if (age < -86_400_000) warn("future_timestamp", `last_updated ${updatedIso} is in the future; ignored.`);
    else if (age > 365 * 86_400_000) warn("old_timestamp", `last_updated ${updatedIso} is more than a year old; check that the offer is still current.`);
  }
  const sourceUpdatedAt = updatedIso && Date.now() - new Date(updatedIso).getTime() >= -86_400_000 ? updatedIso : null;

  const rrp = parsePriceMinor(pick(values, "rrp_price", "product_price_old") ?? (saleRaw ? pick(values, "price") : null));

  const specs: Record<string, string> = {};
  const specFields: [string, string][] = [
    ["Model", "model_number"], ["Dimensions", "dimensions"], ["Material", "Fashion:material"], ["Material", "material"],
    ["Pattern", "Fashion:pattern"], ["Warranty", "warranty"], ["Weight", "delivery_weight"], ["Energy class", "energy_efficiency_class"],
  ];
  for (const [label, key] of specFields) {
    const val = cleanText(values[key], 200);
    if (val && !specs[label]) specs[label] = val;
  }
  const specText = cleanText(values["specifications"] ?? values["product_detail"], 1500);
  if (specText) specs["Specifications"] = specText;

  const variantLabel = [colour, size, pack.quantity != null && pack.quantity > 1 ? `${pack.quantity}-pack` : null, condition !== "new" ? condition.replace("_", " ") : null].filter(Boolean).join(" · ");

  return {
    issues,
    row: {
      external_id: externalId.slice(0, 120),
      title,
      family_name: title,
      brand,
      mpn,
      gtin,
      condition,
      colour,
      size,
      pack_quantity: pack.quantity,
      pack_quantity_uncertain: pack.uncertain,
      variant_label: variantLabel,
      description: cleanText(pick(values, "description", "product_short_description"), 5000),
      category,
      department_slug: guess.department,
      subcategory_slug: guess.subcategory,
      specs,
      keywords: cleanText(pick(values, "keywords"), 400) ?? "",
      parent_id: cleanText(pick(values, "parent_product_id", "item_group_id"), 120),
      price_minor: price.minor,
      currency,
      rrp_minor: rrp && rrp.minor > price.minor ? rrp.minor : null,
      vat_included: ctx.vatIncluded,
      ship_from: (pick(values, "ships_from_country") ?? ctx.country).toUpperCase().slice(0, 2),
      stock: normalizeStock(pick(values, "in_stock", "is_for_sale") ?? undefined, pick(values, "stock_status", "availability") ?? undefined, pick(values, "stock_quantity") ?? undefined),
      product_url: httpsUrl(pick(values, "merchant_deep_link", "link")),
      click_url: click,
      images,
      destinations: { [ctx.country]: { shipping, importCharges: KNOWN_ZERO } },
      home_shipping_minor: shipping.amountMinor,
      delivery_time: cleanText(pick(values, "delivery_time"), 120),
      source_updated_at: sourceUpdatedAt,
    },
  };
}

function trimRaw(v: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["merchant_product_id", "aw_product_id", "id", "product_name", "title", "search_price", "price", "currency", "ean", "condition"]) {
    if (v[k]) out[k] = v[k]!.slice(0, 200);
  }
  return out;
}

/** Column checks run once on the header row. */
export function checkAwinHeader(header: string[]): { ok: boolean; missing: string[]; scheme: "legacy" | "enhanced" | "unknown" } {
  const h = new Set(header);
  const scheme = h.has("product_name") ? "legacy" : h.has("title") ? "enhanced" : "unknown";
  const need = scheme === "enhanced" ? ["id", "title", "price", "aw_deep_link"] : ["product_name", "search_price", "aw_deep_link"];
  const missing = need.filter((c) => !h.has(c));
  if (scheme === "legacy" && !h.has("merchant_product_id") && !h.has("aw_product_id")) missing.push("merchant_product_id|aw_product_id");
  return { ok: scheme !== "unknown" && missing.length === 0, missing, scheme };
}
