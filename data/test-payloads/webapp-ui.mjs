// Round 2 web-app browser pass: the (auto) items of WEBAPP-CHECKLIST.md.
//
//   node webapp-ui.mjs          dev server on :3000
//   node webapp-ui.mjs --pwa    production build on :3002 (section 10 only)
//   node webapp-ui.mjs --only home,result,batch   run some sections
//
// Needs the web app with BACKEND_URL=http://localhost:4000. It restarts the
// backend itself with ./restart-backend.sh (or RESTART_SCRIPT), which honours
// AI_URL / AI_MODE overrides. Each section runs on its own: one failure doesn't stop
// the rest. Output (git-ignored): results/webapp-ui.out.txt (or
// webapp-ui-pwa.out.txt) and screenshots in results/webapp-shots/.
import puppeteer from "puppeteer";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, "results", "webapp-shots");
const RESTART_SCRIPT = process.env.RESTART_SCRIPT ?? join(here, "restart-backend.sh");
mkdirSync(shots, { recursive: true });
const PWA = process.argv.includes("--pwa");
const APP = PWA ? "http://localhost:3002" : "http://localhost:3000";
const API = "http://localhost:4000";
// Another address of this PC (e.g. its Tailscale IP), to test whether the limit is per visitor.
const SECOND_ADDRESS = process.env.SECOND_ADDRESS ?? Object.values(networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address;
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const log = [];
const note = (status, id, detail = "") => {
  const l = `${status} ${id}${detail !== "" && detail !== undefined ? ": " + detail : ""}`;
  log.push(l);
  console.log(l);
};
const ok = (cond, id, detail) => note(cond ? "PASS" : "FAIL", id, detail);
const restart = (env = {}) =>
  console.log(execSync(`sh "${RESTART_SCRIPT}"`, { env: { ...process.env, ...env } }).toString().trim());
const killBackend = () => restart({ KILL_ONLY: "1" }); // RESTART_SCRIPT stops after the kill
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const payload = (id) =>
  ["en", "fr", "kr"].flatMap((l) => JSON.parse(readFileSync(join(here, `${l}.json`), "utf8"))).find((p) => p.id === id).message;
const one = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], protocolTimeout: 240000 });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(APP, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
const consoleErrors = [];
let expectErrors = false; // off during the "things go wrong" section
async function newPage(width = 1280, { noShare = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(90000);
  // Headless Chrome may expose navigator.share; hide it so the safety card
  // takes its Copy text path, which we can read back.
  if (noShare) await page.evaluateOnNewDocument(() => { try { delete Navigator.prototype.share; } catch {} });
  page.on("console", (m) => {
    if (m.type() === "error" && !expectErrors) consoleErrors.push(`${page.url()} ${m.text().slice(0, 220)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()} PAGEERROR ${String(e).slice(0, 220)}`));
  return page;
}
const text = (page, openDetails = true) =>
  page.evaluate((o) => {
    if (o) document.querySelectorAll("details").forEach((d) => (d.open = true));
    return document.body.innerText;
  }, openDetails);
const setVal = (page, sel, v) =>
  page.$eval(sel, (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  }, v);
// Case-insensitive, visible-only, exact match first, then "contains".
// Matches innerText (CSS-uppercased on some buttons), textContent and aria-label.
const click = (page, label, tag = "button,a,summary") =>
  page.evaluate((label, tag) => {
    const want = label.toLowerCase();
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const els = [...document.querySelectorAll(tag)].filter((e) => !e.disabled && (e.offsetParent !== null || getComputedStyle(e).position === "fixed"));
    const names = (e) => [norm(e.innerText), norm(e.textContent), norm(e.getAttribute("aria-label"))];
    const el = els.find((e) => names(e).includes(want)) ?? els.find((e) => names(e).some((n) => n.includes(want)));
    if (el) el.click();
    return Boolean(el);
  }, label, tag);
const waitText = (page, re, timeout = 60000) =>
  page
    .waitForFunction((src, flags) => new RegExp(src, flags).test(document.body.innerText), { timeout }, re.source, re.flags)
    .then(() => true, () => false);
const submitDisabled = (page) => page.$eval('form button[type="submit"]', (b) => b.disabled);
const visible = (page, sel) =>
  page.evaluate((sel) => { const e = document.querySelector(sel); return Boolean(e && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden"); }, sel);
const stored = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("fraudlens.result.v1") || "null"));
const api = async (path, body) => {
  const res = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const reportCount = async (sender) => (await api("/api/check-sender", { sender })).body?.reportCount ?? null;

async function openBox(page) {
  await page.goto(`${APP}/?new=1`, { waitUntil: "networkidle2" });
  await page.waitForSelector("textarea#message", { visible: true, timeout: 30000 });
}
async function waitResult(page, timeout = 180000) {
  try {
    await page.waitForFunction(() => location.pathname === "/result" || document.querySelector('[role="alert"]'), { timeout });
  } catch { return { error: `no result after ${timeout / 1000}s` }; }
  if (!page.url().endsWith("/result")) return { error: one(await page.$eval('[role="alert"]', (e) => e.innerText)) };
  await page.waitForSelector("#verdict-label", { timeout: 15000 }).catch(() => {});
  await sleep(700);
  return {};
}
async function check(page, message, label) {
  await openBox(page);
  await setVal(page, "textarea#message", message);
  const t0 = Date.now();
  await page.click('form button[type="submit"]');
  const r = await waitResult(page);
  const ms = Date.now() - t0;
  if (r.error) return { error: r.error, ms };
  await page.screenshot({ path: join(shots, `${label}.png`), fullPage: true });
  return {
    ms,
    verdict: one(await page.$eval("#verdict-label", (e) => e.innerText).catch(() => null)),
    body: await text(page),
    highlights: await page.$$eval('section[aria-labelledby="message-label"] a[href^="#"], section[aria-labelledby="message-label"] mark', (m) => m.map((e) => e.getAttribute("href") ?? "mark")),
    stored: await stored(page),
  };
}
const sections = [];
const section = (name, fn) => sections.push([name, fn]);

const EN01 = payload("EN-01");
const EN15 = payload("EN-15");
const SEED = "Mum it's me, I lost my phone so this is my new number: 5900 0012. I'm in a bit of trouble and need Rs 5,000 urgently, please send it here and don't tell Dad.";
let page;

// ---------------------------------------------------------------- dev sections
section("layout", async () => {
  await page.goto(APP, { waitUntil: "networkidle2" });
  ok(await visible(page, 'nav[aria-label="Sections"]'), "1280px: side menu shown");
  ok(!(await visible(page, "nav.tabbar")), "1280px: bottom tab bar hidden");
  await page.goto(`${APP}/batch`, { waitUntil: "networkidle2" });
  const cur = await page.$$eval('nav[aria-label="Sections"] [aria-current="page"]', (e) => e.map((x) => x.innerText.trim()).join(",")).catch(() => "");
  ok(/batch/i.test(cur), "side menu highlights the current screen", cur);
  const mp = await newPage(360);
  await mp.goto(APP, { waitUntil: "networkidle2" });
  ok(!(await visible(mp, 'nav[aria-label="Sections"]')) && (await visible(mp, "nav.tabbar")), "360px: no side menu, tab bar shown");
  for (const route of ["/", "/result", "/batch", "/safepay", "/conversation", "/sandbox", "/trends", "/learn", "/settings", "/replay"]) {
    await mp.goto(`${APP}${route}`, { waitUntil: "networkidle2" });
    await sleep(600);
    const [sw, iw, covered] = await mp.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 300));
      const bar = document.querySelector("nav.tabbar")?.getBoundingClientRect();
      const btns = [...document.querySelectorAll("main button, main a, .app-shell button, .app-shell a")].filter((e) => e.getClientRects().length);
      const last = btns.at(-1)?.getBoundingClientRect();
      return [document.documentElement.scrollWidth, window.innerWidth, Boolean(bar && last && last.bottom > bar.top && last.top < bar.bottom)];
    });
    ok(sw <= iw, `360px ${route}: no sideways scroll`, `${sw} vs ${iw}`);
    if (covered) note("FAIL", `360px ${route}: tab bar covers the last button (scrolled to the bottom)`);
  }
  await mp.close();
});

section("home", async () => {
  await page.goto(APP, { waitUntil: "networkidle2" });
  const home = await text(page, false);
  ok(/Is this a scam\?/.test(home) && /Paste & check/i.test(home), "home: question + Paste & check");
  ok(Boolean(await page.$('button[aria-label="Check a screenshot"]')), "home: camera button (aria-label Check a screenshot)");
  ok(await visible(page, "textarea#message"), "1280px: message box already open");
  const mp = await newPage(360);
  await mp.goto(APP, { waitUntil: "networkidle2" });
  await sleep(800);
  ok(!(await visible(mp, "textarea#message")), "360px: box closed until Paste & check");
  await click(mp, "Paste & check");
  await mp.waitForSelector("textarea#message", { visible: true }).catch(() => {});
  await sleep(800);
  ok(await visible(mp, "textarea#message"), "360px: Paste & check opens the box");
  note("INFO", "paste with empty clipboard", (await text(mp, false)).includes("Nothing to paste yet") ? "note shown" : "no note (clipboard may have had text)");
  await mp.close();
  // clipboard with text (headless grants the permission)
  await page.evaluate(() => navigator.clipboard.writeText("Your MCB account is blocked, verify at mcb-secure.top")).catch(() => {});
  await page.goto(APP, { waitUntil: "networkidle2" });
  await click(page, "Paste & check");
  await sleep(1200);
  const v = await page.$eval("textarea#message", (e) => e.value).catch(() => "");
  ok(v.startsWith("Your MCB account") && new URL(page.url()).pathname === "/", "Paste & check fills the box from the clipboard, not checked", JSON.stringify(v.slice(0, 40)));
  await setVal(page, "textarea#message", "");
  ok(await submitDisabled(page), "empty box: Check button greyed out");
  await setVal(page, "textarea#message", "a".repeat(4600));
  const c1 = await text(page, false);
  ok(c1.includes("4,600 / 5,000"), "counter appears at 4,600", c1.match(/[\d,]+ \/ 5,000/)?.[0]);
  await setVal(page, "textarea#message", "a".repeat(5001));
  ok((await text(page, false)).includes("Too long to check") && (await submitDisabled(page)), "5,001 chars: warning + button off");
});

section("cancel", async () => {
  await openBox(page);
  await setVal(page, "textarea#message", EN01);
  await page.click('form button[type="submit"]');
  const progress = await waitText(page, /Checking the message|Looking for warning signs/i, 10000);
  ok(progress, "progress text while checking");
  const cancelled = await click(page, "Cancel");
  await sleep(1500);
  const v = await page.$eval("textarea#message", (e) => e.value).catch(() => "");
  ok(cancelled && new URL(page.url()).pathname === "/" && v === EN01, "Cancel: back to the box, text kept", `clicked=${cancelled} path=${new URL(page.url()).pathname} kept=${v === EN01}`);
});

section("scan", async () => {
  await page.goto(`${APP}/?scan=${encodeURIComponent("Your MCB account is blocked. Verify at mcb-secure.top")}`, { waitUntil: "networkidle2" });
  await sleep(1500);
  const pre = await page.$eval("textarea#message", (e) => e.value).catch(() => null);
  const u = new URL(page.url());
  ok(pre?.startsWith("Your MCB account") && u.search === "" && u.pathname === "/", "?scan= fills box, not auto-checked, URL cleaned", `url=${page.url()}`);
  await page.goto(`${APP}/?scan=${"b".repeat(6000)}`, { waitUntil: "networkidle2" });
  await sleep(1200);
  const len = await page.$eval("textarea#message", (e) => e.value.length).catch(() => -1);
  ok(len === 5000, "?scan= 6,000 chars cut to 5,000", `box length ${len}`);
});

section("result", async () => {
  restart();
  const p = await newPage(1280, { noShare: true });
  const r = await check(p, EN01, "en01-result");
  if (r.error) return note("FAIL", "EN-01 check", r.error);
  note("INFO", "EN-01", `verdict "${r.verdict}" in ${r.ms} ms; ${r.stored?.response?.riskScore}/100; AI ${r.stored?.response?.analysis?.semantic?.provider}`);
  ok(/scam/i.test(r.verdict), "EN-01 is Likely a scam");
  for (const s of ["Risk score", "Warning signs", "What's wrong", "The link", "Real site: mcb.mu", "The message you sent", "Why this looks wrong", "What to do now", "What was sent for analysis", "Analyzed by", "Report this sender", "Help me explain this", "Check another message"])
    ok(r.body.includes(s), `result shows "${s}"`);
  // warning-sign count agrees with itself
  const top = r.body.match(/Warning signs\s*(\d+) found/)?.[1];
  const why = r.body.match(/from (\d+) warning signs/)?.[1];
  const signals = r.stored?.response?.signals ?? [];
  note(top === why ? "PASS" : "FAIL", "warning-sign count matches between the header and Why this looks wrong", `header ${top}, Why ${why}; signals ${signals.length} (scored ${signals.filter((s) => s.scored !== false).length}); codes ${signals.map((s) => `${s.code}${s.scored === false ? "(unscored)" : ""}`).join(" ")}`);
  const titles = (r.body.split("What's wrong")[1]?.split("The link")[0] ?? "").split(/[\n\t]+/).map((l) => l.trim()).filter((l) => l && !/^(High|Medium|Low|\d+|\d+ signs?|signs)$/i.test(l));
  const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
  note(dup.length ? "FAIL" : "PASS", "What's wrong: no repeated reasons", dup.length ? `repeated: ${[...new Set(dup)].join(", ")} (list: ${titles.join(" / ")})` : titles.join(" / "));
  // highlights are links to the evidence rows
  ok(r.highlights.length > 0 && r.highlights.every((h) => h.startsWith("#sig-")), "highlights in the message link to reasons", `${r.highlights.length}: ${r.highlights.join(" ")}`);
  if (r.highlights[0]) {
    await p.click(`section[aria-labelledby="message-label"] a[href="${r.highlights[0]}"]`);
    await sleep(600);
    const inView = await p.evaluate((id) => { const e = document.querySelector(id); if (!e) return "missing"; const b = e.getBoundingClientRect(); return location.hash === id && b.top >= 0 && b.top < innerHeight ? "yes" : `hash=${location.hash} top=${Math.round(b.top)}`; }, r.highlights[0]);
    ok(inView === "yes", "clicking a highlight jumps to its reason", inView);
  }
  ok(/AI analysis/.test(r.body) && /Deterministic checks/.test(r.body), "Why this looks wrong: AI reasons labelled apart from rule reasons");
  // redaction
  note("INFO", "EN-01 sender / senderReports", `${r.stored?.response?.sender} / ${r.stored?.response?.senderReports}; header "${one(r.body.match(/SMS from [^\n]*/)?.[0])}"`);
  // simple mode
  await click(p, "Simple mode");
  await sleep(500);
  const simple = await text(p);
  ok(simple.includes("Show full details"), "Simple mode on", /read this aloud/i.test(simple) ? "Read this aloud button shown" : "no Read this aloud button");
  await click(p, "Show full details");
  await sleep(400);
  ok((await text(p)).includes("What's wrong"), "Show full details brings the detailed view back");
  // safety card
  await click(p, "Help me explain this");
  await sleep(500);
  const copied = await click(p, "Copy text");
  await sleep(400);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e}`);
  const card = await p.evaluate(() => [...document.querySelectorAll(".sheet")].map((e) => e.innerText).find((t) => /Copy text|Copied|Share/.test(t)) ?? "");
  ok(copied && clip.length > 20, "safety card opens and Copy text copies", `${clip.length} chars`);
  ok(!/\d{4}\s?\d{4}|\+230/.test(clip), "safety card text has no phone numbers", one(clip).slice(0, 300));
  note("INFO", "safety card on screen", one(card).slice(0, 200));
  // report: who gets reported?
  const sender = r.stored?.response?.sender;
  const before = sender ? await reportCount(sender) : null;
  await click(p, "Report this sender");
  await sleep(2500);
  const rep = await text(p);
  const after = sender ? await reportCount(sender) : null;
  ok(/Reported\./.test(rep), "Report this sender confirms", one(rep.match(/Reported\.[^\n]*/)?.[0] ?? rep.match(/Who sent it\?[^\n]*/)?.[0] ?? "no confirmation"));
  ok(!/^(MCB|SBM|Absa|Bank One|MauBank)$/i.test(sender ?? ""), "the reported sender is not the bank being impersonated", `reported "${sender}", count ${before} → ${after}`);
  // replay + network
  await click(p, "See how this scam works");
  await p.waitForFunction(() => location.pathname === "/replay", { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  const replay = await text(p);
  await p.screenshot({ path: join(shots, "replay.png"), fullPage: true });
  ok(p.url().endsWith("/replay") && !/No check to show/.test(replay), "Replay tells the result as a story", one(replay.split("Sandbox")[1] ?? replay).slice(0, 220));
  await p.goBack({ waitUntil: "networkidle2" }).catch(() => {});
  await sleep(800);
  const netHref = await p.$eval('a[href^="/network/"]', (a) => a.getAttribute("href")).catch(() => null);
  if (netHref) {
    await p.goto(`${APP}${netHref}`, { waitUntil: "networkidle2" });
    await waitText(p, /entities|not found|Could not/i, 20000);
    const net = await text(p, false);
    await p.screenshot({ path: join(shots, "network.png"), fullPage: true });
    ok(/View accessible entity list · \d+ entities/.test(net) && (await p.$(".react-flow")) !== null, `Network ${netHref}: graph + entity list`, one(net.match(/\d+ Checks \d+ Senders \d+ Domains/)?.[0]));
    note("INFO", `Network ${netHref} entities`, one(net.split("Entity inspector")[0].split("Follow the connections.")[1] ?? "").slice(0, 400));
  } else note("FAIL", "result has a View fraud network link");
  await p.goto(`${APP}/result`, { waitUntil: "networkidle2" });
  await click(p, "Check another message");
  await sleep(1000);
  ok(new URL(p.url()).pathname === "/", "Check another message goes back to Check");
  await p.close();
});

section("seed", async () => {
  const r = await check(page, SEED, "seed-0012");
  ok(!r.error && !r.stored?.redacted?.includes("5900 0012") && /\[phone 1\]/.test(r.body.split("What was sent for analysis")[1] ?? ""), "phone number replaced before sending (What was sent shows [phone 1])", one(r.stored?.redacted).slice(0, 80));
  note("INFO", "SEED-0012 (14 reports in DB) in web app", r.error ?? `verdict ${r.verdict}; sent "${one(r.stored?.redacted).slice(40, 90)}"; sender=${r.stored?.response?.sender}; senderReports=${r.stored?.response?.senderReports}; screen mentions reports: ${/reported \d+ times|\d+ reports/i.test(r.body)}`);
});

section("safe", async () => {
  const r = await check(page, EN15, "en15-safe");
  if (r.error) return note("FAIL", "EN-15 check", r.error);
  ok(/genuine/i.test(r.verdict) && r.body.includes("What we checked") && !r.body.includes("Report this"), "EN-15: Looks genuine, What we checked, no report button", `verdict "${r.verdict}"`);
  ok(!/scam|danger|warning signs\s*[1-9]/i.test(r.body.split("What we checked")[0].split("Result")[1] ?? ""), "EN-15: no scary wording in the verdict area", one(r.body.split("What we checked")[0].split("Result")[1]).slice(0, 120));
});

section("mixed", async () => {
  const r = await check(page, "Ou kont MCB pou bloke azordi. Please verify now: https://mcb-secure.top/verify. Merci de confirmer votre code OTP.", "mixed");
  if (r.error) return note("FAIL", "mixed-language check", r.error);
  ok(/scam/i.test(r.verdict) && r.body.includes("mcb-secure.top"), "code-switched Kreol/English/French: scam, fake link named", `verdict "${r.verdict}"`);
});

section("languages", async () => {
  restart();
  const res = {};
  for (const [btn, lang, msgId] of [["FR", "fr", "FR-01"], ["KREOL", "mfe", "KR-01"]]) {
    await page.goto(`${APP}/settings`, { waitUntil: "networkidle2" });
    await click(page, btn, "button");
    await sleep(600);
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(600);
    const t = await text(page, false);
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    const menu = one(await page.$eval('nav[aria-label="Sections"]', (e) => e.innerText).catch(() => ""));
    ok(htmlLang === lang, `${btn}: remembered after reload`, `html lang=${htmlLang}; side menu: ${menu.slice(0, 140)}`);
    const r = await check(page, payload(msgId), `lang-${lang}`);
    res[btn] = r;
    note(r.error ? "FAIL" : "INFO", `${btn} UI, ${msgId}`, r.error ?? `verdict "${r.verdict}"; explanation: ${one(r.stored?.response?.explanation).slice(0, 140)}; screen: ${one(r.body).slice(0, 260)}`);
  }
  const r = await check(page, EN01, "lang-mfe-en01");
  note("INFO", "KREOL UI, English EN-01", r.error ?? `verdict "${r.verdict}"`);
  await page.goto(`${APP}/settings`, { waitUntil: "networkidle2" });
  await click(page, "EN", "button");
  await sleep(500);
});

section("theme", async () => {
  await page.goto(`${APP}/settings`, { waitUntil: "networkidle2" });
  await click(page, "Dark", "button");
  await page.reload({ waitUntil: "networkidle2" });
  const theme = await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), getComputedStyle(document.body).backgroundColor]);
  ok(theme[0] === "dark", "Dark theme kept after reload", theme.join(" "));
  // first paint dark (no white flash): theme attribute is set by the boot script before hydration
  const early = await page.evaluate(async (url) => {
    const html = await (await fetch(url)).text();
    return /data-theme|fraudlens\.theme/.test(html);
  }, APP);
  ok(early, "theme boot script is in the server HTML (no white flash)");
  const r = await check(page, EN01, "en01-dark");
  if (!r.error) {
    const contrast = await page.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const bg = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; el = el.parentElement; } return "rgb(255,255,255)"; };
      const bad = [];
      for (const el of document.querySelectorAll("p, h1, h2, h3, li, span, a, summary")) {
        if (!el.innerText?.trim() || !el.getClientRects().length || el.children.length > 3) continue;
        const a = lum(getComputedStyle(el).color), b = lum(bg(el));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 3) bad.push(`${el.innerText.trim().slice(0, 30)} (${ratio.toFixed(1)})`);
      }
      return bad;
    });
    note("INFO", "dark result screen: text under 3:1 by a rough check (misreads card gradients; look at webapp-shots/en01-dark.png)", contrast.slice(0, 8).join("; "));
  }
  await page.goto(`${APP}/settings`, { waitUntil: "networkidle2" });
  await click(page, "System", "button");
});

section("screenshot", async () => {
  restart();
  // Make the images with the browser itself.
  const maker = await newPage(420);
  await maker.setContent(`<body style="margin:0;background:#fff;font:22px Arial;padding:24px"><div style="background:#e9e9eb;border-radius:18px;padding:16px;max-width:360px;line-height:1.4">MCB Alert: Your account has been suspended. Verify your identity within 24 hours at http://mcb-secure-verify.top/login</div></body>`);
  const good = join(shots, "upload-sms.png");
  await maker.screenshot({ path: good, clip: { x: 0, y: 0, width: 420, height: 220 } });
  await maker.setContent(`<body style="margin:0;background:#fff"></body>`);
  const blank = join(shots, "upload-blank.png");
  await maker.screenshot({ path: blank, clip: { x: 0, y: 0, width: 420, height: 220 } });
  await maker.close();
  const fake = join(shots, "upload-fake.png");
  writeFileSync(fake, "this is not an image, just text renamed to .png\n");

  const upload = async (file) => {
    await page.goto(APP, { waitUntil: "networkidle2" });
    const input = await page.$('input[type="file"]');
    await input.uploadFile(file);
    const t0 = Date.now();
    await page.waitForFunction(() => {
      const v = document.querySelector("textarea#message")?.value;
      return (v && v.length > 10) || document.querySelector('[role="alert"]');
    }, { timeout: 120000 }).catch(() => {});
    await sleep(600);
    return { ms: Date.now() - t0, value: await page.$eval("textarea#message", (e) => e.value).catch(() => ""), body: await text(page, false), alert: one(await page.$eval('[role="alert"]', (e) => e.innerText).catch(() => "")) };
  };
  const g = await upload(good);
  await page.screenshot({ path: join(shots, "upload-good.png"), fullPage: true });
  ok(/Verify your identity/i.test(g.value) && new URL(page.url()).pathname === "/", "clear scam screenshot: text appears in the box, not checked yet", `${g.ms} ms; "${one(g.value)}" ${g.alert}`);
  note(/mcb-secure-verify\.top/i.test(g.value) ? "PASS" : "INFO", "OCR read the link exactly", one(g.value).match(/http\S*/)?.[0]);
  ok(Boolean(await page.$('img[alt="Your screenshot"]')), "thumbnail shown");
  ok(!g.body.includes("Phone numbers, emails and account numbers are removed before anything is analysed."), "privacy note changes for a screenshot", one(g.body.match(/[^\n]*(image|screenshot)[^\n]*(sent|leave|device)[^\n]*/i)?.[0]));
  // "Type it instead" only shows after a failed read: tested with the blank picture below.
  const g2 = await upload(good);
  const removed = await click(page, "Remove screenshot");
  await sleep(500);
  ok(removed && !(await page.$('img[alt="Your screenshot"]')), "Remove screenshot clears it", `box after: "${one(await page.$eval("textarea#message", (e) => e.value).catch(() => "")).slice(0, 40)}"`);
  // check the text that came from the screenshot
  await page.goto(APP, { waitUntil: "networkidle2" });
  const g3 = await upload(good);
  await page.click('form button[type="submit"]');
  const r = await waitResult(page);
  const st = await stored(page);
  note(r.error ? "FAIL" : "INFO", "check after screenshot", r.error ?? `verdict "${one(await page.$eval("#verdict-label", (e) => e.innerText).catch(() => ""))}"; What was sent mentions the image: ${/image|screenshot/i.test((await text(page)).split("What was sent for analysis")[1] ?? "")}; source=${st?.source ?? st?.input ?? "?"}`);
  const b = await upload(blank);
  ok(/couldn't find any readable text/i.test(b.body), "blank picture: couldn't find any readable text", b.alert || one(b.value));
  const typed = await click(page, "Type it instead");
  await sleep(500);
  ok(typed && !(await page.$('img[alt="Your screenshot"]')) && !(await page.$('[role="alert"]')), "Type it instead (after a failed read) clears the screenshot and the error");
  const f = await upload(fake);
  ok(/isn't a PNG|couldn't be read|couldn't read/i.test(f.body) && !/PAGEERROR/.test(consoleErrors.join()), "non-image renamed .png: clear error, no crash", f.alert);
});

section("batch", async () => {
  const bp = await newPage();
  await bp.goto(`${APP}/batch`, { waitUntil: "networkidle2" });
  const msgs = [EN01, EN15, "Hi, are we still on for lunch tomorrow at 12?", "Your parcel is held. Pay Rs 150 customs fee at mauritius-post-pay.top within 24h.", payload("FR-01")];
  await setVal(bp, "#batch-messages", msgs.join("\n\n"));
  ok((await text(bp, false)).includes("5 / 50"), "batch counter shows 5 / 50");
  const t0 = Date.now();
  const clicked = await click(bp, "Scan messages");
  ok(clicked, "Scan messages button clicked (uppercase label)");
  await bp.waitForFunction(() => /Results/.test(document.body.innerText) || document.querySelector('[role="alert"]'), { timeout: 200000 }).catch(() => {});
  await sleep(800);
  const bt = await text(bp);
  await bp.screenshot({ path: join(shots, "batch.png"), fullPage: true });
  ok(/Results/.test(bt) && /Messages/.test(bt) && /Safe/.test(bt) && /Scam/.test(bt), "batch of 5: totals and one row each", `${Date.now() - t0} ms; ${one(bt.split("Results")[1]).slice(0, 500)}`);
  note("INFO", "batch campaigns", /Possible campaigns/.test(bt) ? one(bt.split("Possible campaigns")[1]).slice(0, 200) : "no Possible campaigns section");
  await setVal(bp, "#batch-messages", Array.from({ length: 51 }, (_, i) => `msg ${i}`).join("\n\n"));
  ok((await text(bp, false)).includes("up to 50") && (await bp.$eval('button[type="submit"], form button', (b) => b.disabled).catch(() => null)) !== false, "51 messages blocked");
  await setVal(bp, "#batch-messages", `short one\n\n${"x".repeat(5001)}`);
  const long = await text(bp, false);
  ok(/over 5,000|5,000 characters/i.test(long), "a message over 5,000 chars: warning", one(long.match(/[^\n]*5,000[^\n]*/g)?.join(" | ")));
  await bp.close();
});

section("safepay", async () => {
  const sp = await newPage();
  await sp.goto(`${APP}/safepay`, { waitUntil: "networkidle2" });
  await setVal(sp, "#sp-requester", "My son");
  await setVal(sp, "#sp-channel", "WhatsApp from a new number");
  await setVal(sp, "#sp-recipient", "5900 0012");
  await setVal(sp, "#sp-amount", "Rs 5,000");
  await setVal(sp, "#sp-message", SEED);
  const t0 = Date.now();
  await click(sp, "Check before I pay");
  await waitText(sp, /Check another|reported|pay|Don't|Stop/i, 5000);
  await sp.waitForFunction(() => !document.querySelector("#sp-requester") || document.querySelector('[role="alert"]'), { timeout: 180000 }).catch(() => {});
  await sleep(800);
  const t = await text(sp);
  await sp.screenshot({ path: join(shots, "safepay.png"), fullPage: true });
  ok(!(await sp.$("#sp-requester")), "Before You Pay gives a result", `${Date.now() - t0} ms; ${one(t.split("Sandbox")[1] ?? t).slice(0, 400)}`);
  ok(/reported 1[0-9] times/.test(t), "recipient 5900 0012 (14 reports) shows 'reported N times'", one(t.match(/[^\n]*reported[^\n]*/i)?.[0]));
  await sp.close();
});

section("conversation", async () => {
  restart();
  const cp = await newPage();
  await cp.goto(`${APP}/conversation`, { waitUntil: "networkidle2" });
  const msgs = [
    "Hi! This is Priya from the MCB customer care team. Hope you're well today.",
    "We noticed an unusual transfer on your account. You must act within 30 minutes or the account will be frozen.",
    "To cancel it, please send me the 6-digit OTP code you just received by SMS.",
  ];
  const stages = [];
  for (const [i, m] of msgs.entries()) {
    await setVal(cp, "#conversation-message", m);
    await click(cp, "Analyze message");
    await cp.waitForFunction((n) => (document.body.innerText.match(/Likely a scam|Be careful|Looks genuine|Suspicious|Safe|Scam/g) || []).length >= n || document.querySelector('[role="alert"]'), { timeout: 180000 }, i + 1).catch(() => {});
    await cp.waitForFunction(() => !document.querySelector("#conversation-message")?.disabled, { timeout: 180000 }).catch(() => {});
    await sleep(800);
    const t = await text(cp);
    stages.push(one(t.split("Furthest stage detected")[1] ?? "").slice(0, 80));
  }
  const t = await text(cp);
  await cp.screenshot({ path: join(shots, "conversation.png"), fullPage: true });
  const alert = one(await cp.$eval('[role="alert"]', (e) => e.innerText).catch(() => ""));
  ok(!alert, "Conversation: 3 messages analysed", alert || one(t.split("Conversation 0")[1] ?? "").slice(0, 400));
  note("INFO", "Conversation: furthest stage after each message", stages.join(" → "));
  await cp.close();
});

section("sandbox", async () => {
  const sb = await newPage();
  await sb.goto(`${APP}/sandbox`, { waitUntil: "networkidle2" });
  const opts = await sb.$$eval("#sandbox-type option", (o) => o.map((x) => x.value));
  if (opts[6]) await setVal(sb, "#sandbox-type", opts[6]);
  await click(sb, "Start simulation");
  let steps = 0;
  for (; steps < 12; steps++) {
    await sb.waitForFunction(() => !/Preparing the next scenario message/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
    await sleep(500);
    if (/Simulation ended/.test(await text(sb, false))) break;
    if (!(await click(sb, "Continue simulation")) && !(await click(sb, "Finish simulation"))) break;
  }
  const t = await text(sb, false);
  await sb.screenshot({ path: join(shots, "sandbox.png"), fullPage: true });
  const turns = (t.match(/Simulated message/gi) || []).length;
  ok(/Simulation ended/.test(t) && turns > 0, "Sandbox: steps through to the end", `${steps} clicks; ${turns} simulated messages; scenario ${opts[6]}`);
  ok(/Simulation only/i.test(t) && (t.match(/Scammer/gi) || []).length === turns, "every sandbox message is labelled as a simulation");
  await sb.close();
});

section("radar", async () => {
  await page.goto(`${APP}/trends`, { waitUntil: "networkidle2" });
  await sleep(2500);
  const t = await text(page, false);
  await page.screenshot({ path: join(shots, "trends.png"), fullPage: true });
  ok(/Bank impersonation SMS/.test(t), "Radar: example scam list");
  const live = await api("/api/trends");
  note("INFO", "Radar: live numbers", `${JSON.stringify(live.body?.totals)}; screen: ${one(t.split(/Seen reported|reported below/i).at(-1)).slice(0, 400)}`);
  note("INFO", "Radar: top campaign types", (live.body?.topCampaigns ?? []).map((c) => `${c.claimedIdentity}=${c.scamType}(${c.messageCount})`).join(", "));
  await page.goto(`${APP}/network/does-not-exist-123`, { waitUntil: "networkidle2" });
  await waitText(page, /not found|Could not|couldn't|Try again/i, 20000);
  ok(/not found|no .*network|Could not/i.test(await text(page, false)), "Network: unknown id says not found", one((await text(page, false)).split("Sandbox")[1]).slice(0, 160));
});

section("learn", async () => {
  await page.goto(`${APP}/learn`, { waitUntil: "networkidle2" });
  await sleep(1500);
  const t0 = await text(page, false);
  ok(/Scam or genuine\?/.test(t0) && /Question 1 of/.test(t0), "Learn: quiz loads");
  const today0 = t0.match(/Today\s*(\d+) of 5/)?.[1];
  await click(page, "Scam", "button");
  await sleep(700);
  const t1 = await text(page, false);
  ok(/Right\.|Not quite\./.test(t1), "Learn: an answer gives feedback", one(t1.match(/(Right\.|Not quite\.)[^\n]*\n?[^\n]*/)?.[0]).slice(0, 120));
  const today1 = t1.match(/Today\s*(\d+) of 5/)?.[1];
  ok(Number(today1) === Number(today0) + 1, "Learn: Today N of 5 counts up", `${today0} → ${today1}`);
  const mp = await newPage(360);
  await mp.goto(`${APP}/learn`, { waitUntil: "networkidle2" });
  await sleep(1000);
  const w = await mp.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(w[0] <= w[1], "Learn at 360px: no sideways scroll", `${w[0]} vs ${w[1]}`);
  await mp.close();
});

section("notfound", async () => {
  await page.goto(`${APP}/nope`, { waitUntil: "networkidle2" });
  ok(/Page not found/i.test(await text(page, false)), "404 page", one(await text(page, false)).slice(0, 120));
  await page.goto(`${APP}/replay`, { waitUntil: "networkidle2" });
  const fresh = await newPage();
  await fresh.goto(`${APP}/replay`, { waitUntil: "networkidle2" });
  ok(/No check to show/.test(await text(fresh, false)), "Replay with no check: clear empty state");
  await fresh.close();
});

section("reportlimit", async () => {
  restart();
  for (let i = 0; i < 5; i++) await fetch(`${APP}/api/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sender: "QA round2 limit test", message: "qa test" }) });
  const r = await check(page, EN01, "report-limit");
  if (r.error) return note("FAIL", "report limit: check", r.error);
  expectErrors = true;
  await click(page, "Report this sender");
  await sleep(2500);
  expectErrors = false;
  const t = await text(page);
  ok(!/Reported\./.test(t) && /try|later|wrong|couldn't/i.test(one(t.match(/[^\n]*(try|later|wrong|couldn't)[^\n]*/i)?.[0])), "6th report in an hour: clear try-later message", one(t.split("Report this")[1] ?? "").slice(0, 200));
});

section("ratelimit", async () => {
  restart();
  for (let i = 0; i < 20; i++) await fetch(`${APP}/api/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expectErrors = true;
  const r = await check(page, EN01, "ratelimit");
  expectErrors = false;
  const kept = await page.$eval("textarea#message", (e) => e.value).catch(() => "");
  note(r.error && kept === EN01 ? "INFO" : "FAIL", "21st check (limit hit): message shown, text kept", `${r.error ?? "unexpected verdict " + r.verdict}; kept=${kept === EN01}`);
  ok(/wait|minute|later|shortly|moment/i.test(r.error ?? ""), "limit message says to wait");
  // Is the limit per visitor, or shared by everyone who uses this web server?
  const other = await fetch(`http://${SECOND_ADDRESS}:3000/api/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "hello" }) }).then((x) => x.status, (e) => `ERR ${e.message}`);
  note("INFO", `limit from a second address (${SECOND_ADDRESS}:3000)`, `HTTP ${other} (429 = the limit is shared by every visitor of the web server)`);
  const spoof = await fetch(`${APP}/api/analyze`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ message: "hello" }) }).then((x) => x.status);
  note("INFO", "limit with a made-up X-Forwarded-For header", `HTTP ${spoof} (200 = the limit can be dodged by faking the header)`);
});

section("backenddown", async () => {
  killBackend();
  await sleep(800);
  expectErrors = true;
  const r = await check(page, EN01, "backend-down");
  const kept = await page.$eval("textarea#message", (e) => e.value).catch(() => "");
  ok(/Can't reach FraudLens/.test(r.error ?? "") && kept === EN01, "backend down: Can't reach FraudLens, text kept", `${r.error}; ${r.ms} ms`);
  const bd = await newPage();
  await bd.goto(`${APP}/batch`, { waitUntil: "networkidle2" });
  await setVal(bd, "#batch-messages", "one\n\ntwo");
  await click(bd, "Scan messages");
  await waitText(bd, /reach|busy|wrong/i, 30000);
  note("INFO", "batch with backend down", one((await text(bd, false)).match(/[^\n]*(reach|busy|wrong)[^\n]*/i)?.[0]));
  await bd.close();
  restart();
  const retried = await click(page, "Try again");
  const r2 = retried ? await waitResult(page) : { error: "no Try again button" };
  expectErrors = false;
  ok(!r2.error, "Try again works once the backend is back", r2.error ?? one(await page.$eval("#verdict-label", (e) => e.innerText).catch(() => "")));
});

section("aidown", async () => {
  restart({ AI_URL: "http://127.0.0.1:9", AI_MODE: "local" });
  const r = await check(page, EN01, "ai-down");
  ok(!r.error && /scam|careful/i.test(r.verdict ?? ""), "AI down (local only): still a verdict", r.error ?? `verdict "${r.verdict}" ${r.stored?.response?.riskScore} in ${r.ms} ms; ${one(r.body.match(/Analyzed by:[^\n]*/)?.[0])}`);
  ok(/Analyzed by:[^\n]*(no AI|not available|unavailable|rules only|didn't)/i.test(r.body ?? ""), "What was sent says no AI answered", one(r.body?.match(/Analyzed by:[^\n]*/)?.[0]));
  const sb = await newPage();
  await sb.goto(`${APP}/sandbox`, { waitUntil: "networkidle2" });
  await click(sb, "Start simulation");
  await sleep(4000);
  ok(/Simulated message/i.test(await text(sb, false)), "Sandbox works with the AI off");
  await sb.close();
  restart({ AI_URL: "http://127.0.0.1:9", AI_MODE: "auto" });
  const f = await check(page, EN01, "ai-fallback");
  ok(!f.error && /Analyzed by:[^\n]*(openrouter|hosted|backup|fallback)/i.test(f.body ?? ""), "Ollama down, auto mode: hosted backup answers", f.error ?? `verdict "${f.verdict}" in ${f.ms} ms; ${one(f.body.match(/Analyzed by:[^\n]*/)?.[0])}; semantic=${JSON.stringify(f.stored?.response?.analysis?.semantic)}`);
});

// ---------------------------------------------------------------- PWA (production build)
section("pwa", async () => {
  const m = await fetch(`${APP}/manifest.webmanifest`).then((r) => r.json()).catch(() => null);
  ok(m?.name === "FraudLens AI" && m?.icons?.length >= 2, "manifest loads", `${m?.name}; ${m?.icons?.length} icons; start_url ${m?.start_url}; display ${m?.display}`);
  const pp = await newPage();
  await pp.goto(APP, { waitUntil: "networkidle2" });
  const sw = await pp.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((x) => setTimeout(() => x(null), 15000))]); return r?.active?.scriptURL ?? null; });
  ok(Boolean(sw), "service worker registers", sw);
  await pp.goto(`${APP}/learn`, { waitUntil: "networkidle2" });
  await sleep(1500);
  await pp.setOfflineMode(true);
  for (const route of ["/", "/learn"]) {
    await pp.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(2500);
    const t = await text(pp, false);
    ok(route === "/" ? /Is this a scam\?/.test(t) : /Scam or genuine\?/.test(t), `offline: ${route} still opens`, one(t).slice(0, 120));
  }
  await pp.goto(APP, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(2000);
  expectErrors = true;
  await setVal(pp, "textarea#message", EN01).catch(() => {});
  await pp.click('form button[type="submit"]').catch(() => {});
  await waitText(pp, /Can't reach FraudLens|went wrong|busy/i, 30000);
  expectErrors = false;
  ok(/Can't reach FraudLens/.test(await text(pp, false)), "offline check: Can't reach FraudLens", one((await text(pp, false)).match(/[^\n]*(reach|wrong|busy)[^\n]*/i)?.[0]));
  await pp.setOfflineMode(false);
  const mp = await newPage(360);
  await mp.goto(APP, { waitUntil: "networkidle2" });
  await sleep(1500);
  note("INFO", "install card at 360px (no install prompt in headless)", /Add to Home Screen|Install/i.test(await text(mp, false)) ? "shown" : "not shown");
  await mp.close();
  await pp.close();
});

try {
  if (!PWA) restart();
  page = await newPage();
  for (const [name, fn] of sections) {
    if (PWA !== (name === "pwa")) continue;
    if (ONLY && !ONLY.has(name)) continue;
    console.log(`\n== ${name}`);
    log.push(`\n== ${name}`);
    try { await fn(); } catch (err) { note("ERROR", name, String(err.stack ?? err).split("\n").slice(0, 3).join(" | ").slice(0, 400)); expectErrors = false; }
  }
} finally {
  if (!PWA) { try { restart(); } catch {} }
  note(consoleErrors.length ? "INFO" : "PASS", "console errors", consoleErrors.length ? `\n  ${[...new Set(consoleErrors)].slice(0, 25).join("\n  ")}` : "none");
  writeFileSync(join(here, "results", PWA ? "webapp-ui-pwa.out.txt" : "webapp-ui.out.txt"), log.join("\n") + "\n");
  await browser.close();
}
