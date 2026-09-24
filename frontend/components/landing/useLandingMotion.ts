"use client";

import { useEffect, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const DESKTOP = "(min-width: 64rem) and (prefers-reduced-motion: no-preference)";
const MOBILE = "(max-width: 63.999rem) and (prefers-reduced-motion: no-preference)";

/**
 * The landing's scroll choreography. The markup is complete without it: every
 * initial "hidden" state is set here with gsap.set, so no JavaScript, reduced
 * motion or a failed bundle all leave a fully readable page.
 *
 * Elements opt in with data attributes (data-tone, data-hero-word, data-mark,
 * ...), which keeps the section components free of animation code.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>, header: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let lenis: Lenis | null = null;
    const tick = (time: number) => lenis?.raf(time * 1000);
    if (!reduced) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    const stopTone = trackHeaderTone(el, header.current);
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add(DESKTOP, () => {
        heroParallax(el);
        scanScene(el, true);
        sharedScenes(el);
      });
      mm.add(MOBILE, () => {
        scanScene(el, false);
        sharedScenes(el);
      });
    }, el);

    // Fonts and images change section heights after first layout.
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh).catch(() => undefined);

    return () => {
      stopTone();
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  }, [root, header]);
}

/**
 * The fixed header takes the tone of whatever panel is under it. Measured on
 * every scroll frame rather than with triggers, so it stays right while the
 * scan scene is pinned and the page below it shifts.
 */
function trackHeaderTone(el: HTMLElement, header: HTMLElement | null): () => void {
  if (!header) return () => undefined;
  const sections = Array.from(el.querySelectorAll<HTMLElement>("section[data-tone]"));
  const probe = header.offsetHeight / 2;
  const update = () => {
    const under = sections.find((sec) => {
      const r = sec.getBoundingClientRect();
      return r.top <= probe && r.bottom > probe;
    });
    header.dataset.tone = under?.dataset.tone ?? "ink";
    header.dataset.scrolled = window.scrollY > 24 ? "true" : "false";
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  return () => window.removeEventListener("scroll", update);
}

function heroParallax(el: HTMLElement) {
  const hero = el.querySelector("[data-hero]");
  if (!hero) return;
  const scrub = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
  gsap.to("[data-hero-word]", { yPercent: -18, ease: "none", scrollTrigger: scrub });
  gsap.to("[data-hero-scanner]", { rotate: 60, scale: 1.12, ease: "none", scrollTrigger: scrub });
  gsap.to("[data-checker]", { yPercent: -30, opacity: 0.2, ease: "none", scrollTrigger: { ...scrub, start: "30% top" } });
}

/** The example check: highlights sweep over the SMS, callouts land, the verdict stamps down. */
function scanScene(el: HTMLElement, pin: boolean) {
  const scan = el.querySelector<HTMLElement>("[data-scan]");
  if (!scan) return;

  gsap.fromTo(
    scan,
    { clipPath: "polygon(0 9%, 100% 0%, 100% 100%, 0 100%)" },
    { clipPath: "polygon(0 0%, 100% 0%, 100% 100%, 0 100%)", ease: "none", scrollTrigger: { trigger: scan, start: "top bottom", end: "top top", scrub: true } }
  );

  const marks = gsap.utils.toArray<HTMLElement>("[data-mark]", scan);
  const calls = gsap.utils.toArray<HTMLElement>("[data-call]", scan);
  gsap.set(marks, { backgroundSize: "0% 100%" });
  gsap.set(calls, { autoAlpha: 0, y: 24 });
  gsap.set("[data-verdict]", { autoAlpha: 0, scale: 1.25 });
  gsap.set("[data-action]", { autoAlpha: 0, y: 30 });
  gsap.set("[data-phone]", { y: 80 });

  const tl = gsap.timeline({
    defaults: { ease: "power3.out" },
    scrollTrigger: pin
      ? { trigger: scan, start: "top top", end: "+=180%", pin: true, scrub: 0.6, anticipatePin: 1 }
      : { trigger: scan, start: "top 60%", toggleActions: "play none none reverse" },
  });
  tl.to("[data-phone]", { y: 0, duration: 1 });
  marks.forEach((mark, i) => {
    tl.to(mark, { backgroundSize: "100% 100%", duration: 0.8, ease: "power2.inOut" }, i === 0 ? ">-0.2" : ">");
    if (calls[i]) tl.to(calls[i], { autoAlpha: 1, y: 0, duration: 0.6 }, "<0.3");
  });
  tl.to("[data-verdict]", { autoAlpha: 1, scale: 1, duration: 0.6, ease: "power4.out" }, ">0.1");
  tl.to("[data-action]", { autoAlpha: 1, y: 0, duration: 0.6 }, ">-0.2");
}

function sharedScenes(el: HTMLElement) {
  // Manifesto: each word brightens as the reader reaches it.
  const words = gsap.utils.toArray<HTMLElement>("[data-word]", el);
  if (words.length) {
    gsap.fromTo(
      words,
      { opacity: 0.14 },
      { opacity: 1, stagger: 0.08, ease: "none", scrollTrigger: { trigger: "[data-manifesto]", start: "top 75%", end: "bottom 60%", scrub: true } }
    );
  }

  gsap.from("[data-step]", {
    y: 50,
    autoAlpha: 0,
    duration: 0.9,
    stagger: 0.14,
    ease: "power3.out",
    scrollTrigger: { trigger: "[data-steps]", start: "top 82%" },
  });

  gsap.fromTo(
    "[data-marquee]",
    { xPercent: 0 },
    { xPercent: -30, ease: "none", scrollTrigger: { trigger: "[data-ext]", start: "top bottom", end: "bottom top", scrub: true } }
  );
  gsap.from("[data-chip]", {
    y: 70,
    autoAlpha: 0,
    duration: 0.9,
    stagger: 0.12,
    ease: "power3.out",
    scrollTrigger: { trigger: "[data-chips]", start: "top 80%" },
  });

  gsap.from("[data-outro-word]", {
    yPercent: 30,
    autoAlpha: 0,
    duration: 1.1,
    ease: "power4.out",
    scrollTrigger: { trigger: "[data-outro]", start: "top 70%" },
  });
  gsap.to("[data-seal]", { rotate: 90, ease: "none", scrollTrigger: { trigger: "[data-outro]", start: "top bottom", end: "bottom bottom", scrub: true } });
}
