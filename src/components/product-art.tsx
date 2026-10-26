/**
 * Illustrated placeholders for FICTIONAL demo products.
 *
 * These are deliberately stylised drawings, not photographs, so they can never be
 * mistaken for real product photography. Phase 3 replaces them with authorised
 * images from merchant/affiliate feeds (with licence + attribution stored per image).
 */
import type { ReactNode } from "react";

const G: Record<string, ReactNode> = {
  headphones: (<><path d="M30 70v-8a30 30 0 0 1 60 0v8" /><rect x="24" y="66" width="14" height="26" rx="6" /><rect x="82" y="66" width="14" height="26" rx="6" /></>),
  earbuds: (<><circle cx="44" cy="52" r="12" /><path d="M44 64v22" /><circle cx="76" cy="52" r="12" /><path d="M76 64v22" /><rect x="34" y="88" width="52" height="14" rx="7" /></>),
  speaker: (<><rect x="38" y="24" width="44" height="72" rx="14" /><circle cx="60" cy="72" r="13" /><circle cx="60" cy="42" r="5" /></>),
  tv: (<><rect x="18" y="28" width="84" height="52" rx="4" /><path d="M48 96h24M60 80v16" /></>),
  bulb: (<><path d="M60 22a24 24 0 0 0-14 43c3 3 4 6 4 10h20c0-4 1-7 4-10a24 24 0 0 0-14-43z" /><path d="M50 84h20M52 92h16" /></>),
  phone: (<><rect x="40" y="18" width="40" height="84" rx="8" /><path d="M54 26h12" /><circle cx="60" cy="92" r="3" /></>),
  charger: (<><rect x="38" y="40" width="44" height="50" rx="8" /><path d="M50 40V26M70 40V26" /><path d="M54 62h12" /></>),
  battery: (<><rect x="30" y="34" width="60" height="52" rx="10" /><path d="M58 48l-8 14h12l-8 14" /></>),
  laptop: (<><rect x="28" y="30" width="64" height="44" rx="4" /><path d="M18 84h84l-6 8H24z" /></>),
  monitor: (<><rect x="20" y="24" width="80" height="52" rx="4" /><path d="M60 76v14M42 94h36" /></>),
  gamepad: (<><path d="M34 46h52a14 14 0 0 1 14 14l2 18a10 10 0 0 1-18 6l-8-10H44l-8 10a10 10 0 0 1-18-6l2-18a14 14 0 0 1 14-14z" /><path d="M40 60h12M46 54v12" /><circle cx="76" cy="58" r="3" /><circle cx="84" cy="64" r="3" /></>),
  keyboard: (<><rect x="16" y="40" width="88" height="40" rx="6" /><path d="M26 52h4M38 52h4M50 52h4M62 52h4M74 52h4M86 52h4M30 64h4M42 64h4M54 64h4M66 64h4M78 64h4M38 72h44" /></>),
  coffee: (<><rect x="32" y="22" width="56" height="20" rx="4" /><path d="M36 42v50h48V42" /><path d="M50 60h20v18H50z" /><path d="M46 92h28" /></>),
  kettle: (<><path d="M38 44h40l6 50H32z" /><path d="M46 44c0-10 6-16 12-16s12 6 12 16" /><path d="M84 54l12-6" /></>),
  pot: (<><path d="M24 50h72" /><path d="M30 50v28a12 12 0 0 0 12 12h36a12 12 0 0 0 12-12V50" /><path d="M48 40h24" /><path d="M16 58h14M90 58h14" /></>),
  airfryer: (<><rect x="32" y="22" width="56" height="76" rx="18" /><rect x="40" y="58" width="40" height="28" rx="6" /><circle cx="60" cy="40" r="7" /></>),
  textile: (<><path d="M26 34h68v52H26z" /><path d="M26 48h68M26 62h68M26 76h68" /></>),
  lamp: (<><path d="M36 98h28M50 98V40a18 18 0 0 1 36 0" /><path d="M74 40h24l-6 16H80z" /></>),
  box: (<><path d="M24 46l36-18 36 18-36 18z" /><path d="M24 46v34l36 18 36-18V46M60 64v34" /></>),
  dumbbell: (<><rect x="18" y="44" width="10" height="32" rx="3" /><rect x="30" y="38" width="12" height="44" rx="3" /><rect x="78" y="38" width="12" height="44" rx="3" /><rect x="92" y="44" width="10" height="32" rx="3" /><path d="M42 60h36" /></>),
  shoe: (<><path d="M20 82V58l18-14 10 10 14 4 26 8a12 12 0 0 1 10 12v4z" /><path d="M20 82h78" /><path d="M46 56l6-6M54 60l6-6" /></>),
  watch: (<><rect x="40" y="38" width="40" height="44" rx="10" /><path d="M46 38l4-16h20l4 16M46 82l4 16h20l4-16" /><path d="M60 50v12l8 6" /></>),
  roller: (<><ellipse cx="34" cy="60" rx="10" ry="22" /><path d="M34 38h52M34 82h52" /><ellipse cx="86" cy="60" rx="10" ry="22" /></>),
  tent: (<><path d="M14 92L60 26l46 66z" /><path d="M60 26v66M50 92l10-24 10 24" /></>),
  backpack: (<><rect x="34" y="34" width="52" height="64" rx="14" /><path d="M48 34v-6a12 12 0 0 1 24 0v6" /><rect x="44" y="64" width="32" height="20" rx="4" /></>),
  bottle: (<><rect x="44" y="18" width="32" height="12" rx="3" /><path d="M42 36h36v56a8 8 0 0 1-8 8H50a8 8 0 0 1-8-8z" /><path d="M42 54h36" /></>),
  bikelight: (<><rect x="22" y="46" width="34" height="24" rx="8" /><path d="M56 52l12-6M56 64l12 6M56 58h14" /><rect x="78" y="48" width="20" height="20" rx="6" /></>),
  beans: (<><path d="M36 26h48l6 72H30z" /><ellipse cx="52" cy="62" rx="7" ry="10" /><ellipse cx="68" cy="66" rx="7" ry="10" /><path d="M36 38h48" /></>),
  oil: (<><path d="M52 18h16v14H52z" /><path d="M48 32h24l8 18v42a6 6 0 0 1-6 6H46a6 6 0 0 1-6-6V50z" /><path d="M46 62h28v20H46z" /></>),
  tablets: (<><rect x="26" y="34" width="68" height="52" rx="8" /><rect x="38" y="46" width="18" height="12" rx="3" /><rect x="64" y="46" width="18" height="12" rx="3" /><rect x="38" y="64" width="18" height="12" rx="3" /><rect x="64" y="64" width="18" height="12" rx="3" /></>),
};

export function ProductArt({
  art,
  hue,
  label,
  className = "",
  size = "md",
}: {
  art: string;
  hue: number;
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const id = `g-${art}-${hue}`;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`Illustration of ${label} (demo artwork, not a product photo)`} className="h-full w-full">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={`hsl(${hue} 85% 96%)`} />
            <stop offset="1" stopColor={`hsl(${(hue + 30) % 360} 70% 88%)`} />
          </linearGradient>
        </defs>
        <rect width="120" height="120" fill={`url(#${id})`} />
        <circle cx="96" cy="22" r="30" fill={`hsl(${hue} 90% 99% / 0.6)`} />
        <g fill="none" stroke={`hsl(${hue} 55% 32%)`} strokeWidth={size === "sm" ? 3.2 : 2.6} strokeLinecap="round" strokeLinejoin="round">
          {G[art] ?? G.box}
        </g>
      </svg>
      {size !== "sm" && (
        <span className="absolute bottom-2 left-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#53389e]">
          Demo illustration
        </span>
      )}
    </div>
  );
}
