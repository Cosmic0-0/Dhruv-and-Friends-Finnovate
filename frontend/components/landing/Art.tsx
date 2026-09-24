/**
 * Landing artwork: the brand mark and the flat "object" illustrations for the
 * tool grid. Decorative only (aria-hidden); every one is inline SVG, so the
 * page ships no image requests for them and they recolour with the theme.
 */

const INK = "#0D0D0C";
const CREAM = "#F6F1E4";
const BUTTER = "#F2D54E";
const SCAM = "#FF4A2E";
const SAFE = "#2FBF6A";

/** A lens made of four merging dots: the preloader and header mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="17" cy="17" r="11" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="17" cy="17" r="3.2" />
      <path d="M25 25 L34 34" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A scanner: range rings, crosshair ticks and a sweeping arm with three
 * marked contacts. The hero's and outro's security motif; the sweep rotates
 * when the caller passes a spinning class.
 */
export function Scanner({ className, sweepClassName }: { className?: string; sweepClassName?: string }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true" fill="none" stroke="currentColor">
      <defs>
        <linearGradient id="fl-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".28" />
        </linearGradient>
      </defs>
      {[190, 140, 90, 40].map((r) => (
        <circle key={r} cx="200" cy="200" r={r} strokeWidth="1.5" opacity={r === 190 ? 1 : 0.5} />
      ))}
      <path d="M200 0 V400 M0 200 H400" strokeWidth="1" opacity=".35" />
      {ticks.map((a) => (
        <line key={a} x1="200" y1="6" x2="200" y2={a % 90 === 0 ? 26 : 16} strokeWidth="2" transform={`rotate(${a} 200 200)`} />
      ))}
      <g className={sweepClassName} style={{ transformOrigin: "200px 200px" }}>
        <path d="M200 200 L390 200 A190 190 0 0 0 334 66 Z" fill="url(#fl-sweep)" stroke="none" />
        <line x1="200" y1="200" x2="390" y2="200" strokeWidth="2.5" />
      </g>
      <circle cx="200" cy="200" r="6" fill="currentColor" stroke="none" />
      <g stroke="none" fill="currentColor">
        <circle cx="286" cy="128" r="7" />
        <circle cx="120" cy="262" r="5" />
        <rect x="248" y="262" width="12" height="12" transform="rotate(45 254 268)" />
      </g>
      <circle cx="286" cy="128" r="16" strokeWidth="2" />
    </svg>
  );
}

/** A small crosshair used between marquee items. */
export function Crosshair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3">
      <circle cx="20" cy="20" r="11" />
      <path d="M20 2 V12 M20 28 V38 M2 20 H12 M28 20 H38" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowIcon({ className, direction = "right" }: { className?: string; direction?: "right" | "down" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {direction === "right" ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M12 4v16M6 14l6 6 6-6" />}
    </svg>
  );
}

/** Tool art: a bank card, a transfer arrow and a payee check. */
export function PayArt() {
  return (
    <svg viewBox="0 0 260 260" aria-hidden="true" style={{ width: "100%", display: "block", overflow: "visible" }}>
      <ellipse cx="130" cy="246" rx="96" ry="9" fill={INK} opacity=".18" />
      <g transform="rotate(-10 130 120)">
        <rect x="30" y="60" width="200" height="126" rx="18" fill={INK} />
        <rect x="30" y="86" width="200" height="22" fill="#2B2A26" />
        <rect x="48" y="126" width="36" height="26" rx="6" fill={BUTTER} />
        <rect x="100" y="132" width="70" height="8" rx="4" fill={CREAM} opacity=".7" />
        <rect x="100" y="148" width="44" height="8" rx="4" fill={CREAM} opacity=".4" />
        <circle cx="196" cy="160" r="12" fill={SCAM} opacity=".9" />
        <circle cx="210" cy="160" r="12" fill={BUTTER} opacity=".9" />
      </g>
      <g transform="translate(150 150)">
        <rect x="0" y="0" width="100" height="70" rx="16" fill={CREAM} stroke={INK} strokeWidth="5" />
        <rect x="14" y="16" width="52" height="7" rx="3.5" fill={INK} opacity=".55" />
        <rect x="14" y="30" width="34" height="7" rx="3.5" fill={INK} opacity=".35" />
        <circle cx="76" cy="46" r="13" fill={SAFE} />
        <path d="M70 46 l4 4 l8 -9" fill="none" stroke={CREAM} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M40 216 C 80 236, 120 236, 150 210" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
    </svg>
  );
}

/** Tool art: a document with a pasted-on signature under a lens. */
export function DocArt() {
  return (
    <svg viewBox="0 0 240 280" aria-hidden="true" style={{ width: "100%", display: "block", overflow: "visible" }}>
      <ellipse cx="120" cy="268" rx="84" ry="9" fill={INK} opacity=".18" />
      <g transform="rotate(4 120 130)">
        <rect x="40" y="16" width="160" height="220" rx="12" fill={CREAM} stroke={INK} strokeWidth="5" />
        <rect x="60" y="42" width="80" height="10" rx="5" fill={INK} />
        {[70, 86, 102, 118, 134].map((y, i) => (
          <rect key={y} x="60" y={y} width={i % 2 ? 96 : 120} height="7" rx="3.5" fill={INK} opacity=".3" />
        ))}
        <rect x="118" y="168" width="68" height="40" rx="4" fill="#FFF" stroke={SCAM} strokeWidth="3" strokeDasharray="5 4" />
        <path d="M126 196 c8 -18 14 6 22 -8 s10 10 18 -4 s8 6 14 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(150 150)">
        <circle cx="0" cy="0" r="38" fill={BUTTER} fillOpacity=".35" stroke={INK} strokeWidth="8" />
        <path d="M27 27 L58 58" stroke={INK} strokeWidth="12" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Tool art: a chat thread where the story turns to money. */
export function ChatArt() {
  return (
    <svg viewBox="0 0 240 260" aria-hidden="true" style={{ width: "100%", display: "block", overflow: "visible" }}>
      <ellipse cx="120" cy="248" rx="84" ry="9" fill={INK} opacity=".18" />
      <rect x="24" y="20" width="132" height="42" rx="16" fill={CREAM} stroke={INK} strokeWidth="5" />
      <rect x="40" y="36" width="80" height="8" rx="4" fill={INK} opacity=".4" />
      <rect x="84" y="76" width="132" height="42" rx="16" fill={INK} />
      <rect x="100" y="92" width="84" height="8" rx="4" fill={CREAM} opacity=".6" />
      <rect x="24" y="132" width="150" height="54" rx="16" fill={CREAM} stroke={SCAM} strokeWidth="5" />
      <rect x="40" y="148" width="96" height="8" rx="4" fill={SCAM} opacity=".75" />
      <rect x="40" y="164" width="64" height="8" rx="4" fill={INK} opacity=".4" />
      <circle cx="190" cy="176" r="24" fill={SCAM} />
      <text x="190" y="185" textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fontSize="24" fontWeight="700" fill={CREAM}>Rs</text>
      <path d="M40 210 H200" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
    </svg>
  );
}
