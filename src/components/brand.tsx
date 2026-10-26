import Link from "next/link";

/** PriceViva globe mark (also used as the favicon: src/app/icon.svg). */
export function BrandMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pv-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6cf0" />
          <stop offset="1" stopColor="#1449c2" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#pv-mark)" />
      <g fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round">
        <circle cx="32" cy="32" r="17" />
        <path d="M15 32h34M32 15c-7 6-7 28 0 34M32 15c7 6 7 28 0 34" />
      </g>
    </svg>
  );
}

export function Logo({ tagline = true, inverted = false }: { tagline?: boolean; inverted?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="PriceViva home">
      <BrandMark className="h-10 w-10 sm:h-11 sm:w-11" />
      <span className="leading-none">
        <span className={`pv-display block text-[1.6rem] font-extrabold tracking-tight sm:text-[1.85rem] ${inverted ? "text-white" : "text-navy dark:text-ink"}`}>
          Price<span className={inverted ? "text-[#9ab8ff]" : "text-primary"}>Viva</span>
        </span>
        {tagline && (
          <span className={`mt-1 hidden text-[0.72rem] font-medium tracking-wide sm:block lg:hidden xl:block ${inverted ? "text-white/70" : "text-muted"}`}>
            Discover More. Compare Better.
          </span>
        )}
      </span>
    </Link>
  );
}
