import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed, IBM_Plex_Mono } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import ParticleField from "@/components/ParticleField";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import TabBar from "@/components/TabBar";
import "./globals.css";

// One designed superfamily doing three jobs (condensed for headings/verdicts,
// regular for body, mono for machine data below) reads as a considered
// document system, not three fonts picked separately off a Google Fonts list.
const plexSansCondensed = IBM_Plex_Sans_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-plex-sans-condensed",
  display: "swap",
});

// Plain grotesque body carries French and Kreol diacritics cleanly at any size.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
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
    <html lang="en" className={`${plexSansCondensed.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <ParticleField />
        <LanguageProvider>
          <div className="app-shell">{children}</div>
          <TabBar />
        </LanguageProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
