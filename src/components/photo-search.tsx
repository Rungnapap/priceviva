"use client";

/* eslint-disable @next/next/no-img-element -- previews of the visitor's own photo and catalogue photos (no optimisation wanted) */
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { FEATURE_SIZE, features, rankVisual, validateUpload, type IndexedImage, type VisualConfidence } from "@/lib/visual-search";
import { Camera, Search, X } from "./icons";
import { useT } from "./i18n-provider";

type IndexItem = { id: string; slug: string; name: string; brand: string; image: string; source: string };
type Hit = { item: IndexItem; score: number; confidence: VisualConfidence };
type BarcodeHit = { id: string; slug: string; name: string; brand: string; image: string | null };

// ---------------------------------------------------------------------------------------------
// On-device catalogue index (built once per page load, only when photo search is used)
// ---------------------------------------------------------------------------------------------
let indexPromise: Promise<{ index: IndexedImage<IndexItem>[]; total: number; mode: string | null }> | null = null;

function pixels(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = FEATURE_SIZE;
  c.height = FEATURE_SIZE;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  // Stretch the region to the square (no letterbox borders, which would hide the real background colour);
  // the true proportions are passed to features() separately.
  g.drawImage(source, sx, sy, sw, sh, 0, 0, FEATURE_SIZE, FEATURE_SIZE);
  return g.getImageData(0, 0, FEATURE_SIZE, FEATURE_SIZE).data;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("image failed"));
    im.src = src;
  });
}

