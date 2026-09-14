# Backend reference

## Env

| Variable | Required |
| --- | --- |
| `DATABASE_URL` | yes |
| `JWT_SECRET` | yes (access + refresh) |
| `PORT` | no (3000) |
| `OLLAMA_URL` | no (`http://localhost:11434`) |
| EmailJS / Cloudinary | no |

## Scripts

```bash
npm run dev
npm run db:migrate
npm run db:check
npm run db:cleanup
npm run db:reset
node src/db/migrations/add_task_fields.js
```

## Tables

`users`, `refresh_tokens`, `password_reset_tokens`, `workspaces`, `workspace_members`, `workspace_invites`, `boards`, `board_members`, `tasks`, `strokes`, `board_operations`.

## Permission helpers

`requireWorkspaceMember|Owner|Editor`, `requireBoardView|Edit|Owner|Editor`, `requireTaskEdit`.

IDs: `req.params.boardId || req.params.id || req.body.boardId` (same for workspace).
