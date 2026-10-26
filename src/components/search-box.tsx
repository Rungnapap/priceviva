"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { departments } from "@/data/departments";
import { normalize } from "@/lib/search";
import { Camera, Search } from "./icons";
import { PhotoSearchDialog } from "./photo-search";
import { useT } from "./i18n-provider";

interface Option {
  id: string;
  label: string;
  hint: string;
  href: string;
}

/** Accessible combobox (ARIA 1.2 pattern) with server-side product suggestions from /api/search/suggest. */
/** size "hero" = the large homepage search, "lg" = header, "md" = default. */
export function SearchBox({
  initial = "",
  className = "",
  size = "md",
  placeholder,
  quietCamera = false,
  placeholderFrom = "",
}: {
  initial?: string;
  className?: string;
  size?: "md" | "lg" | "hero";
  placeholder?: string;
  /** Muted camera icon, so photo search stays available without competing with the main search. */
  quietCamera?: boolean;
  /** "sm": hide the placeholder on phones, where the page shows the same question as a visible line above the box. */
  placeholderFrom?: "" | "sm";
}) {
  const S = {
    md: { input: "h-11 pl-10 pr-[8.5rem] text-sm", icon: "left-3.5 h-4 w-4", btn: "h-8 px-4 text-sm", cam: "h-8 w-8", camIcon: "h-4 w-4" },
    lg: { input: "h-12 pl-12 pr-40 text-[15px]", icon: "left-4 h-5 w-5", btn: "h-9 px-6 text-sm", cam: "h-9 w-9", camIcon: "h-5 w-5" },
    hero: { input: "h-14 pl-12 pr-[8.75rem] text-base sm:h-16 sm:pl-14 sm:pr-48 sm:text-lg xl:h-[4.25rem]", icon: "left-4 h-5 w-5 sm:left-5 sm:h-6 sm:w-6", btn: "h-11 px-5 text-base sm:h-12 sm:px-8", cam: "h-11 w-11 sm:h-12 sm:w-12", camIcon: "h-5 w-5 sm:h-6 sm:w-6" },
  }[size];
  const router = useRouter();
  const tr = useT();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [photoOpen, setPhotoOpen] = useState(false);

  const [remote, setRemote] = useState<{ term: string; items: Option[] }>({ term: "", items: [] });

  // Debounced product suggestions (only real catalogue entries are ever suggested).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items: { slug: string; label: string; hint: string }[] }) =>
          setRemote({ term, items: d.items.map((x) => ({ id: `p-${x.slug}`, label: x.label, hint: x.hint, href: `/product/${x.slug}` })) }),
        )
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const options = useMemo<Option[]>(() => {
    const term = q.trim();
    if (term.length < 2) return [];
    const nq = normalize(term);
    const depts = departments
      .filter((d) => normalize(d.name).includes(nq))
      .slice(0, 2)
      .map((d) => ({ id: `d-${d.slug}`, label: d.name, hint: tr("search.department"), href: `/departments/${d.slug}` }));
    return [...depts, ...(remote.term === term ? remote.items : [])];
  }, [q, remote, tr]);

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    router.push(href);
  };

  const submit = () => {
    const opt = active >= 0 ? options[active] : undefined;
    if (opt) return go(opt.href);
    const term = q.trim();
    go(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  };

  const expanded = open && options.length > 0;

  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        {tr("search.label")}
      </label>
      <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${S.icon}`} aria-hidden="true" />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && options[active] ? `${listId}-${options[active]!.id}` : undefined}
        autoComplete="off"
        value={q}
        placeholder={placeholder ?? tr("search.placeholder")}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        className={`w-full rounded-full border border-line bg-surface text-ink shadow-card ${placeholderFrom === "sm" ? "placeholder:text-transparent sm:placeholder:text-muted" : "placeholder:text-muted"} focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 ${S.input}`}
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <button
          type="button"
          aria-label={tr("search.photo")}
          title={tr("search.photo")}
          aria-haspopup="dialog"
          onClick={() => setPhotoOpen(true)}
          className={`flex items-center justify-center rounded-full ${quietCamera ? "text-muted hover:text-primary" : "text-primary"} hover:bg-primary-soft ${S.cam}`}
        >
          <Camera className={S.camIcon} aria-hidden="true" />
        </button>
        <button type="submit" className={`rounded-full bg-primary font-semibold text-white hover:bg-primary-hover ${S.btn}`}>
          {tr("search.button")}
        </button>
      </div>
      <ul
        id={`${listId}-list`}
        role="listbox"
        aria-label={tr("search.suggestions")}
        hidden={!expanded}
        className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-lift"
      >
        {options.map((o, i) => (
          <li
            key={o.id}
            id={`${listId}-${o.id}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              go(o.href);
            }}
            onMouseEnter={() => setActive(i)}
            className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${i === active ? "bg-primary-soft" : ""}`}
          >
            <span className="truncate font-medium text-ink">{o.label}</span>
            <span className="shrink-0 text-xs text-muted">{o.hint}</span>
          </li>
        ))}
      </ul>
      {/* Portalled to <body>: the dialog has its own forms, which must not be nested in this search form. */}
      {photoOpen && createPortal(<PhotoSearchDialog onClose={() => setPhotoOpen(false)} />, document.body)}
    </form>
  );
}
