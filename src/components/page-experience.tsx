"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useT } from "./i18n-provider";

/** Lightweight site-wide navigation feedback; no simulated activity or tracking. */
export function PageExperience() {
  const t = useT();
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
        setShowTop(window.scrollY > 520);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return (
    <>
      <div aria-hidden="true" className="pa-scroll-track"><div className="pa-scroll-fill" style={{ width: `${progress}%` }} /></div>
      <button
        type="button"
        aria-label={t("common.backToTop")}
        title={t("common.backToTop")}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}
        className={`pa-back-to-top ${showTop ? "pa-back-to-top-visible" : ""}`}
        tabIndex={showTop ? 0 : -1}
      ><ArrowUp size={19} aria-hidden="true" /></button>
    </>
  );
}
