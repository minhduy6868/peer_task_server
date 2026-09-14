# Requirements — PeerTask Server

Phạm vi: HTTP API, PostgreSQL, Socket.IO. UI thuộc client.

Ưu tiên: **P0** bắt buộc · **P1** đã có / giữ · **P2** mở rộng.

## 1. Mục tiêu

Cung cấp identity, phân quyền, persistence task/operation, và signaling để nhiều client cộng tác trên một board.

## 2. Actors

| Actor | Xác thực |
| --- | --- |
| Anonymous | register/login/forgot/reset, health, AI proxy, GET invite |
| User JWT | mọi REST còn lại + socket online |
| Offline socket | không JWT; chỉ room `roomCode` |
| Workspace owner / editor / viewer | role DB |
| Board owner / editor / viewer | `is_board_owner` + `permission` |

## 3. Functional — Nền tảng (P0)

| ID | Yêu cầu | Chấp nhận |
| --- | --- | --- |
| S-PLT-01 | `GET /health` | `{ status: "ok", timestamp }` không auth |
| S-PLT-02 | CORS mở cho Flutter (mọi origin hiện tại) | Client web/desktop gọi được |
| S-PLT-03 | JSON `express.json()` | Body parse lỗi → 400, không 500 trống |
| S-PLT-04 | Không prefix `/api` | `POST /auth/login` 200/401; `POST /api/auth/login` 404 |

## 4. Functional — Auth (P0)

| ID | Yêu cầu | Chấp nhận |
| --- | --- | --- |
| S-AUTH-01 | `POST /auth/register` | email unique, password ≥ 6, 201 + user + 2 token; trùng email `EMAIL_EXISTS` 400 |
| S-AUTH-02 | `POST /auth/login` | bcrypt; sai → không lộ “email tồn tại” chi tiết hơn cần thiết |
| S-AUTH-03 | Access ~1h, refresh 7d, cùng `JWT_SECRET` | Hết hạn access → 403/401; refresh còn hạn cấp access mới |
| S-AUTH-04 | `POST /token/refresh` | Token revoked/hết hạn fail; không cấp nếu không có row |
| S-AUTH-05 | `POST /token/logout` | Đánh dấu revoked |
| S-AUTH-06 | `GET /auth/me` | Không trả `password_hash` |
| S-AUTH-07 | Forgot / reset | Token một lần, hết hạn; email fail không chặn response chính (best-effort) |
| S-AUTH-08 | Change password | Cần current password đúng |

## 5. Functional — Workspace & board (P0)

| ID | Yêu cầu | Chấp nhận |
| --- | --- | --- |
| S-WS-01 | CRUD workspace | Chỉ owner xóa / đổi member role |
| S-WS-02 | Tạo workspace | Creator là owner trong `workspace_members` |
| S-WS-03 | Invite email + invite-link + join + revoke | Token hết hạn / max_uses từ chối join |
| S-WS-04 | Editor tạo board; viewer không | 403 `Requires editor or owner` |
| S-WS-05 | List board | Owner: tất cả; khác: chỉ `board_members` |
| S-WS-06 | Workspace owner = edit mọi board | Không cần hàng `board_members` |
| S-WS-07 | Board members `edit\|view`, `is_board_owner` | Chỉ owner (board hoặc workspace) PUT/DELETE member; editor có access được POST add |

## 6. Functional — Task (P0)

| ID | Yêu cầu | Chấp nhận |
| --- | --- | --- |
| S-TK-01 | CRUD + filter `assignee_id`, `status`, `priority`, `parent_id` | Enum sai → 400 |
| S-TK-02 | Assignees ⊆ board members ∪ workspace owner | User lạ → 400, không insert |
| S-TK-03 | `position` theo `(board_id, status)` | create lấy next; move/reorder không trùng loạn cột |
| S-TK-04 | Subtask `parent_id` | Xóa parent cascade theo FK migration |
| S-TK-05 | `GET /tasks/board/:id/stats`, `GET /tasks/my-tasks` | Chỉ task user được xem |
| S-TK-06 | Viewer không ghi task | `requireBoardEdit` / `requireTaskEdit` → 403 |

## 7. Functional — Operations (P0)

| ID | Yêu cầu | Chấp nhận |
| --- | --- | --- |
| S-OP-01 | `POST /operations` | Validate type; dup `operationId` → 200, không 500 |
| S-OP-02 | `GET /operations/board/:id?since=` | Sort `timestamp` ASC; JSON `{ opId, actor, timestamp, type, payload }` |
| S-OP-03 | View mới đọc; edit mới ghi | 403 nếu không có quyền board |
| S-OP-04 | Cleanup | `DELETE .../cleanup` theo `olderThan` |

## 8. Functional — Signaling (P0)

| ID | Yêu cầu | Chấp nhận |
| --- | --- | --- |
| S-SIG-01 | JWT socket: join board room | `room_joined.peers` đủ socketId/userId/userName/avatar/isMuted |
| S-SIG-02 | `signal` chỉ tới `to` | Peer khác trong room không nhận SDP đó |
| S-SIG-03 | Disconnect | `peer_left`; room rỗng bị xóa khỏi map |
| S-SIG-04 | Offline không JWT | `create_room` / `join_room` theo `roomCode`; room sai → `error` |
| S-SIG-05 | Tách map online / offline | Join offline không lộ peer online |

## 9. Functional — AI & admin (P1)

| ID | Yêu cầu | Chấp nhận |
| --- | --- | --- |
| S-AI-01 | Proxy Ollama | Down → 503 + hint, không 500 stack lộ nội bộ trên prod |
| S-ADM-01 | `DELETE /admin/clear` | Coi là nguy hiểm; không expose trên prod nếu không có bảo vệ thêm (P2: khóa admin) |

## 10. Non-functional

| ID | Hạng | Yêu cầu |
| --- | --- | --- |
| S-NFR-01 | Bảo mật | Parameterized SQL; bcrypt ≥ 10; không log password; không commit `.env` |
| S-NFR-02 | JWT | Secret ≥ 32 ký tự trên prod; HTTPS phía reverse proxy |
| S-NFR-03 | DB | Postgres 13+; migrate idempotent `IF NOT EXISTS` |
| S-NFR-04 | Lỗi | 4xx có `code` ổn định; 500 không stack khi `NODE_ENV=production` |
| S-NFR-05 | Quan sát | Log 5xx kèm url/method/user id, không body password |
| S-NFR-06 | Scale | Ghi rõ rooms in-memory: một instance; restart mất peer list |
| S-NFR-07 | Tương thích client | `snake_case` cột; không đổi tên field Dart (`accessToken`, `opId`) mà không bump client |

## 11. Ngoài phạm vi server

- Flutter UI, l10n, Hive
- CRDT apply / LWW (client `SyncEngine`)
- TURN server (WebRTC ngoài signaling)
- Multi-region Socket.IO (chưa có Redis adapter)

## 12. Phụ thuộc

| Hệ thống | Bắt buộc |
| --- | --- |
| PostgreSQL | có |
| EmailJS | không (forgot/welcome best-effort) |
| Cloudinary | không |
| Ollama | không (AI tắt thì 503) |
