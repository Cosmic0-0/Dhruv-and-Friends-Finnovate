"use client";

import { useEffect, useRef } from "react";

/**
 * Minimal scroll parallax: the element drifts a little slower than the page.
 *
 * Deliberately small (a few px per 100px of scroll) and capped, so it reads as
 * depth rather than as the layout coming apart. It writes a CSS variable
 * instead of setting transform directly, so the element keeps whatever
 * transform its own classes give it (see .parallax in globals.css).
 *
 * Does nothing under prefers-reduced-motion, and nothing on the server.
 */
export function useParallax<T extends HTMLElement>(strength = 0.12, max = 28) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const apply = () => {
      frame = 0;
      // Positive scroll pushes the hero down slightly, so it lags the page.
      const drift = Math.min(max, window.scrollY * strength);
      el.style.setProperty("--parallax", `${drift.toFixed(1)}px`);
    };
    const onScroll = () => {
      // One write per frame; scroll fires far more often than that.
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      el.style.removeProperty("--parallax");
    };
  }, [strength, max]);

  return ref;
}
