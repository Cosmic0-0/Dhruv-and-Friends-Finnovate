/** Inline stroke icons (24x24), so there's no icon-library dependency. */

type IconProps = { className?: string; strokeWidth?: number };

function Svg({ className, strokeWidth = 1.75, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

export function ImageIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.75" />
      <path d="m21 15-4.5-4.5L6 21" />
    </Svg>
  );
}

export function InfoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Svg>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m22 2-7 20-4-9-9-4 20-7z" />
      <path d="M22 2 11 13" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function BookIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5v-2z" />
      <path d="M8 7h8" />
    </Svg>
  );
}

export function TrendIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Svg>
  );
}

export function LayersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </Svg>
  );
}

export function RetryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </Svg>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function FlagIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 22V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </Svg>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </Svg>
  );
}

export function XIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`animate-spin ${className ?? ""}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/*
 * Icons introduced by the iPhone redesign. Every path below is copied
 * verbatim from the approved mockups (frontend/design/mockup/*.html), so the
 * shipped screens match the rendered PNGs exactly. Deliberately not an icon
 * library: the mockup already specifies the geometry, and inline paths keep
 * the offline PWA free of another dependency.
 */

/** Clipboard, on the hero's "Paste & check" button (Main.html). */
export function ClipboardIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2} {...p}>
      <rect x="6" y="4.5" width="12" height="16" rx="2.5" />
      <path d="M9.5 4.5h5v2.5h-5z" />
    </Svg>
  );
}

/** Tab bar: Check (Main.html). */
export function HomeIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2.3} {...p}>
      <path d="M4 11l8-6.5 8 6.5v8.5a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

/** Tab bar: Learn (Main.html). */
export function GridIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
    </Svg>
  );
}

/** Tab bar: the centre primary button (Main.html). */
export function PlusIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

/** Tab bar: Radar (Main.html). */
export function ChartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20V4M4 20h16" />
      <path d="M7.5 15l4-4.5 3 3L20 7.5" />
    </Svg>
  );
}

/** Tab bar: Settings and language (Main.html). */
export function PersonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </Svg>
  );
}

/** Scam verdict marker in the Recent list (Main.html). */
export function ArrowDownLeftIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2} {...p}>
      <path d="M16.5 7.5l-9 9M7.5 9.5v7h7" />
    </Svg>
  );
}

/** "Be careful" verdict marker, and the hero's warning-signs stat (Main.html). */
export function WarningIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2} {...p}>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4M12 17v.3" />
    </Svg>
  );
}

/** The hero's "Link made" stat (Result-Scam.html). */
export function LinkChainIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2} {...p}>
      <path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1" />
    </Svg>
  );
}

/** Row chevron, e.g. the "About to pay someone?" row under the hero. */
export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2.2} {...p}>
      <path d="M9.5 5.5L16 12l-6.5 6.5" />
    </Svg>
  );
}

/** Share sheet glyph, for the iOS "Add to Home Screen" instructions. */
export function ShareIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2} {...p}>
      <path d="M12 3.5v11" />
      <path d="M8.5 7L12 3.5 15.5 7" />
      <path d="M6 12.5v6a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-6" />
    </Svg>
  );
}
