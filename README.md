# PeerTask Server

API REST + signaling Socket.IO cho PeerTask. PostgreSQL là nguồn sự thật cho user, workspace, board, task, và operation log.

Upstream: [minhduy6868/peer_task_server](https://github.com/minhduy6868/peer_task_server) · branch mặc định `dev`.

## Tài liệu

| Doc | Nội dung |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | HTTP, DB, quyền, signaling |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Yêu cầu chức năng và phi chức năng |
| [AGENTS.md](AGENTS.md) | Hướng dẫn agent (Cursor / Codex) |
| [CLAUDE.md](CLAUDE.md) | Hướng dẫn Claude Code |

Client: [peer_task_client](https://github.com/minhduy6868/peer_task_client).

## Server làm gì / không làm gì

**Làm:** JWT, CRUD workspace/board/task, invite, permission, lưu `board_operations`, relay WebRTC signal, proxy Ollama tại `/ai/*`.

**Không:** prefix `/api`. Không render canvas. Không relay toàn bộ board qua Socket.IO (chỉ SDP/ICE + room).

## Yêu cầu

- Node.js >= 16
- PostgreSQL >= 13
- npm

## Cài đặt

```bash
npm install
cp .env.example .env
# createdb peertask
npm run db:migrate
node src/db/migrations/add_task_fields.js
npm run dev
```

Lắng nghe `http://localhost:3000`. Health: `GET /health`.

## Biến môi trường

Bắt buộc:

```
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/peertask
JWT_SECRET=at-least-32-chars
NODE_ENV=development
```

Access token và refresh token **đều** ký bằng `JWT_SECRET` (code không đọc `JWT_REFRESH_SECRET`).

Tùy chọn: EmailJS (`EMAILJS_*`), Cloudinary (`CLOUDINARY_*`), `OLLAMA_URL` (mặc định `http://localhost:11434`).

## Scripts

```bash
npm run dev          # nodemon
npm start            # node src/index.js
npm run db:migrate
npm run db:check
npm run db:cleanup
npm run db:reset     # xóa toàn bộ dữ liệu
```

## Mount thực tế (`src/index.js`)

`/auth` · `/token` · `/workspaces` · `/boards` · `/tasks` · `/operations` · `/admin` · `/ai` · `/health`

Chi tiết path: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) hoặc skill `peertask-api`.

## Git

- Branch từ `dev`: `feat/<slug>`, `fix/<slug>`, …
- Conventional Commits, ví dụ `fix(permissions): grant workspace owner edit on all boards`
- PR template: `.github/pull_request_template.md`
- Không commit `.env`. Ghi migration trong Test plan của PR.
