// Loads data/global-brands.json - see that file's `notes`. These domains get
// lookalike protection only (URL-01/URL-02/URL-04 in ./index.js); nothing
// here marks any link safe. Kept apart from trustedDomains.js, which is an
// allowlist that deliberately gives no lookalike protection.

import { readFileSync } from "node:fs";

const REGISTRY_URL = new URL("../../../../data/global-brands.json", import.meta.url);
const raw = JSON.parse(readFileSync(REGISTRY_URL, "utf8"));

export const GLOBAL_BRANDS_VERSION = raw.version;

export const GLOBAL_BRAND_DOMAINS = Object.freeze([...new Set((raw.domains ?? []).map((d) => d.toLowerCase()))]);
