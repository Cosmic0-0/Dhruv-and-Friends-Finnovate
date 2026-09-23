import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SideNav from "@/components/SideNav";
import TabBar from "@/components/TabBar";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * One webfont, for the app's own voice.
 *
 * Instrument Sans is a humanist grotesque: enough personality to stop the UI
 * reading as a default system-font utility, and clean diacritics for Kreol and
 * French. next/font self-hosts it, so the PWA still works offline and nothing
 * is fetched from Google at runtime.
 *
 * The message bubble deliberately does NOT use it. A received SMS is rendered
 * in the system font, because that is the face it actually arrived in on the
 * user's phone. The app never sets the scammer's words in its own type.
 */
const instrument = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const TITLE = "FraudLens AI: check a message before you pay";
const DESCRIPTION =
  "Paste a suspicious SMS or message and see the scam warning signs: sender mismatch, urgency, lookalike links. Built for Mauritius, in English, French and Kreol.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · FraudLens AI" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  applicationName: "FraudLens AI",
  // "default" (not black-translucent): the top of every screen is the light
  // page colour, where translucent would leave the status bar text invisible.
  appleWebApp: { capable: true, title: "FraudLens", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "FraudLens AI",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_MU",
    alternateLocale: ["fr_MU"],
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "FraudLens AI" }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // One per scheme, matching the page colour behind the status bar in each
  // (globals.css --c-page), so the bar never reads as a separate strip.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F3" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0C0D" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={instrument.variable}>
      <head>
        {/* Applies a saved light/dark choice before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <LanguageProvider>
          {/* One row at md+: navigation rail beside the app column. Below md
              the frame is a plain block and the column is the whole layout. */}
          <div className="app-frame">
            <SideNav />
            <div className="app-shell">{children}</div>
          </div>
          <TabBar />
        </LanguageProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
