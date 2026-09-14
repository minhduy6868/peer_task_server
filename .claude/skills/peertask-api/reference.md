# API endpoints

## Auth `/auth` + `/token`

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/auth/me` | yes |
| POST | `/auth/register` | no |
| POST | `/auth/login` | no |
| POST | `/auth/forgot-password` | no |
| POST | `/auth/reset-password` | no |
| PUT | `/auth/profile` | yes |
| POST | `/auth/change-password` | yes |
| POST | `/token/refresh` | no |
| POST | `/token/logout` | no |

## Workspaces `/workspaces`

`POST/GET /workspaces`, `GET/PUT/DELETE /workspaces/:id`, invite + invite-link + join + members CRUD (`/:workspaceId/members`).

## Boards `/boards`

`POST /boards`, `GET /boards/workspace/:workspaceId`, `GET/PUT/DELETE /boards/:id`, members at `/:boardId/members`.

## Tasks `/tasks`

`GET /tasks/board/:boardId`, `POST /tasks`, `PUT/DELETE /tasks/:taskId`, `POST /tasks/reorder`, `POST /tasks/:taskId/move`, `GET /tasks/board/:boardId/stats`, `GET /tasks/my-tasks`.

## Operations `/operations`

`GET /operations/board/:boardId?since=`, `POST /operations` (body `operationId`, `operationType`, `payload`, `timestamp`), count + cleanup.

## Other

`GET /health`, `/ai/health`, `/ai/tags`, `POST /ai/generate`, `/ai/generate/stream`, `/ai/chat`. `DELETE /admin/clear` is destructive.
