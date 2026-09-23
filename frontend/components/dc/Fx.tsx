"use client";

import { useEffect } from "react";

/**
 * The design's fx.js: a drifting glow and a scroll progress bar. The
 * rise-into-view reveal is pure CSS (scroll-driven animation in globals.css),
 * so content is visible by default and a client-side navigation can never
 * leave it hidden.
 */

export default function Fx() {
  useEffect(() => {
    const glow = document.createElement("div");
    glow.className = "fl-glow";
    const bar = document.createElement("div");
    bar.className = "fl-progress";
    document.body.append(glow, bar);
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      glow.style.transform = `translate(-50%, ${y * -0.18}px)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      glow.remove();
      bar.remove();
    };
  }, []);

  return null;
}
