"use client";

import { useEffect, useState } from "react";
import type { CatalogProduct } from "./types";

/** Load catalogue views for a list of ids (saved items, comparison) from /api/products. */
export function useProducts(ids: string[], enabled = true): { items: CatalogProduct[]; loading: boolean; error: string | null } {
  const key = ids.join(",");
  const [state, setState] = useState<{ key: string; items: CatalogProduct[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!enabled || !key) return;
    const ctrl = new AbortController();
    fetch(`/api/products?ids=${encodeURIComponent(key)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { items: CatalogProduct[] };
      })
      .then((d) => setState({ key, items: d.items, error: null }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ key, items: [], error: "Could not load products. Please try again." });
      });
    return () => ctrl.abort();
  }, [key, enabled]);

  if (!key) return { items: [], loading: false, error: null };
  if (!state || state.key !== key) return { items: [], loading: true, error: null };
  return { items: state.items, loading: false, error: state.error };
}
