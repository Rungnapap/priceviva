"use client";

/* eslint-disable @next/next/no-img-element -- images are shown from the source's own image host (see product-photo.tsx). */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { getDepartment } from "@/data/departments";
import type { CatalogProduct, ProductImage } from "@/lib/types";
import { ChevronLeft, ChevronRight, X } from "./icons";
import { ProductArt } from "./product-art";
import { NoPhoto, RetailerImage } from "./product-photo";
import { useT } from "./i18n-provider";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Hover/click zoom: the image scales up and follows the pointer. */
function ZoomImage({ image, zoomed, onToggle, className = "" }: { image: ProductImage; zoomed: boolean; onToggle?: () => void; className?: string }) {
  const [origin, setOrigin] = useState("50% 50%");
  const [failed, setFailed] = useState(false);
  if (failed) return <NoPhoto label={image.alt} />;
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}% ${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  return (
    <div className={`h-full w-full overflow-hidden ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"} ${className}`} onMouseMove={move} onClick={onToggle}>
      <img
        src={image.url}
        alt={image.alt}
        referrerPolicy="no-referrer"
        decoding="async"
        onError={() => setFailed(true)}
        draggable={false}
        className="h-full w-full select-none object-contain"
        style={{ transform: zoomed ? "scale(2.5)" : "scale(1)", transformOrigin: origin, transition: reducedMotion() ? "none" : "transform 160ms ease-out" }}
      />
    </div>
  );
}

function Lightbox({ images, index, onIndex, onClose, label }: { images: ProductImage[]; index: number; onIndex: (i: number) => void; onClose: () => void; label: string }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const go = useCallback((delta: number) => {
    setZoomed(false);
    onIndex((index + delta + images.length) % images.length);
  }, [index, images.length, onIndex]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "+" || e.key === "z") setZoomed((z) => !z);
  };
  const img = images[index]!;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onKeyDown={onKey}
      aria-label={t("gallery.photosOf", { label })}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-[#0b1220]/95 p-0 text-white backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span aria-live="polite">{index + 1} / {images.length} · {zoomed ? t("gallery.zoomOut") : t("gallery.zoomIn")} · {t("gallery.browse")}</span>
          <button type="button" onClick={() => ref.current?.close()} autoFocus className="rounded-full p-2 hover:bg-white/10" aria-label={t("gallery.close")}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative flex-1 bg-white">
          <ZoomImage key={img.url} image={{ ...img, alt: `${label} — photo ${index + 1} of ${images.length}` }} zoomed={zoomed} onToggle={() => setZoomed((z) => !z)} />
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-[#101828]/70 p-3 hover:bg-[#101828]" aria-label={t("gallery.prev")}>
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-[#101828]/70 p-3 hover:bg-[#101828]" aria-label={t("gallery.next")}>
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex justify-center gap-2 overflow-x-auto p-3">
            {images.map((im, i) => (
              <button key={im.url} type="button" onClick={() => { setZoomed(false); onIndex(i); }} aria-label={t("gallery.photoN", { n: i + 1 })} aria-pressed={i === index}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white p-1 ${i === index ? "border-[#84adff]" : "border-transparent opacity-70 hover:opacity-100"}`}>
                <RetailerImage image={{ ...im, alt: "" }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}

/** Main photo with hover zoom, clickable thumbnails, and a full-screen viewer with zoom. */
export function ProductGallery({ product }: { product: CatalogProduct }) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [hoverZoom, setHoverZoom] = useState(false);
  const [viewer, setViewer] = useState(false);
  const label = `${product.brandName} ${product.name}`.trim();
  const imgs = product.images;

  if (imgs.length === 0) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-card)] border border-line">
        {product.source === "demo" ? (
          <ProductArt art={product.art} hue={getDepartment(product.department)?.hue ?? 220} label={label} size="lg" className="h-full w-full" />
        ) : (
          <NoPhoto label={label} />
        )}
      </div>
    );
  }

  const i = Math.min(active, imgs.length - 1);
  const current = imgs[i]!;
  const credit =
    product.source === "sample"
      ? t("gallery.creditSample")
      : t("gallery.creditLive");

  return (
    <div className="space-y-3">
      <figure className="group relative aspect-square w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
        <div
          className="h-full w-full p-4"
          onMouseEnter={() => !reducedMotion() && setHoverZoom(true)}
          onMouseLeave={() => setHoverZoom(false)}
        >
          <ZoomImage key={current.url} image={{ ...current, alt: t("gallery.photoAlt", { label, n: i + 1, total: imgs.length }) }} zoomed={hoverZoom} onToggle={() => setViewer(true)} />
        </div>
        <button
          type="button"
          onClick={() => setViewer(true)}
          className="absolute bottom-3 right-3 rounded-full bg-[#101828]/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#101828]"
        >
          {t("gallery.openFull")}{imgs.length > 1 ? ` · ${t("gallery.nPhotos", { n: imgs.length })}` : ""}
        </button>
        {imgs.length > 1 && (
          <>
            <button type="button" onClick={() => setActive((i - 1 + imgs.length) % imgs.length)} aria-label={t("gallery.prev")}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface/90 p-2 text-ink opacity-0 shadow-card transition-opacity group-hover:opacity-100 focus:opacity-100">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setActive((i + 1) % imgs.length)} aria-label={t("gallery.next")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface/90 p-2 text-ink opacity-0 shadow-card transition-opacity group-hover:opacity-100 focus:opacity-100">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </figure>
      {imgs.length > 1 && (
        <div role="group" aria-label={t("gallery.productPhotos")} className="flex gap-2 overflow-x-auto pb-1">
          {imgs.map((img, n) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActive(n)}
              aria-label={t("gallery.show", { n: n + 1, total: imgs.length })}
              aria-pressed={n === i}
              className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-1 ${n === i ? "border-primary" : "border-line hover:border-primary/50"}`}
            >
              <RetailerImage image={{ ...img, alt: "" }} />
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">{t("gallery.hint")} {credit}</p>
      {viewer && <Lightbox images={imgs} index={i} onIndex={setActive} onClose={() => setViewer(false)} label={label} />}
    </div>
  );
}
