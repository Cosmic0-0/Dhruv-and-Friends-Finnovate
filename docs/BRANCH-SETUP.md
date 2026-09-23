# Branch Setup

Use a feature branch and open a PR into `main`. Branch protection is not
configured, so this remains a team convention rather than an enforced rule.

## One-time setup

```bash
git fetch origin
git checkout -b <your-branch>
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
2. **Coordinate cross-area changes.** If an API shape changes, update
   `docs/API-CONTRACT.md`, the frontend client, and the extension together.
3. **Commit and push to your own branch**, never `main`:
   ```bash
   git add <files>
   git commit -m "..."
   git push origin <your-branch>
   ```
4. **Open a PR into `main`** when your change is ready for review:
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
don't resolve them by overwriting `main`. If a conflict touches the API
contract, verify the implementation and all clients before choosing a side.
