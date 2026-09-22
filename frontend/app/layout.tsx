import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import TabBar from "@/components/TabBar";
import "./globals.css";

// Condensed caps keep verdicts and numbers legible at a glance (headings).
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

// Plain grotesque body carries French and Kreol diacritics cleanly at any size.
const barlow = Barlow({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

// Machine data only — domains, sender IDs, counts — so a looked-up value is
// visibly not prose. Two weights only, to keep the font payload small.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const TITLE = "FraudLens AI — check a message before you pay";
const DESCRIPTION =
  "Paste a suspicious SMS or message and see the scam warning signs: sender mismatch, urgency, lookalike links. Built for Mauritius, in English, French and Kreol.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · FraudLens AI" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  applicationName: "FraudLens AI",
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
  // Matches the dark instrument band at the top of the app, so the mobile
  // status bar reads as part of the same chrome.
  themeColor: "#15181C",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlowCondensed.variable} ${barlow.variable} ${plexMono.variable}`}>
      <body>
        <LanguageProvider>
          <div className="app-shell">{children}</div>
          <TabBar />
        </LanguageProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
