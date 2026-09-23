# FraudLens Outlook add-in

A read-mode Microsoft Outlook task pane for the existing FraudLens pipeline.
It analyses the email the user currently has open and posts one request to
`POST /api/analyze` containing both `message` and `emailContext`. There is no
add-in-specific score, detector, verdict, or LLM call.

## What it reads

With the manifest's `ReadItem` permission, the add-in uses Office.js to read:

- current message body as text (HTML-to-text fallback), From display name and
  address, subject, internet message ID, and attachment metadata;
- the mailbox owner's address as the recipient used for duplicate-safe,
  pseudonymised organisation observations;
- HTML link targets without opening them; and
- when the client supports Mailbox 1.8, internet headers used to parse
  Reply-To, Return-Path, SPF, DKIM, and DMARC results.

It never downloads attachment contents, modifies or sends mail, contacts a
supplier, or scans the mailbox. Conversation history and sender history are
not available from this bounded read-mode flow, so `threadContext` and
`senderContext` are `null`. Missing headers become `unknown`, never `fail`.

The current-message body is normalised, recognisable quoted history is removed
only after enough current-message text, and the remainder is capped at 4,800
characters to stay within the API's 5,000-character limit. Up to 25 non-inline
attachment metadata records and 50 HTTP(S) hrefs are included.

## Local setup and sideload

Requirements: Node.js, Outlook on the web/new Outlook/classic Outlook/Mac,
and an account that permits custom add-ins.

1. Start the API:

   ```powershell
   cd ..\backend
   npm install
   npm run dev
   ```

2. Install the add-in dependencies and the trusted localhost certificate:

   ```powershell
   cd ..\outlook-addin
   npm install
   npm run certs
   npm run dev
   ```

