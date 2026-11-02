/**
 * FREE TEST MODE — DummyJSON sample products (https://dummyjson.com/products).
 *
 * DummyJSON is a public placeholder-data API "for development, testing, and prototyping" (code: MIT licence).
 * It grants no rights for its product images, and some sample products carry real brand names, so this
 * mode is for local testing/demos only — not for a public launch. See docs/SAMPLE_MODE.md.
 *
 * Honesty rules applied here:
 *  - Products are labelled "Sample data" everywhere. No DummyJSON "discountPercentage", "rating" or
 *    "reviews" are shown (they are generated, not real).
 *  - The DummyJSON price becomes one "sample list price" offer from a non-retailer, with delivery costs
 *    UNKNOWN (it never becomes a cheapest verified total) and no outbound link.
 *  - DummyJSON barcodes are random numbers, so they are never treated as real GTINs.
 *  - Stock status is shown only as unverified sample text.
 */
import { guessDepartment } from "@/lib/importers/categories";
import { httpsUrl, cleanText } from "@/lib/importers/normalize";
import type { CatalogOffer, CatalogProduct, CostComponent, DestinationTerms } from "@/lib/types";
import { SUPPORTED_COUNTRIES } from "@/lib/types";

export const DUMMYJSON_PRODUCTS_URL = "https://dummyjson.com/products?limit=0";
export const DUMMYJSON_IMAGE_HOSTS = ["cdn.dummyjson.com", "dummyjson.com"];

export interface DummyProduct {
  id: number;
  title: string;
  description?: string;
  category: string;
  price: number;
  brand?: string;
  sku?: string;
  tags?: string[];
  weight?: number;
  dimensions?: { width?: number; height?: number; depth?: number };
  warrantyInformation?: string;
  shippingInformation?: string;
  availabilityStatus?: string;
  returnPolicy?: string;
  minimumOrderQuantity?: number;
  meta?: { barcode?: string; updatedAt?: string };
  images?: string[];
  thumbnail?: string;
}

