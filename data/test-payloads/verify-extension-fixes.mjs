// Re-checks the extension findings (#19-#30 in FINDINGS.md) and prints
// PASS / FAIL / MANUAL for each. See EXTENSION-FIX-CHECKS.md for what each
// check means and how to run it.
//
//   node verify-extension-fixes.mjs            API checks only (backend must be running)
//   node verify-extension-fixes.mjs --browser  also drives the real extension in Chrome for Testing
//
// Env: API_BASE (default http://localhost:4000).
// Uses about 3 analyze calls, 2 reports and ~40 link checks (more with --browser).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_BASE ?? "http://localhost:4000";
const EXTENSION_DIR = join(here, "..", "..", "extension");
const PAGES = "http://localhost:5500";
const BROWSER = process.argv.includes("--browser");

const results = [];
const record = (id, title, status, detail) => {
  results.push({ id, title, status, detail });
  console.log(`${status.padEnd(6)} #${id} ${title}\n       ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
}
async function checkUrl(url) {
  const r = await post("/api/check-url", { url });
  if (r.status !== 200) {
    // A refused request would look like "not flagged" and give false PASSes.
    console.log(`\n/api/check-url returned ${r.status} (${r.json?.error ?? "no body"}). Link-check limit used up? Restart the backend and rerun.`);
    process.exit(2);
  }
  return r;
}
const analyze = (message) => post("/api/analyze", { message });
const pageText = (file) =>
  readFileSync(join(here, "extension-pages", file), "utf8")
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

// ---------------------------------------------------------------- API checks

async function apiChecks() {
  console.log(`\n== API checks against ${API}\n`);
  const health = await fetch(API + "/health/llm").then((r) => r.json()).catch(() => null);
  if (!health) {
    console.log("Backend not reachable. Start it first (see EXTENSION-FIX-CHECKS.md).");
    process.exit(1);
  }
  if (!health.reachable) console.log("Warning: the AI model isn't reachable, so #20 is checked without it.\n");

  // Guard: the real lookalikes must stay red whatever changes for #19/#24.
  const lookalikes = ["https://mcb-secure-verify.top/login", "https://sbmgrop.mu/login", "https://secure-absa.mu/verify", "https://mcb.mu@mcb-login.top/verify", "https://xn--mb-hmc.mu/login", "https://absa-online-banking.top/"];
  const notRed = [];
  for (const u of lookalikes) {
    const { json } = await checkUrl(u);
    if (!json?.signals?.some((s) => s.severity === "high")) notRed.push(u);
  }
  record("guard", "Fake bank sites still get the red badge", notRed.length ? "FAIL" : "PASS",
    notRed.length ? `no longer high: ${notRed.join(", ")}` : `${lookalikes.length}/${lookalikes.length} still high`);

  // #19
  const benign = ["https://en.wikipedia.org/wiki/MCB_Group", "https://www.linkedin.com/company/mcb-group", "https://www.lexpress.mu/article/mcb-annual-results", "https://defimedia.info/sbm-bank-new-branch", "https://github.com/absa/some-repo"];
  const red = [];
  for (const u of benign) {
    const { json } = await checkUrl(u);
    if (json?.signals?.some((s) => s.severity === "high")) red.push(u);
  }
  record(19, "Normal sites with a bank name in the address aren't red", red.length ? "FAIL" : "PASS",
    red.length ? `still high: ${red.join(", ")}` : `${benign.length}/${benign.length} not high`);

  // #24
  const weak = { "https://bit.ly/mcbhelp": null, "http://192.168.1.1/login": null };
  for (const u of Object.keys(weak)) weak[u] = (await checkUrl(u)).json?.signals ?? [];
  const caught = Object.values(weak).every((s) => s.length > 0);
  const amber = Object.values(weak).some((s) => s.length > 0 && !s.some((x) => x.severity === "high"));
  record(24, "Shortened / raw-IP links are flagged, amber badge reachable", caught && amber ? "PASS" : "FAIL",
    Object.entries(weak).map(([u, s]) => `${u} -> ${s.length ? s.map((x) => `${x.code ?? x.type}:${x.severity}`).join(",") : "not flagged"}`).join(" | "));

  // #20 (+ guard that a real scam is still a scam)
  const advice = await analyze(pageText("bank-advice.html"));
  const scam = await analyze(pageText("scam.html"));
  if (advice.status === 429 || scam.status === 429) {
    record(20, "Bank safety-advice page isn't called a scam", "SKIP", "analyze rate limit hit (20 per 15 min); restart the backend and rerun");
  } else {
    const a = advice.json;
    record(20, "Bank safety-advice page isn't called a scam", a.verdict !== "scam" ? "PASS" : "FAIL",
      `verdict ${a.verdict}, score ${a.riskScore}; signals ${a.signals.map((s) => `${s.code}:${s.severity}`).join(", ") || "none"}`);
    record("guard", "scam.html is still a scam", scam.json.verdict === "scam" ? "PASS" : "FAIL", `verdict ${scam.json.verdict}, score ${scam.json.riskScore}`);
  }

  // #25: after a report, does /api/check-url say anything about it?
  const host = "mcb-secure-verify.top";
  const rep = await post("/api/report", { sender: host });
  if (rep.status === 429) {
    record(25, "Reports are shown back on the next check", "SKIP", "report rate limit hit (5 per hour); restart the backend and rerun");
  } else {
    const after = (await checkUrl(`https://${host}/login`)).json;
    const mentions = JSON.stringify(after).match(/"[a-zA-Z]*[Rr]eport[a-zA-Z]*":\s*\d+/);
    record(25, "Reports are shown back on the next check", mentions ? "PASS" : "FAIL",
      mentions ? `check-url now returns ${mentions[0]} (reportCount after report: ${rep.json.reportCount})` : `reported (count ${rep.json.reportCount}), but /api/check-url returns no report count`);
  }

  // #29
  const readme = readFileSync(join(EXTENSION_DIR, "README.md"), "utf8");
  const stale = /frontend does not currently read it/i.test(readme);
  record(29, "README no longer says the web app ignores ?scan=", stale ? "FAIL" : "PASS",
    stale ? `extension/README.md still says "the frontend does not currently read it"` : "stale sentence gone");
}

