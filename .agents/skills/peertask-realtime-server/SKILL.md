---
name: peertask-realtime-server
description: Socket.IO signaling, online board rooms, and offline P2P rooms for the PeerTask server. Use when editing src/sockets.
---

# Realtime (server)

File: `src/sockets/signaling.js`. In-memory maps only — restart drops rooms.

## Auth

`handshake.auth.token` + `JWT_SECRET`. No token ⇒ `setupOfflineHandlers`. Invalid token ⇒ connection error.

## Online

- `join_room(boardId)` — leave previous room first
- Load `name`/`avatar` from `users`, store in `socketToUserInfo`
- Emit `room_joined` to joiner, `peer_joined` to others
- `signal` `{ to, signal }` → `signal` `{ from, signal }`
- `update_mic_status` → `peer_mic_updated`
- `leave_room` / disconnect → `peer_left`, delete empty rooms

Do not broadcast full board JSON. Persist ops on REST `/operations`.

## Offline

- `create_room` / `join_room` `{ roomCode, userName }`
- Join `offline_${roomCode}`
- `peers_in_room`, `peer_joined`, `peer_left`
- Delete `offlineRooms` entry when empty

Keep `rooms` and `offlineRooms` separate.
