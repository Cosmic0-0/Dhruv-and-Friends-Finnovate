import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Fx from "@/components/dc/Fx";
import TopNav from "@/components/TopNav";
import TabBar from "@/components/TabBar";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * Type: Geist for the interface and headlines (readable at every size),
 * Geist Mono for labels, codes, domains and figures. next/font self-hosts
 * both, so the PWA still works offline and nothing is fetched from Google at
 * runtime.
 */
const sans = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono", display: "swap" });

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
  // The design's dark page colour; lib/theme.ts swaps it when Light is chosen.
  themeColor: "#0D0D0C",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Applies a saved light/dark choice before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <LanguageProvider>
          {/* Desktop: the design's top bar. Below 64rem: the tab bar. */}
          <TopNav />
          <div className="app-frame">
            <div className="app-shell">{children}</div>
          </div>
          <TabBar />
        </LanguageProvider>
        <Fx />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
