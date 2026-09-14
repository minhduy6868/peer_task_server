# PeerTask server — Claude Code

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) before large changes.

Express + PostgreSQL + Socket.IO. Always-on project context. Skills: `.claude/skills/` (`/skill-name` or auto when the task matches).

Do not edit `../client`. Commit only in this repo (`peer_task_server`, base `dev`, deploy `main`).

## Skills

| Command | When |
| --- | --- |
| `/peertask-backend` | Routes, middleware, DB, env |
| `/peertask-api` | REST contract, status codes, JSON |
| `/peertask-realtime-server` | Socket.IO rooms and signaling |
| `/github-commits` | Branch, Conventional Commit, PR |

## Facts

- No `/api` prefix. Mounts: `/auth`, `/token`, `/workspaces`, `/boards`, `/tasks`, `/operations`, `/admin`, `/ai`, `/health`.
- JWT `Authorization: Bearer`. Refresh: `POST /token/refresh` `{ refreshToken }`.
- Roles: workspace `owner|editor|viewer`. Board `edit|view` + `is_board_owner`. Workspace owner edits all boards.
- Tasks: `todo|doing|done`, priority `low|medium|high|urgent`.
- Ops: `createObject|updateObject|deleteObject|moveObject|resizeObject`. Dedup `operation_id`.
- Mutating routes: `authenticateToken` + permission middleware + `AppError`/`asyncHandler`. Parameterized SQL only.
- Never commit `.env` or `JWT_SECRET`.