function buildIndex(onProgress: (done: number, total: number) => void) {
  indexPromise ??= (async () => {
    const r = await fetch("/api/visual-index");
    const data = (await r.json()) as { mode: string | null; items: IndexItem[] };
    const items = data.items ?? [];
    const index: IndexedImage<IndexItem>[] = [];
    let done = 0;
    const queue = [...items];
    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        try {
          const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(it.image)}`);
          if (!res.ok) throw new Error("not available");
          const bmp = await createImageBitmap(await res.blob());
          index.push({ item: it, f: features(pixels(bmp, 0, 0, bmp.width, bmp.height), FEATURE_SIZE, FEATURE_SIZE, bmp.width / bmp.height) });
          bmp.close();
        } catch {
          /* skipped: image host not allowed or unavailable */
        }
        onProgress(++done, items.length);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    return { index, total: items.length, mode: data.mode };
  })().catch((e) => {
    indexPromise = null;
    throw e;
  });
  return indexPromise;
}

// ---------------------------------------------------------------------------------------------
// Barcode helpers (BarcodeDetector where the browser has it; typing always works)
// ---------------------------------------------------------------------------------------------
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
function barcodeDetector(): Detector | null {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try {
    return BD ? new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }) : null;
  } catch {
    return null;
  }
}

async function lookupBarcode(code: string): Promise<{ ok: boolean; gtin?: string; items: BarcodeHit[]; message?: string }> {
  const r = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`);
  const d = (await r.json()) as { valid: boolean; gtin?: string; items: BarcodeHit[]; message?: string };
  return { ok: d.valid, gtin: d.gtin, items: d.items ?? [], message: d.message };
}

const CONF_LABEL = { high: "photo.confHigh", medium: "photo.confMedium", low: "photo.confLow" } as const satisfies Record<VisualConfidence, string>;
const UPLOAD_PROBLEM = { type: "photo.errType", size: "photo.errSize", empty: "photo.errEmpty" } as const;

// ---------------------------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------------------------
export function PhotoSearchDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  const [tab, setTab] = useState<"photo" | "barcode">("photo");
  const [error, setError] = useState<string | null>(null);
  const [img, setImg] = useState<{ url: string; el: HTMLImageElement } | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "indexing" | "searching" | "done">("idle");
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [indexInfo, setIndexInfo] = useState<{ indexed: number; total: number; mode: string | null } | null>(null);
  const [barcode, setBarcode] = useState<{ code: string; result: Awaited<ReturnType<typeof lookupBarcode>> | null; busy: boolean }>({ code: "", result: null, busy: false });
  const [textQ, setTextQ] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => () => {
    if (img) URL.revokeObjectURL(img.url);
  }, [img]);

  const reset = () => {
    setImg(null);
    setCrop(null);
    setHits([]);
    setPhase("idle");
    setError(null);
  };

  const accept = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateUpload(file);
    if (problem) return setError(t(UPLOAD_PROBLEM[problem]));
    reset();
    const url = URL.createObjectURL(file);
    try {
      const el = await loadImage(url);
      setImg({ url, el });
      // Try reading a barcode from the photo (exact identification) where the browser supports it.
      const det = barcodeDetector();
      if (det) {
        const codes = await det.detect(el).catch(() => []);
        if (codes[0]?.rawValue) {
          setBarcode({ code: codes[0].rawValue, result: null, busy: true });
          const result = await lookupBarcode(codes[0].rawValue).catch(() => null);
          setBarcode({ code: codes[0].rawValue, result, busy: false });
        }
      }
    } catch {
      URL.revokeObjectURL(url);
      setError(t("photo.errOpen"));
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void accept(e.dataTransfer.files?.[0]);
  };

  // Crop: drag on the preview to select the product area (stored as fractions of the image).
  const rel = (e: RPointerEvent<HTMLDivElement>) => {
    const r = previewRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start.current = rel(e);
    setCrop(null);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const p = rel(e);
    const s = start.current;
    setCrop({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onUp = () => {
    start.current = null;
    setCrop((c) => (c && (c.w < 0.05 || c.h < 0.05) ? null : c));
  };

  const search = async () => {
    if (!img) return;
    setError(null);
    setHits([]);
    try {
      setPhase("indexing");
      const { index, total, mode } = await buildIndex((d, n) => setProgress([d, n]));
      setIndexInfo({ indexed: index.length, total, mode });
      setPhase("searching");
      const W = img.el.naturalWidth;
      const H = img.el.naturalHeight;
      const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const sw = Math.max(1, c.w * W);
      const sh = Math.max(1, c.h * H);
      const q = features(pixels(img.el, c.x * W, c.y * H, sw, sh), FEATURE_SIZE, FEATURE_SIZE, sw / sh);
      setHits(index.length ? rankVisual(q, index, 12) : []);
      setPhase("done");
    } catch {
      setPhase("idle");
      setError(t("photo.errIndex"));
    }
  };

  const doBarcode = async () => {
    const code = barcode.code.trim();
    if (!code) return;
    setBarcode((b) => ({ ...b, busy: true, result: null }));
    const result = await lookupBarcode(code).catch(() => ({ ok: true, items: [], message: "unavailable" }));
    setBarcode({ code, result, busy: false });
  };

  const exact = barcode.result?.items ?? [];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="photo-title"
      className="m-auto w-[min(48rem,calc(100vw-1rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-[#101828]/55"
    >
      <div className="max-h-[90vh] overflow-y-auto p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="photo-title" className="pv-display text-xl font-bold">{t("photo.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("photo.privacy")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t("common.close")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex rounded-full border border-line p-0.5" role="tablist" aria-label={t("photo.method")}>
          {(["photo", "barcode"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={tab === m} onClick={() => setTab(m)} className={clsx("flex-1 rounded-full px-4 py-2 text-sm font-semibold", tab === m ? "bg-ink text-surface" : "text-muted hover:text-ink")}>
              {m === "photo" ? t("photo.tabPhoto") : t("photo.tabBarcode")}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mb-3 rounded-xl bg-error-soft px-3 py-2 text-sm text-error-ink">{error}</p>}

        {tab === "photo" ? (
          <div className="space-y-4">
            <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void accept(e.target.files?.[0]); e.target.value = ""; }} aria-label={t("photo.uploadLabel")} />
            <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { void accept(e.target.files?.[0]); e.target.value = ""; }} aria-label={t("photo.take")} />
            {!img ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={clsx("flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center", dragging ? "border-primary bg-primary-soft" : "border-line")}
              >
                <Camera className="h-8 w-8 text-primary" aria-hidden="true" />
                <p className="font-semibold">{t("photo.drop")}</p>
                <p className="text-sm text-muted">{t("photo.types")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => uploadRef.current?.click()} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">{t("photo.upload")}</button>
                  <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface-2">{t("photo.take")}</button>
                </div>
                <p className="text-xs text-muted">{t("photo.takeHint")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  ref={previewRef}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  className="relative mx-auto max-h-80 w-fit cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-line"
                  aria-label={t("photo.previewLabel")}
                  role="img"
                >
                  <img src={img.url} alt="" draggable={false} className="block max-h-80 w-auto max-w-full" />
                  {crop && (
                    <div className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgb(11_23_48/0.45)]" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
                  )}
                </div>
                <p className="text-center text-xs text-muted">{crop ? t("photo.searchingArea") : t("photo.cropTip")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={search} disabled={phase === "indexing" || phase === "searching"} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                    <Search className="h-4 w-4" aria-hidden="true" /> {phase === "indexing" ? t("photo.preparing", { i: progress[0], n: progress[1] }) : phase === "searching" ? t("photo.comparing") : t("photo.search")}
                  </button>
                  {crop && <button type="button" onClick={() => setCrop(null)} className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">{t("photo.resetCrop")}</button>}
                  <button type="button" onClick={() => uploadRef.current?.click()} className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">{t("photo.replace")}</button>
                  <button type="button" onClick={reset} className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-error-ink hover:bg-surface-2">{t("photo.remove")}</button>
                </div>
              </div>
            )}

            {barcode.result && exact.length > 0 && (
              <ResultList title={t("photo.exactBarcode", { code: barcode.result.gtin?.replace(/^0+(?=\d{8,})/, "") ?? "" })} tone="exact" items={exact.map((x) => ({ key: x.id, slug: x.slug, name: x.name, brand: x.brand, image: x.image, badge: t("photo.exactBadge") }))} onPick={onClose} />
            )}

            <div aria-live="polite">
              {phase === "done" && (
                <>
                  {indexInfo && indexInfo.indexed === 0 ? (
                    <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
                      {indexInfo.mode === "demo"
                        ? t("photo.demoNoPhotos")
                        : t("photo.noPhotos")}
                    </p>
                  ) : hits.length > 0 ? (
                    <ResultList
                      title={t("photo.similar")}
                      note={t("photo.similarNote", { n: indexInfo?.indexed ?? 0 })}
                      items={hits.map((h) => ({ key: h.item.id, slug: h.item.slug, name: h.item.name, brand: h.item.brand, image: h.item.image, badge: `${t(CONF_LABEL[h.confidence])} · ${Math.round(h.score * 100)}%`, confidence: h.confidence }))}
                      onPick={onClose}
                    />
                  ) : (
                    <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
                      {t("photo.noMatchN", { n: indexInfo?.indexed ?? 0 })}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <form onSubmit={(e) => { e.preventDefault(); void doBarcode(); }} className="flex flex-wrap gap-2">
              <label htmlFor="bc" className="sr-only">{t("photo.barcodeLabel")}</label>
              <input id="bc" inputMode="numeric" value={barcode.code} onChange={(e) => setBarcode({ code: e.target.value, result: null, busy: false })} placeholder={t("photo.barcodePlaceholder")} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
              <button type="submit" disabled={barcode.busy} className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{barcode.busy ? t("photo.lookingUp") : t("photo.lookup")}</button>
            </form>
            <p className="text-xs text-muted">
              {t("photo.barcodeHint")}{" "}
              {barcodeDetector() ? t("photo.barcodePhotoYes") : t("photo.barcodePhotoNo")}
            </p>
            {barcode.result && (
              exact.length > 0 ? (
                <ResultList title={t("photo.exact")} tone="exact" items={exact.map((x) => ({ key: x.id, slug: x.slug, name: x.name, brand: x.brand, image: x.image, badge: t("photo.exactBadge") }))} onPick={onClose} />
              ) : (
                <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{!barcode.result.ok ? t("photo.invalidBarcode") : barcode.result.message ? t("photo.barcodeUnavailable") : t("photo.noBarcodeMatch")}</p>
              )
            )}
          </div>
        )}

        <form action="/search" method="get" className="mt-5 flex gap-2 border-t border-line pt-4" onSubmit={() => onClose()}>
          <label htmlFor="ps-text" className="sr-only">{t("photo.textLabel")}</label>
          <input id="ps-text" name="q" value={textQ} onChange={(e) => setTextQ(e.target.value)} placeholder={t("photo.textInstead")} className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm" />
          <button type="submit" className="h-10 rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface-2">{t("photo.searchText")}</button>
        </form>
      </div>
    </dialog>
  );
}

function ResultList({
  title,
  note,
  items,
  tone = "similar",
  onPick,
}: {
  title: string;
  note?: string;
  tone?: "exact" | "similar";
  items: { key: string; slug: string; name: string; brand: string; image: string | null; badge: string; confidence?: VisualConfidence }[];
  onPick: () => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {note && <p className="text-xs text-muted">{note}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((x) => (
          <li key={x.key}>
            <Link href={`/product/${x.slug}`} onClick={onPick} className="flex items-center gap-3 rounded-xl border border-line p-2.5 hover:bg-surface-2">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                {x.image ? <img src={x.image} alt="" className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{x.name}</span>
                <span className="block truncate text-xs text-muted">{x.brand}</span>
                <span className={clsx("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", tone === "exact" ? "bg-success-soft text-success-ink" : x.confidence === "high" ? "bg-primary-soft text-primary-ink" : "bg-surface-2 text-muted")}>
                  {x.badge}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
