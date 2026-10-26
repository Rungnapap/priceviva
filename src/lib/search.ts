/**
 * In-memory catalog search for Phase 1.
 *
 * Features: field-weighted matching, synonyms, prefix matching, typo tolerance
 * (Damerau–Levenshtein), exact GTIN lookup, filters, sorting and pagination.
 * It only ever returns products that exist in the catalog — never invented results.
 * Phase 2 moves this to PostgreSQL full-text search (pg_trgm for typos).
 */
import type { Brand, Department, Product } from "./types";

export const SYNONYMS: Record<string, string[]> = {
  headphones: ["headphone", "headset", "earphones", "earbuds", "cans"],
  earbuds: ["earphones", "in-ear", "headphones"],
  phone: ["smartphone", "mobile", "cellphone"],
  smartphone: ["phone", "mobile"],
  laptop: ["notebook", "ultrabook", "computer"],
  notebook: ["laptop"],
  tv: ["television", "telly"],
  television: ["tv"],
  sneakers: ["trainers", "running shoes", "shoes"],
  trainers: ["sneakers", "running shoes"],
  coffee: ["espresso", "beans"],
  espresso: ["coffee"],
  backpack: ["rucksack", "daypack", "bag"],
  rucksack: ["backpack"],
  flask: ["bottle", "thermos"],
  charger: ["adapter", "power adapter"],
  lamp: ["light", "lighting"],
  watch: ["smartwatch", "wearable"],
  used: ["refurbished", "second hand", "pre-owned"],
  refurbished: ["used", "renewed"],
  fridge: ["refrigerator"],
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[\s-]+/)
    .filter((t) => t.length > 0);
}

/** Optimal-string-alignment distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

function allowedTypos(token: string): number {
  if (token.length >= 8) return 2;
  if (token.length >= 6) return 1;
  return 0;
}

interface IndexedProduct {
  product: Product;
  fields: { weight: number; tokens: string[] }[];
}

export interface SearchIndex {
  items: IndexedProduct[];
  vocabulary: string[];
}

export function buildIndex(products: Product[], brands: Brand[], departments: Department[]): SearchIndex {
  const brandName = (slug: string) => brands.find((b) => b.slug === slug)?.name ?? slug;
  const dept = (slug: string) => departments.find((d) => d.slug === slug);
  const items = products.map((p) => {
    const d = dept(p.department);
    const sub = d?.subcategories.find((s) => s.slug === p.subcategory)?.name ?? "";
    return {
      product: p,
      fields: [
        { weight: 6, tokens: tokenize(p.name) },
        { weight: 5, tokens: tokenize(brandName(p.brand)) },
        { weight: 5, tokens: tokenize(`${p.model} ${p.variant}`) },
        { weight: 3, tokens: tokenize(p.keywords.join(" ")) },
        { weight: 2, tokens: tokenize(`${d?.name ?? ""} ${sub} ${p.condition.replace("_", " ")}`) },
        { weight: 1, tokens: tokenize(Object.values(p.specs).join(" ")) },
      ],
    };
  });
  const vocab = new Set<string>();
  for (const it of items) for (const f of it.fields) for (const t of f.tokens) if (t.length >= 3 && !/^\d+$/.test(t)) vocab.add(t);
  return { items, vocabulary: [...vocab] };
}

/** Score one query token against a field token. */

function tokenScore(q: string, t: string): number {
  if (q === t) return 1;

  // Partial-word matching: "lap" matches "laptop".
  if (q.length >= 2 && t.startsWith(q)) {
    return q.length >= 3 ? 0.9 : 0.8;
  }

  const max = allowedTypos(q);
  if (max > 0 && editDistance(q, t, max) <= max) {
    return 0.55;
  }

  return 0;
}


function expand(q: string): string[] {
  const syn = SYNONYMS[q] ?? [];
  return [q, ...syn.flatMap((s) => tokenize(s))];
}

export type SortKey = "relevance" | "price_asc" | "price_desc" | "name";

export interface SearchOptions {
  department?: string;
  condition?: Product["condition"];
  brand?: string;
}

export interface SearchHit {
  product: Product;
  score: number;
}

export function searchProducts(index: SearchIndex, query: string, opts: SearchOptions = {}): SearchHit[] {
  const filtered = index.items.filter(
    (it) =>
      (!opts.department || it.product.department === opts.department) &&
      (!opts.condition || it.product.condition === opts.condition) &&
      (!opts.brand || it.product.brand === opts.brand),
  );

  const raw = query.trim();
  // Exact barcode lookup (GTIN-8/12/13/14).
  if (/^\d{8,14}$/.test(raw)) {
    return filtered.filter((it) => it.product.gtin === raw.padStart(13, "0") || it.product.gtin === raw).map((it) => ({ product: it.product, score: 100 }));
  }

  const qTokens = tokenize(raw);
  if (qTokens.length === 0) return filtered.map((it) => ({ product: it.product, score: 0 }));

  const hits: SearchHit[] = [];
  for (const it of filtered) {
    let total = 0;
    let allMatched = true;
    for (const q of qTokens) {
      let best = 0;
      for (const variant of expand(q)) {
        const synonymPenalty = variant === q ? 1 : 0.85;
        for (const f of it.fields) {
          for (const t of f.tokens) {
            const s = tokenScore(variant, t) * f.weight * synonymPenalty;
            if (s > best) best = s;
          }
        }
      }
      if (best === 0) {
        allMatched = false;
        break;
      }
      total += best;
    }
    if (allMatched) hits.push({ product: it.product, score: total });
  }
  return hits.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
}

/** "Did you mean …" for zero-result queries: closest vocabulary words per token. */

/** Suggest the closest correction, prioritizing words found in product names. */
export function suggestCorrection(index: SearchIndex, query: string): string | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;

  // Product-name words and their prefixes help suggestions match real products.
  const nameWords = index.items.flatMap((it) => it.fields[0]?.tokens ?? []);
  const candidates = new Set(index.vocabulary);

  for (const word of nameWords) {
    for (let i = 3; i < word.length; i++) {
      candidates.add(word.slice(0, i));
    }
  }

  // Prefer candidates that occur frequently at the start of product names.
  const popularity = (candidate: string) =>
    nameWords.filter((word) => word.startsWith(candidate)).length;

  let changed = false;

  const fixed = tokens.map((token) => {
    if (index.vocabulary.includes(token)) return token;

    let best: string | null = null;
    let bestDistance = 3;
    let bestPopularity = -1;

    for (const candidate of candidates) {
      const distance = editDistance(token, candidate, 2);
      if (distance > 2) continue;

      const candidatePopularity = popularity(candidate);

      if (
        distance < bestDistance ||
        (distance === bestDistance &&
          candidatePopularity > bestPopularity)
      ) {
        best = candidate;
        bestDistance = distance;
        bestPopularity = candidatePopularity;
      }
    }

    if (best !== null) {
      changed = true;
      return best;
    }

    return token;
  });

  return changed ? fixed.join(" ") : null;
}


export function paginate<T>(items: T[], page: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * perPage, current * perPage), page: current, pages, total: items.length };
}
