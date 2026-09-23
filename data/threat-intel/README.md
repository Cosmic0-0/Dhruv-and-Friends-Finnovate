# Threat intelligence lists

Used by `backend/src/services/threat-intel` for REP-05 ("link is on a
known-malicious list") in `/api/check-url` and in message analysis.

| File | What | Committed |
|---|---|---|
| `local-blocklist.txt` | Entries the team adds by hand, with evidence | yes |
| `openphish.txt` | [OpenPhish community feed](https://openphish.com/), refreshed with `npm run update:threat-feed` in `backend/` | no (gitignored) |

Refresh the feed before a demo; it goes stale within hours. The backend
re-reads these files within a minute of them changing, no restart needed.
The OpenPhish community feed is free for non-commercial use - check its
terms before any commercial deployment.
