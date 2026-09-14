# PeerTask server — agent guide

Express + PostgreSQL + Socket.IO. This repo only — do not edit `../client`.

Product docs: [README.md](README.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Tool paths

| Tool | Always-on | Skills |
| --- | --- | --- |
| Cursor | `.cursor/rules/` | `.cursor/skills/` |
| Codex | `AGENTS.md` | `.agents/skills/` ([docs](https://developers.openai.com/codex/skills)) |
| Claude Code | `CLAUDE.md` | `.claude/skills/` ([docs](https://code.claude.com/docs/en/skills)) |

Keep the three skill trees in sync (same `SKILL.md` names and body).

## Skills

| Skill | When |
| --- | --- |
| `peertask-backend` | Routes, middleware, DB, env |
| `peertask-api` | REST contract, status codes, JSON |
| `peertask-realtime-server` | Socket.IO signaling, rooms |
| `github-commits` | Branches, commits, PRs |

Codex: `$peertask-api` or `/skills`. Claude: `/peertask-api`.

## Facts

- Routes are **not** under `/api`. Mounts: `/auth`, `/token`, `/workspaces`, `/boards`, `/tasks`, `/operations`, `/admin`, `/ai`, `/health`.
- JWT in `Authorization: Bearer`. Refresh: `POST /token/refresh` `{ refreshToken }`.
- Roles: workspace `owner|editor|viewer`. Board `edit|view` + `is_board_owner`. Workspace owner has edit on all boards.
- Tasks: `todo|doing|done`, priority `low|medium|high|urgent`.
- Ops: `createObject|updateObject|deleteObject|moveObject|resizeObject`. Dedup `operation_id`.
- New mutating routes: `authenticateToken` + permission middleware + `AppError`/`asyncHandler`.

## Git

Upstream: `https://github.com/minhduy6868/peer_task_server` (`dev` develop, `main` deploy).
