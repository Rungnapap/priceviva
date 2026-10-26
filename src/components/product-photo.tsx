"use client";

/* eslint-disable @next/next/no-img-element -- Retailer images are hot-linked from the feed's own image hosts
   (as supplied for promotion), not re-hosted or re-processed, so next/image optimisation is deliberately not used. */
import { useState } from "react";
import { getDepartment } from "@/data/departments";
import type { CatalogProduct, ProductImage } from "@/lib/types";
import { Package } from "./icons";
import { ProductArt } from "./product-art";

/** Consistent placeholder when a source supplies no photo or the image host fails. Never a broken image. */
export function NoPhoto({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(180deg,var(--pa-surface-2),var(--pa-surface))] text-muted"
      role="img"
      aria-label={`No photo available for ${label}`}
    >
      <span className={`flex items-center justify-center rounded-full bg-surface ring-1 ring-line ${compact ? "h-9 w-9" : "h-14 w-14"}`}>
        <Package className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden="true" />
      </span>
      <span className={compact ? "text-[11px]" : "text-xs"}>Photo not available</span>
    </div>
  );
}

/** One retailer-supplied photo; falls back gracefully when the image host fails. */
export function RetailerImage({ image, className = "", eager = false }: { image: ProductImage; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed) return <NoPhoto label={image.alt} compact />;
  return (
    <img
      src={image.url}
      alt={image.alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      ref={(el) => {
        // Cached images can finish before React attaches onLoad.
        if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
      }}
      className={`h-full w-full object-contain ${loaded ? "" : "animate-pulse rounded-lg bg-surface-2"} ${className}`}
    />
  );
}

/**
 * Card thumbnail: the source's small card photo when it has one (DummyJSON thumbnail, ~10 KB instead of
 * ~60 KB), else the first gallery photo; a labelled illustration for fictional demo products; or a placeholder.
 */
export function ProductThumb({ product }: { product: CatalogProduct }) {
  const label = `${product.brandName} ${product.name}`.trim();
  const first = product.images[0];
  if (product.thumbnailUrl || first) {
    const image: ProductImage = product.thumbnailUrl
      ? { url: product.thumbnailUrl, alt: first?.alt ?? label, source: first?.source ?? product.source }
      : first!;
    return <div className="h-full w-full bg-white p-3"><RetailerImage key={image.url} image={image} /></div>;
  }
  if (product.source === "demo") return <ProductArt art={product.art} hue={getDepartment(product.department)?.hue ?? 220} label={label} className="h-full w-full" />;
  return <NoPhoto label={label} />;
}
