"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * The design's fx.js: a drifting glow, a scroll progress bar, and headings,
 * paragraphs and cards rising into view as they are scrolled to. Marks use
 * data attributes rather than classes so a React re-render never strips
 * them (and never leaves a revealed element hidden).
 */
const SEL = "main h1, main h2, main p, main [data-fx], footer";

export default function Fx() {
  const pathname = usePathname();

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

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          (e.target as HTMLElement).dataset.flin = "";
          io.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const scan = (root: ParentNode) => {
      const list: HTMLElement[] = [];
      if (root instanceof HTMLElement && root.matches(SEL)) list.push(root);
      root.querySelectorAll<HTMLElement>(SEL).forEach((el) => list.push(el));
      list.forEach((el) => {
        if ("flr" in el.dataset || el.closest("header, nav, [data-nofx]")) return;
        const parent = el.parentElement?.closest<HTMLElement>(SEL);
        if (parent && !/^H[12]$/.test(el.tagName)) return;
        const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => "flr" in (c as HTMLElement).dataset) : [];
        el.style.transitionDelay = `${Math.min(sibs.length, 5) * 70}ms`;
        el.dataset.flr = "";
        el.addEventListener("transitionend", () => (el.style.transitionDelay = ""), { once: true });
        io.observe(el);
      });
    };
    scan(document.body);
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n as HTMLElement))));
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [pathname]);

  return null;
}