// ------------------------------------------------------------ browser checks

async function browserChecks() {
  console.log(`\n== Browser checks (real extension from ${EXTENSION_DIR})\n`);
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    console.log("puppeteer isn't installed. In data/test-payloads run:\n  npm install --no-save puppeteer\n  npx puppeteer browsers install chrome");
    return;
  }
  const up = await fetch(PAGES).then(() => true).catch(() => false);
  if (!up) await import("./extension-pages/serve.mjs");

  const browser = await puppeteer.launch({ headless: false, pipe: true, enableExtensions: true, args: ["--no-first-run", "--window-size=1200,900"] });
  const id = await browser.installExtension(EXTENSION_DIR);
  const ext = (await browser.extensions()).get(id);
  const page = (await browser.pages())[0];
  await page.goto(PAGES); await sleep(1500); // first load after install isn't checked; warm up

  const openPopup = async (p = page) => {
    const before = new Set(browser.targets());
    await p.bringToFront();
    await p.triggerExtensionAction(ext);
    const t = await browser.waitForTarget((t) => !before.has(t) && t.url().startsWith(`chrome-extension://${id}/popup.html`), { timeout: 10000 });
    const popup = await t.asPage();
    await sleep(800);
    return popup;
  };
  const popupText = (popup) => popup.evaluate(() => ({
    text: document.getElementById("state-text").textContent,
    status: document.getElementById("action-status").textContent,
    body: document.body.innerText,
    reportDisabled: document.getElementById("report-btn").disabled,
  }));
  const scan = async (file, prep) => {
    await page.goto(`${PAGES}/${file}`); await sleep(2000);
    if (prep) await prep();
    const popup = await openPopup();
    await popup.click("#scan-page-btn");
    await popup.waitForFunction(() => !document.getElementById("scan-result-section").hidden || document.getElementById("action-status").className.includes("error"), { timeout: 90000 });
    await sleep(1000);
    const r = await popup.evaluate(() => ({
      error: document.getElementById("action-status").className.includes("error") ? document.getElementById("action-status").textContent : null,
      lines: [...document.querySelectorAll("#scan-result > p")].map((e) => e.textContent),
      handoff: document.getElementById("open-fraudlens-link").href,
    }));
    r.banner = await page.evaluate(() => document.getElementById("fraudlens-warning-banner")?.innerText.replace(/\s+/g, " ") ?? null);
    await popup.close().catch(() => {});
    return r;
  };

  try {
    // Guard + #30
    const s = await scan("scam.html");
    record("guard", "Scanning scam.html gives SCAM and a banner", !s.error && /SCAM/.test(s.lines[0]) && s.banner ? "PASS" : "FAIL", s.error ?? `${s.lines[0]}; banner: ${s.banner ?? "none"}`);
    const claimed = s.lines.find((l) => l.startsWith("Claimed identity"));
    record(30, "Page heading isn't shown as the claimed identity", claimed && /Messages I received|reported 0x/.test(claimed) ? "FAIL" : "PASS",
      `${claimed ?? "no claimed-identity line"} (AI-dependent: seen once, may pass by luck)`);

    // #21
    const safe = await scan("safe.html");
    record(21, "No warning banner on a SAFE page", safe.banner ? "FAIL" : "PASS", `${safe.lines[0] ?? safe.error}; banner: ${safe.banner ?? "none"}`);

    // #20 (in the browser, including the banner)
    const adv = await scan("bank-advice.html");
    record(20, "Bank safety-advice page: not SCAM, no banner", !/SCAM/.test(adv.lines[0] ?? "") && !adv.banner ? "PASS" : "FAIL", `${adv.lines[0] ?? adv.error}; banner: ${adv.banner ?? "none"}`);

    // #28
    const priv = await scan("privacy.html", async () => {
      await page.click('input[type="password"]', { clickCount: 3 }); await page.keyboard.type("CANARY-PWTYPED");
      await page.click("[contenteditable]", { clickCount: 3 }); await page.keyboard.type("CANARY-TYPED");
    });
    const sent = new URL(priv.handoff).searchParams.get("scan") ?? ""; // copy of the scanned text (page is under the 400-char handoff cap)
    const leaked = ["CANARY-USERNAME", "CANARY-PASSWORD", "CANARY-PWTYPED", "CANARY-HIDDEN", "CANARY-TEXTAREA", "CANARY-TYPED"].filter((c) => sent.includes(c));
    record(28, "Nothing typed into any box is sent when scanning", leaked.length ? "FAIL" : sent ? "PASS" : "FAIL",
      leaked.length ? `sent: ${leaked.join(", ")}` : sent ? "no canary text in the scanned text" : `couldn't read scanned text (${priv.error ?? "no handoff link"})`);

    // #26
    await page.goto("chrome://newtab/"); await sleep(1500);
    let popup = await openPopup();
    const before = await popupText(popup);
    if (!before.reportDisabled) { await popup.click("#report-btn"); await sleep(2000); }
    const after = await popupText(popup);
    await popup.close().catch(() => {});
    const reportedJunk = /Reported\./.test(after.status);
    if (/too many/i.test(after.status)) record(26, "Browser pages: no junk report, no 'reload the page'", "SKIP", "report limit (5 per hour) used up; restart the backend and rerun");
    else record(26, "Browser pages: no junk report, no 'reload the page'", !reportedJunk && !/reload the page/i.test(before.text) ? "PASS" : "FAIL",
      `popup says "${before.text}"; report: ${before.reportDisabled ? "button disabled" : after.status || "nothing happened"}`);

    // #23: how many link checks do 60 tab switches cost?
    const remaining = async () => Number((await checkUrl("https://example.com/")).headers.get("ratelimit-remaining"));
    const sites = ["https://en.wikipedia.org/wiki/Mauritius", "https://mcb.mu/", `${PAGES}/safe.html`, "https://mcb-secure-verify.top/login", "https://sbmgrop.mu/login", "https://secure-absa.mu/verify"];
    const tabs = [];
    for (const u of sites) { const t = await browser.newPage(); await t.goto(u, { timeout: 20000 }).catch(() => {}); tabs.push(t); }
    await sleep(3000);
    const r0 = await remaining();
    for (let i = 0; i < 60; i++) { await tabs[i % tabs.length].bringToFront(); await sleep(80); }
    await sleep(4000);
    const r1 = await remaining();
    const used = r0 - r1 - 1; // minus our own measuring call
    if (r0 < 70 || r1 <= 0) {
      record(23, "Switching tabs doesn't re-check every time", "SKIP", `only ${r0} link checks were left before the test, so it can't be measured; restart the backend and rerun`);
    } else {
      record(23, "Switching tabs doesn't re-check every time", used <= 10 ? "PASS" : "FAIL",
        `60 switches between 6 already-checked tabs used ${used} of the 120 link checks (was ~60 before). The 429 wording still needs a manual look.`);
    }
    for (const t of tabs) await t.close();

    // #22: last, because it waits for the background script to sleep.
    await page.bringToFront();
    await page.goto("https://mcb-secure-verify.top/login").catch(() => {}); await sleep(2500);
    const swAlive = () => browser.targets().some((t) => t.type() === "service_worker" && t.url().includes(id));
    const t0 = Date.now();
    while (swAlive() && Date.now() - t0 < 120000) await sleep(2000);
    const asleep = !swAlive();
    const idle = Math.round((Date.now() - t0) / 1000);
    popup = await openPopup(); // this wakes it again
    const slept = await popupText(popup);
    record(22, "Popup still shows the result after the extension sleeps", !asleep ? "SKIP" : /Not checked yet/.test(slept.text) ? "FAIL" : "PASS",
      asleep ? `extension went to sleep after ${idle}s idle; popup then says "${slept.text}"` : `extension never went to sleep in ${idle}s, so this couldn't be tested`);
  } finally {
    await browser.close();
  }
}

await apiChecks();
if (BROWSER) await browserChecks();
record(27, "Right-click checks show progress and honest error text", "MANUAL", "Chrome's right-click menu can't be scripted; see EXTENSION-FIX-CHECKS.md");
if (!BROWSER) console.log("\n(#21, #22, #23, #26, #28, #30 need --browser)");

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count("PASS")} pass, ${count("FAIL")} fail, ${count("SKIP")} skipped, ${count("MANUAL")} manual`);
process.exit(count("FAIL") ? 1 : 0);
