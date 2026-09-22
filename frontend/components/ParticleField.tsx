"use client";

import { useEffect, useRef } from "react";

// Sparse and quiet on purpose: this sits behind running text on most
// screens (paragraphs have no opaque backdrop of their own), so it has to
// read as a few drifting flecks, not a grain/noise filter over the copy.
const COUNT = 2200;

/**
 * Full-viewport ambient particle field: fine dark grains slowly orbiting,
 * like dust settling over a case file — the "Paper & Ink Atelier" recipe
 * (light background, dark grains, normal blending, cursor stirs them
 * outward) adapted to FraudLens's own tokens instead of a hardcoded theme.
 *
 * Decorative only: the canvas sits at z-index 0 behind `.app-shell` (z-index
 * 1, see globals.css) and is aria-hidden + pointer-events:none. If `three`
 * fails to load, WebGL is unavailable, or prefers-reduced-motion is set, no
 * canvas is ever created — the flat `--color-page` background (the
 * pre-existing look) is the fallback, not a broken page.
 */
export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let running = true;
    const disposers: Array<() => void> = [];

    (async () => {
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        return; // decorative only: the page already works without it
      }
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
        });
      } catch {
        return; // e.g. WebGL unavailable/blocked
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(0, 0, 14);

      // Read the live design token so the grain colour always matches the
      // current theme instead of a value hardcoded here.
      const inkHex =
        getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim() || "#15181c";

      const aspect0 = window.innerWidth / window.innerHeight;
      const spreadX = 11 * Math.max(1, aspect0);
      const spreadY = 11 * Math.max(1, 1 / aspect0);

      const positions = new Float32Array(COUNT * 3);
      const radius = new Float32Array(COUNT);
      const angle = new Float32Array(COUNT);
      const speed = new Float32Array(COUNT);
      const cx = new Float32Array(COUNT);
      const cy = new Float32Array(COUNT);
      const cz = new Float32Array(COUNT);
      const stirX = new Float32Array(COUNT);
      const stirY = new Float32Array(COUNT);

      // Deterministic per-particle pseudo-randomness (no Math.random in a
      // loop that could ever run during server render — this component is
      // client-only anyway, but the habit avoids hydration foot-guns).
      const hash = (i: number, salt: number) => {
        const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };

      for (let i = 0; i < COUNT; i++) {
        cx[i] = (hash(i, 1) - 0.5) * spreadX;
        cy[i] = (hash(i, 2) - 0.5) * spreadY;
        cz[i] = (hash(i, 3) - 0.5) * 8;
        radius[i] = 0.2 + hash(i, 4) * 1.6;
        angle[i] = hash(i, 5) * Math.PI * 2;
        speed[i] = 0.08 + hash(i, 6) * 0.12;
        positions[i * 3] = cx[i];
        positions[i * 3 + 1] = cy[i];
        positions[i * 3 + 2] = cz[i];
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const posAttr = geometry.attributes.position as InstanceType<typeof THREE.BufferAttribute>;

      const material = new THREE.PointsMaterial({
        color: new THREE.Color(inkHex),
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.NormalBlending, // light theme: dark grains, not an additive glow
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      function resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      resize();
      window.addEventListener("resize", resize);
      disposers.push(() => window.removeEventListener("resize", resize));

      // ---- Reactivity: scroll velocity, scroll progress, pointer stir ----
      let lastScrollY = window.scrollY;
      let scrollVel = 0;
      const pointer = { x: 9999, y: 9999, active: false };
      const ndcVec = new THREE.Vector3();

      function onPointerMove(e: PointerEvent) {
        const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
        const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
        ndcVec.set(ndcX, ndcY, 0.5).unproject(camera);
        const dir = ndcVec.sub(camera.position).normalize();
        if (Math.abs(dir.z) < 0.001) return;
        const t = -camera.position.z / dir.z;
        pointer.x = camera.position.x + dir.x * t;
        pointer.y = camera.position.y + dir.y * t;
        pointer.active = true;
      }
      function onPointerLeave() {
        pointer.active = false;
      }
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
      disposers.push(() => window.removeEventListener("pointermove", onPointerMove));
      disposers.push(() => window.removeEventListener("pointerleave", onPointerLeave));

      let last = performance.now();
      function onVisibility() {
        if (!document.hidden) last = performance.now();
      }
      document.addEventListener("visibilitychange", onVisibility);
      disposers.push(() => document.removeEventListener("visibilitychange", onVisibility));

      let rafId = 0;
      function frame(now: number) {
        if (!running) return;
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (document.hidden) return;

        const dy = window.scrollY - lastScrollY;
        lastScrollY = window.scrollY;
        const v = dy / Math.max(dt, 0.001);
        scrollVel += (v - scrollVel) * Math.min(1, dt * 4);
        const boost = 1 + Math.min(2, Math.abs(scrollVel) / 800);

        const arr = posAttr.array as Float32Array;
        for (let i = 0; i < COUNT; i++) {
          angle[i] += speed[i] * dt * boost;
          const x = cx[i] + Math.cos(angle[i]) * radius[i];
          const y = cy[i] + Math.sin(angle[i]) * radius[i] * 0.7;
          const z = cz[i] + Math.sin(angle[i] * 0.5) * 0.3;

          if (pointer.active) {
            const ddx = x - pointer.x;
            const ddy = y - pointer.y;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy);
            const falloff = Math.max(0, 1 - dist / 2.4);
            if (falloff > 0) {
              stirX[i] += ddx * falloff * 3.6 * dt;
              stirY[i] += ddy * falloff * 3.6 * dt;
            }
          }
          const decay = Math.min(1, dt * 1.4);
          stirX[i] -= stirX[i] * decay;
          stirY[i] -= stirY[i] * decay;

          arr[i * 3] = x + stirX[i];
          arr[i * 3 + 1] = y + stirY[i];
          arr[i * 3 + 2] = z;
        }
        posAttr.needsUpdate = true;

        // One slow, deliberate signature motion: the whole field eases into
        // a gentle tilt as the page is read, tied to scroll progress.
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
        points.rotation.z = progress * 0.12;

        renderer.render(scene, camera);
      }
      rafId = requestAnimationFrame(frame);
      disposers.push(() => cancelAnimationFrame(rafId));

      disposers.push(() => {
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      });
    })();

    return () => {
      disposed = true;
      running = false;
      disposers.forEach((dispose) => dispose());
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
