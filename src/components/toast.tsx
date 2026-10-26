"use client";

import { useSyncExternalStore } from "react";
import { X } from "./icons";
import { useT } from "./i18n-provider";

/** Small, dismissible, non-blocking notices. No modal popups. */
interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const EMPTY: Toast[] = [];

export function toast(text: string, tone: Toast["tone"] = "info") {
  // Duplicate suppression: don't stack the same message.
  if (toasts.some((t) => t.text === text)) return;
  const id = ++seq;
  toasts = [...toasts.slice(-2), { id, text, tone }];
  emit();
  setTimeout(() => dismiss(id), 4500);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const tr = useT();
  const items = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => EMPTY,
  );
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] md:bottom-4 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lift ${
            t.tone === "error" ? "border-error/30 bg-error-soft text-error-ink" : t.tone === "success" ? "border-success/30 bg-success-soft text-success-ink" : "border-line bg-surface text-ink"
          }`}
        >
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label={tr("common.dismiss")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