3. Confirm `https://localhost:3001` opens without a certificate warning.
4. In Outlook, open **Apps / Get Add-ins**, then **My add-ins** or **My Apps**,
   choose **Add a custom add-in → Add from file**, and select `manifest.xml`.
   Microsoft moves this entry between menus across clients; use its official
   [sideloading guide](https://learn.microsoft.com/office/dev/add-ins/outlook/sideload-outlook-add-ins-for-testing)
   if the label differs.
5. Open a received email, choose **FraudLens → Analyse email**, and press the
   task-pane **Analyse email** button.

Vite proxies `/fraudlens-api/*` to `http://localhost:4000/api/*`; this keeps the
Office task pane HTTPS and avoids mixed-content requests during development.

## Test and demo

```powershell
npm test
npm run build
npm run validate
```

With the backend running on port 4000, exercise the five synthetic scenarios:

```powershell
npm run smoke:demo
```

The fixtures cover obvious phishing, executive BEC, supplier bank-detail
change, suspicious language from a legitimate authenticated supplier mailbox,
and a legitimate supplier invoice. They use `.example` identities only.

## Production / VPS deployment

The Office task pane and API must be served over HTTPS. Two options:

### Option A: split-host with a real domain

`https://addin.example.org` for the static bundle and
`https://api.example.org/api` for the API:

```powershell
$env:VITE_FRAUDLENS_API_URL='https://api.example.org/api'
npm run build
$env:ADDIN_BASE_URL='https://addin.example.org'
npm run manifest:prod
```

Serve `dist/` from the add-in host. `manifest:prod` writes
`dist/manifest.xml` with that same origin; distribute/sideload that rendered
manifest. On the backend set:

```dotenv
NODE_ENV=production
OUTLOOK_ADDIN_ORIGINS=https://addin.example.org
```

For multiple approved deployments, use an exact comma-separated list. No
wildcards are accepted. The reverse proxy must terminate TLS and set
`X-Forwarded-Proto`; the backend redirects forwarded HTTP in production.
Never point an HTTPS task pane at an HTTP API.

### Option B: single Tailscale hostname (no domain, no CORS)

Serves the addin and API under one origin via a Tailscale node's own
`*.ts.net` HTTPS hostname (`tailscale serve`, cert auto-issued, trusted CA).
Reachable by anyone on the tailnet; use `tailscale funnel` instead of
`serve` to make it public (needs the tailnet's ACL policy to grant the
`funnel` `nodeAttrs` capability, and the node's public DNS record can take a
few minutes to propagate after approval).

On the VPS, once the repo is cloned and Node 22 is installed:

```bash
cd backend
npm install
npm rebuild better-sqlite3 --build-from-source   # only if Node was upgraded after the original npm install
npm i -g pm2
pm2 start npm --name fraudlens-backend --cwd "$(pwd)" -- run start
pm2 save && pm2 startup   # run the printed command once, survives reboot

cd ../outlook-addin
npm install
VITE_FRAUDLENS_API_URL=/api npm run build
ADDIN_BASE_URL=https://<node-name>.<tailnet>.ts.net npm run manifest:prod
```

Then route both under that one hostname:

```bash
tailscale serve --bg --set-path=/api http://localhost:4000/api
tailscale serve --bg --set-path=/ ./dist
tailscale serve status
```

`--set-path` **strips** the mount prefix before forwarding — the proxy
target must already include `/api` (`http://localhost:4000/api`, not
`http://localhost:4000`) or every request 404s as `Cannot POST /analyze`
once it reaches the backend. Same-origin means `OUTLOOK_ADDIN_ORIGINS` isn't
load-bearing for browser CORS here, but still set it to the `.ts.net` origin
for defense in depth.

Grab the rendered manifest for sideloading:

```powershell
scp <vps-host>:/opt/fraudlens/outlook-addin/dist/manifest.xml .
```

Known gotchas hit in practice:
- Upgrading Node after `npm ci`/`npm install` orphans `better-sqlite3`'s
  native binary (`NODE_MODULE_VERSION` mismatch) — rebuild from source, a
  plain `npm rebuild` without `--build-from-source` can silently reuse the
  stale prebuilt binary.
- `pm2 start` doesn't dedupe by name across separate shell sessions; check
  `pm2 list` for duplicate processes fighting over the same port before
  chasing a phantom crash loop.
- Testing the public hostname with `curl` **from the VPS itself** is
  unreliable (self-loopback routing/TLS SNI quirks); verify from a genuinely
  separate machine.

### Sideloading for testers (school/work Microsoft 365 accounts)

School and work M365 tenants commonly block custom add-in sideloading for
students/staff by default (an admin-center policy, not something fixable
client-side). If `https://aka.ms/olksideload` shows no **Custom Addins**
option, either get IT to enable custom add-ins for the account, or sideload
against a personal `outlook.com` account instead for the demo.

Sideload steps once you have `dist/manifest.xml`:

1. Go to `https://aka.ms/olksideload` — opens Outlook on the web and pops
   the **Add-Ins for Outlook** dialog.
2. **My add-ins** → **Custom Addins** → **Add a custom add-in** →
   **Add from File** → pick `manifest.xml`.
3. Open a received email (task pane only loads on the Read form) and check
   the ribbon, including the `...` overflow menu, for **FraudLens** →
   **Analyse email**.

## Request shape

The actual request is intentionally the existing contract:

```json
{
  "source": "email",
  "message": "current visible message body",
  "emailContext": {
    "messageId": "<id@example>",
    "from": { "name": "ABC Supplies", "address": "accounts@abc-supplies.example" },
    "replyTo": [],
    "returnPath": null,
    "subject": "Invoice 1182",
    "authentication": { "spf": "unknown", "dkim": "unknown", "dmarc": "unknown" },
    "attachments": [],
    "urls": [],
    "threadContext": null,
    "recipient": "employee@demo-company.example",
    "senderContext": null
  }
}
```

The task pane renders the API's deterministic score and trace, separates
verified findings from AI-inferred language findings, shows comparison
metadata and verification workflows, and explicitly preserves deterministic
results when semantic analysis is unavailable.
