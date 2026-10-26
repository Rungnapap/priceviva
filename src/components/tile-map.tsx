"use client";

/* eslint-disable @next/next/no-img-element -- map tiles come straight from the tile server (no resizing wanted). */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from "react";
import { useT } from "./i18n-provider";

/**
 * Small, dependency-free slippy map (Web Mercator tiles) for Local Deal Radar.
 * - Default tiles: OpenStreetMap (free, attribution required, light use only — see the OSM tile usage policy).
 *   For production traffic set NEXT_PUBLIC_MAP_TILE_URL / NEXT_PUBLIC_MAP_ATTRIBUTION to a commercial provider.
 * - Shows the shopping-area centre, the search radius, and pins ONLY for stores with real coordinates.
 * - Drag or use the arrow keys to pan, +/- to zoom. If tiles cannot load, the map says so (the list still works).
 */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

const TILE = 256;
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";
const ATTRIBUTION_URL = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION_URL || "https://www.openstreetmap.org/copyright";

function project(lat: number, lng: number, z: number) {
  const scale = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}
const metersPerPixel = (lat: number, z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** Largest zoom at which the radius circle fits in the smaller side of the map with some margin. */
export function fitZoom(lat: number, radiusKm: number, width: number, height: number): number {
  const half = Math.max(80, Math.min(width, height) / 2 - 24);
  for (let z = 17; z >= 3; z--) if ((radiusKm * 1000) / metersPerPixel(lat, z) <= half) return z;
  return 3;
}

export function TileMap({
  center,
  radiusKm,
  pins = [],
  label,
  className = "",
  note,
  selectedId = null,
  onSelect,
}: {
  center: { lat: number; lng: number };
  radiusKm: number;
  pins?: MapPin[];
  label: string;
  className?: string;
  /** Small overlay message, e.g. why demo stores are not pinned. */
  note?: string;
  /** Highlighted pin (kept in sync with the result cards). */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit when the area or radius changes (state adjusted during render, React's recommended pattern).
  const fitted = fitZoom(center.lat, radiusKm, size.w, size.h);
  const areaKey = `${center.lat},${center.lng},${radiusKm}`;
  const [shownArea, setShownArea] = useState(areaKey);
  if (shownArea !== areaKey) {
    setShownArea(areaKey);
    setZoom(null);
    setPan({ x: 0, y: 0 });
  }
  const z = zoom ?? fitted;

  const view = useMemo(() => {
    const c = project(center.lat, center.lng, z);
    const left = c.x - size.w / 2 - pan.x;
    const top = c.y - size.h / 2 - pan.y;
    const n = 2 ** z;
    const tiles: { key: string; src: string; x: number; y: number }[] = [];
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        tiles.push({ key: `${z}/${tx}/${ty}`, src: TILE_URL.replace("{z}", String(z)).replace("{x}", String(wx)).replace("{y}", String(ty)), x: tx * TILE - left, y: ty * TILE - top });
      }
    }
    const toScreen = (lat: number, lng: number) => {
      const p = project(lat, lng, z);
      return { x: p.x - left, y: p.y - top };
    };
    return { tiles, centre: toScreen(center.lat, center.lng), radiusPx: (radiusKm * 1000) / metersPerPixel(center.lat, z), toScreen };
  }, [center.lat, center.lng, z, pan.x, pan.y, size.w, size.h, radiusKm]);

  // Reset tile load counters when the visible tile set changes.
  const tileKey = view.tiles.map((t) => t.key).join("|");
  const [shownTiles, setShownTiles] = useState(tileKey);
  if (shownTiles !== tileKey) {
    setShownTiles(tileKey);
    setFailed(0);
    setLoaded(0);
  }

  const setZ = (nz: number) => {
    setZoom(Math.max(3, Math.min(18, nz)));
    setPan((p) => ({ x: p.x * 2 ** (nz - z), y: p.y * 2 ** (nz - z) }));
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
  };
  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setPan((p) => ({ x: p.x + moves[e.key]![0], y: p.y + moves[e.key]![1] }));
    } else if (e.key === "+" || e.key === "=") setZ(z + 1);
    else if (e.key === "-") setZ(z - 1);
  };
  const allFailed = view.tiles.length > 0 && failed >= view.tiles.length;

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-2 ${className}`}>
      <div
        ref={ref}
        role="application"
        aria-roledescription="map"
        aria-label={t("map.keys", { label })}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKey}
        className="absolute inset-0 cursor-grab touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
      >
        {view.tiles.map((t) => (
          <img
            key={t.key}
            src={t.src}
            alt=""
            width={TILE}
            height={TILE}
            draggable={false}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded((n) => n + 1)}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              setFailed((n) => n + 1);
            }}
            className="pointer-events-none absolute max-w-none"
            style={{ left: t.x, top: t.y, width: TILE, height: TILE }}
          />
        ))}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <circle cx={view.centre.x} cy={view.centre.y} r={view.radiusPx} fill="var(--pa-radar)" fillOpacity="0.08" stroke="var(--pa-radar)" strokeWidth="2" strokeDasharray="6 5" />
          <circle cx={view.centre.x} cy={view.centre.y} r="8" fill="var(--pa-primary)" stroke="white" strokeWidth="3" />
        </svg>
      </div>

      {/* Pins sit outside the drag layer so they are real, focusable buttons. */}
      {pins.map((p) => {
        const sp = view.toScreen(p.lat, p.lng);
        if (sp.x < -20 || sp.y < -20 || sp.x > size.w + 20 || sp.y > size.h + 20) return null;
        const on = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect?.(p.id)}
            aria-label={`${p.label}${on ? t("map.selected") : ""}`}
            aria-pressed={on}
            className="absolute -translate-x-1/2 -translate-y-full p-1"
            style={{ left: sp.x, top: sp.y, zIndex: on ? 3 : 2 }}
          >
            <span className={`block rotate-45 rounded-[50%_50%_50%_0] ring-2 ring-white shadow-card ${on ? "h-6 w-6 bg-primary" : "h-4 w-4 bg-radar"}`} />
          </button>
        );
      })}

      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <button type="button" onClick={() => setZ(z + 1)} aria-label={t("map.zoomIn")} className="h-10 w-10 text-lg font-semibold hover:bg-surface-2">+</button>
        <button type="button" onClick={() => setZ(z - 1)} aria-label={t("map.zoomOut")} className="h-10 w-10 border-t border-line text-lg font-semibold hover:bg-surface-2">−</button>
        <button type="button" onClick={() => { setZoom(null); setPan({ x: 0, y: 0 }); }} aria-label={t("map.recentre")} className="h-10 w-10 border-t border-line text-xs font-semibold hover:bg-surface-2">⌖</button>
      </div>

      {note && <p className="absolute left-2 top-2 max-w-[70%] rounded-lg bg-surface/95 px-2.5 py-1.5 text-xs text-ink shadow-card">{note}</p>}

      {allFailed && loaded === 0 && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-xs rounded-xl bg-surface/95 px-4 py-3 text-sm text-muted shadow-card">
            {t("map.failed")}
          </p>
        </div>
      )}

      <a href={ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer" className="absolute bottom-0 right-0 rounded-tl-md bg-surface/90 px-1.5 py-0.5 text-[10px] text-muted hover:underline">
        {ATTRIBUTION}
      </a>
    </div>
  );
}
