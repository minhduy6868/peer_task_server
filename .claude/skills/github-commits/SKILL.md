---
name: github-commits
description: Creates Conventional Commits and GitHub PRs for peer_task_server. Use when the user asks to commit, branch, open a PR, or write a commit message in the API repo.
---

# GitHub & commits (server)

Repo: `minhduy6868/peer_task_server`. Base branch: `dev`. Production branch: `main`. Work only inside `server/`.

## Branch

```bash
git checkout dev
git pull origin dev
git checkout -b feat/task-stats
```

## Commit

Only when the user asks. Never stage `.env`, dumps, or `client/` files.

```
feat(tasks): return subtask counts on board list

The client needs completed_subtask_count without N+1 queries.
```

Scopes: `auth`, `workspace`, `board`, `task`, `ops`, `socket`, `db`, `ai`.

PowerShell:

```powershell
git commit -m @"
feat(tasks): return subtask counts on board list

The client needs completed_subtask_count without N+1 queries.
"@
```

No `--no-verify`. No force-push `dev`/`main`. Amend only if the user asked, commit is yours, unpushed, not on `dev`.

## PR

```bash
git push -u origin HEAD
gh pr create --base dev --title "feat(tasks): return subtask counts on board list" --body-file pr.md
```

PR body must include a Test plan (`npm run db:check`, migrate if schema changed).

## Additional resources

- Examples: [examples.md](examples.md)
