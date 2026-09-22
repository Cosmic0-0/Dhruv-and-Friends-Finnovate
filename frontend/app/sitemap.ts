import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// /result is excluded: it's query-param-driven, per-check content
// (metadata.robots.index === false there, see app/result/page.tsx), not a
// page search engines should crawl or list.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/trends`, changeFrequency: "daily", priority: 0.5 },
  ];
}
