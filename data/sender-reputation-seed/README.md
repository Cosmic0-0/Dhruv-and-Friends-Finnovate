# Sender-reputation seed data

Seed data for the crowdsourced threat feed demo (`POST /api/report` /
`reportCount`) so the "this number reported N times" feature has
believable numbers before real reports come in.

## Files

- `senders.json`: 8 made-up Mauritius mobile numbers (`+230 5900 00xx`),
  each with a report count, a scam type, the related test payloads, and a
  ready-to-paste `demoMessage` (en, fr or Kreol) that contains the number.
- `load.mjs`: loads `senders.json` into the backend database.
- `seed.test.mjs`: checks the file and the loader.

This is demo data. The project only runs for the hackathon, so it goes
straight into the same `reports` table as live reports. If the project
ever continues, wipe that table before real use.

## Usage (from the repo root, after `npm install` in `backend/`)

```
node data/sender-reputation-seed/load.mjs           # top each number up to its count
node data/sender-reputation-seed/load.mjs --reset   # wipe ALL reports, then load
node --test data/sender-reputation-seed/seed.test.mjs
```

Running it twice does not double the counts. Run `--reset` before each
rehearsal and before the real demo, to undo reports made live on stage
and clear leftover test reports. It writes to backend/.env's
`DATABASE_URL`, so the same file the backend reads.

## Why phone numbers only, never bank or telecom names

When a message is pasted, the backend looks up the sender the AI picks out
of the message. For bank messages that's the brand, e.g. "MCB". Seeding
"MCB" would show "reported N times" on genuine MCB messages too. So each
demo message names no brand and contains only the number.

Whether the AI actually picks out the number (and not something else) is
up to the model, so paste each `demoMessage` through the live model before
relying on it in the demo. The Before-You-Pay check (`/api/check-sender`)
and the Radar leaderboard don't depend on the AI.
