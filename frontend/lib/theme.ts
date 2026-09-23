/**
 * Theme preference: light or dark. Dark is the Claude Design default; a
 * choice stamps data-theme on <html>, which globals.css maps to the --dc-*
 * palette. "system" is still accepted from older saved values and follows
 * the device.
 */

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "fraudlens.theme.v1";

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "system" || v === "light" || v === "dark";
}

export function loadTheme(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return isThemeChoice(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

/**
 * Stamp the choice on <html>, and keep the theme-color meta in step so the
 * iOS status bar and the Android chrome match the page rather than the OS.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  const resolved =
    choice === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
  root.setAttribute("data-theme", resolved);

  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  // The two media-scoped metas in layout.tsx cannot express an override, so a
  // single managed one takes over once a choice exists.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-managed]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute("data-managed", "");
    document.head.appendChild(meta);
  }
  meta.content = dark ? "#000000" : "#F4F4F6";
}

/**
 * Runs before first paint (inlined in layout.tsx), so a saved dark choice does
 * not flash a light screen first. Kept as a string because it has to be a
 * plain <script>, not React.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