/** DummyJSON category -> PriceAtlas department / subcategory. */
export const DUMMY_CATEGORY_MAP: Record<string, [string, string | null]> = {
  beauty: ["beauty", "makeup"],
  fragrances: ["beauty", "fragrances"],
  "skin-care": ["beauty", "skin-care"],
  furniture: ["furniture", null],
  "home-decoration": ["home", "decor"],
  "kitchen-accessories": ["kitchen", "kitchen-accessories"],
  groceries: ["groceries", "pantry"],
  laptops: ["computers-gaming", "laptops"],
  tablets: ["computers-gaming", "tablets"],
  smartphones: ["phones", "smartphones"],
  "mobile-accessories": ["phones", "accessories"],
  "mens-shirts": ["fashion", "mens"],
  tops: ["fashion", "womens"],
  "womens-dresses": ["fashion", "womens"],
  "mens-shoes": ["shoes-bags", "shoes"],
  "womens-shoes": ["shoes-bags", "shoes"],
  "womens-bags": ["shoes-bags", "bags"],
  "mens-watches": ["jewelry-watches", "watches"],
  "womens-watches": ["jewelry-watches", "watches"],
  "womens-jewellery": ["jewelry-watches", "jewellery"],
  sunglasses: ["jewelry-watches", "sunglasses"],
  "sports-accessories": ["sports", "sports-accessories"],
  motorcycle: ["automotive", "motorcycles"],
  vehicle: ["automotive", "vehicles"],
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface SampleIssue {
  ref: string;
  code: string;
  message: string;
}

/** Light runtime validation — the API is external, so never trust its shape. */
export function parseDummyResponse(json: unknown): { products: DummyProduct[]; issues: SampleIssue[] } {
  const issues: SampleIssue[] = [];
  const list = (json as { products?: unknown })?.products;
  if (!Array.isArray(list)) throw new Error("Unexpected response from DummyJSON (no products array).");
  const products: DummyProduct[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const ref = String(raw?.id ?? "?");
    if (typeof raw?.id !== "number" || typeof raw.title !== "string" || !raw.title.trim()) {
      issues.push({ ref, code: "invalid_product", message: "Missing id or title; skipped." });
      continue;
    }
    if (typeof raw.price !== "number" || !Number.isFinite(raw.price) || raw.price <= 0) {
      issues.push({ ref, code: "invalid_price", message: `Price ${String(raw.price)} is not a positive number; skipped.` });
      continue;
    }
    products.push(raw as unknown as DummyProduct);
  }
  return { products, issues };
}

const unknownCost = (note: string): CostComponent => ({ amountMinor: null, basis: "unknown", note });

export const SAMPLE_LIST_RETAILER = { id: "dummyjson", name: "DummyJSON sample list price (not a retailer)", country: null };

export function mapDummyProduct(d: DummyProduct, fetchedAt: string): { product: CatalogProduct; issues: SampleIssue[] } {
  const issues: SampleIssue[] = [];
  const ref = `dj-${d.id}`;
  const [department, mappedSubcategory] = DUMMY_CATEGORY_MAP[d.category] ?? [null, null];
  const subcategory = department === "furniture" ? guessDepartment("Furniture", d.title, "new").subcategory : mappedSubcategory;
  if (!department) issues.push({ ref, code: "unmapped_category", message: `Category "${d.category}" has no department mapping; product is searchable only.` });

  const allowed = (u: string | null | undefined): string | null => {
    const h = httpsUrl(u ?? null);
    return h && DUMMYJSON_IMAGE_HOSTS.includes(new URL(h).hostname) ? h : null;
  };
  const thumbnailUrl = allowed(d.thumbnail);
  // Gallery: the full-size photos only. The thumbnail is a smaller copy of the first photo, so it is used
  // for cards instead of being shown again as an extra gallery image (it is the gallery fallback only).
  let urls = (d.images ?? []).map(allowed).filter((u): u is string => !!u);
  if (urls.length === 0 && thumbnailUrl) urls = [thumbnailUrl];
  const images = [...new Set(urls)].slice(0, 8).map((url) => ({
    url,
    alt: d.title,
    source: "sample" as const,
    licence: "DummyJSON placeholder image — for local testing only",
  }));
  if (images.length === 0) issues.push({ ref, code: "missing_image", message: "No usable https image from DummyJSON." });

  const dims = d.dimensions && [d.dimensions.width, d.dimensions.height, d.dimensions.depth].every((n) => typeof n === "number")
    ? `${d.dimensions.width} × ${d.dimensions.height} × ${d.dimensions.depth} (units not stated)`
    : null;
  const specs: Record<string, string> = {};
  const add = (k: string, v: unknown) => {
    const t = typeof v === "number" ? String(v) : cleanText(typeof v === "string" ? v : null, 200);
    if (t) specs[k] = t;
  };
  add("SKU (sample)", d.sku);
  add("Weight (sample, units not stated)", d.weight);
  add("Dimensions (sample)", dims);
  add("Warranty (sample text)", d.warrantyInformation);
  add("Shipping note (sample text)", d.shippingInformation);
  add("Return policy (sample text)", d.returnPolicy);
  add("Stock status (sample, unverified)", d.availabilityStatus);
  add("Minimum order (sample)", d.minimumOrderQuantity);
  add("Barcode (sample, not a real GTIN)", d.meta?.barcode);

  const terms: DestinationTerms = {
    shipping: unknownCost("DummyJSON gives no delivery cost."),
    importCharges: unknownCost("No tax or import information in sample data."),
  };
  const listOffer: CatalogOffer = {
    id: `${ref}-list`,
    productId: ref,
    retailerId: SAMPLE_LIST_RETAILER.id,
    retailer: SAMPLE_LIST_RETAILER,
    // DummyJSON states no currency; its documentation and demos use dollar amounts, so we label it USD.
    price: { minor: Math.round(d.price * 100), currency: "USD" },
    vatIncluded: false,
    shipFrom: null,
    stock: "unknown",
    destinations: Object.fromEntries(SUPPORTED_COUNTRIES.map((c) => [c, terms])),
    observedDaysAgo: 0,
    observedAt: fetchedAt,
    sourceUpdatedAt: d.meta?.updatedAt ?? null,
    sourceUrl: null,
    source: "sample",
    clickable: false,
    informational: true, // a list price from a test API, not a shop's offer
  };

  const brandName = cleanText(d.brand ?? null, 80) ?? "";
  return {
    issues,
    product: {
      id: ref,
      slug: `${slugify(d.title).slice(0, 80) || "product"}-dj${d.id}`,
      name: d.title,
      brand: brandName ? slugify(brandName) : "",
      brandName,
      department: department ?? "",
      subcategory: subcategory ?? "",
      model: cleanText(d.sku ?? null, 40) ?? "",
      variant: "",
      gtin: "",
      condition: "new",
      description: cleanText(d.description ?? null, 3000) ?? "",
      specs,
      keywords: [...(d.tags ?? []), d.category.replace(/-/g, " ")].filter((t) => typeof t === "string"),
      art: "",
      source: "sample",
      images,
      thumbnailUrl,
      offers: [listOffer],
      sourceCategory: d.category,
    },
  };
}
