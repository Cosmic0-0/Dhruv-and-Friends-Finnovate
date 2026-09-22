# Branch Setup

Convention (see `CLAUDE.md` → Role gating): everyone except the backend
owner works on their own branch and opens a PR into `main`; the backend
owner reviews and merges. This is a convention, not an enforced GitHub
rule — no branch protection is configured, so it only works if everyone
actually pushes to their own branch instead of `main`.

Branches already exist on the remote for each teammate: `joshua`, `oleg`,
`dhruv`, `caellum`. You don't need to create one — just check yours out.

## One-time setup

```bash
git fetch origin
git checkout <your-branch>   # joshua | oleg | dhruv | caellum
```

Confirm you're on the right branch and it's tracking the remote:

```bash
git status
# On branch <your-branch>
# Your branch is up to date with 'origin/<your-branch>'.
```

## Daily workflow

1. **Pull `main` into your branch before starting work**, so you're not
   building on a stale API contract or stale role-gated directories:
   ```bash
   git checkout <your-branch>
   git fetch origin
   git merge origin/main
   ```
2. **Only edit files inside your gated directory** (see `CLAUDE.md` → Role
   gating table). If you need something in someone else's directory — e.g.
   Oleg wiring up `POST /api/analyze` — that's expected (it's a consumer of
   the interface), but don't edit another owner's implementation files
   directly; flag it to them instead.
3. **Commit and push to your own branch**, never `main`:
   ```bash
   git add <files>
   git commit -m "..."
   git push origin <your-branch>
   ```
4. **Open a PR into `main`** when your change is ready for the backend
   owner to review:
   ```bash
   gh pr create --base main --head <your-branch> --title "..." --body "..."
   ```
   (or use the GitHub web UI — same effect)
5. **Re-sync after your PR merges** so your branch doesn't drift from
   `main` on your next round of changes:
   ```bash
   git checkout <your-branch>
   git fetch origin
   git merge origin/main
   ```

## If your branch and `main` conflict

Resolve conflicts locally on your branch before opening/updating the PR —
don't resolve them by overwriting `main`. If a conflict touches a file
outside your gated directory (e.g. the API contract in
`docs/API-CONTRACT.md`), flag it in the PR rather than resolving it
unilaterally — the shape may have changed for a reason.
