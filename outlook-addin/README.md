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

The Office task pane and API must be served over HTTPS. A typical split-host
deployment uses `https://addin.example.org` for the static bundle and
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
