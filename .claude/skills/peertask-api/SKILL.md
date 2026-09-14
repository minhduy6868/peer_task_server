---
name: peertask-api
description: PeerTask REST contract for the Express server. Use when adding or changing HTTP endpoints, JSON, or error codes.
---

# PeerTask API

Base origin has **no `/api` prefix**. README mentions of `/api/auth` are outdated — trust `src/index.js`.

## Auth JSON

```json
{
  "user": { "id": "uuid", "email": "...", "name": "...", "createdAt": "..." },
  "accessToken": "...",
  "refreshToken": "..."
}
```

`GET /auth/me` uses `created_at`. Refresh: `{ "refreshToken" }` → `{ "accessToken" }`.

## Enums

| Field | Values |
| --- | --- |
| workspace `role` | `owner`, `editor`, `viewer` |
| board `permission` | `edit`, `view` |
| task `status` | `todo`, `doing`, `done` |
| task `priority` | `low`, `medium`, `high`, `urgent` |
| `operationType` | `createObject`, `updateObject`, `deleteObject`, `moveObject`, `resizeObject` |

## Errors

```json
{ "success": false, "error": { "message": "...", "code": "FORBIDDEN", "statusCode": 403 } }
```

New routes must use `AppError` so Flutter `ApiError.fromJson` works. Older `{ error: "string" }` is legacy.

## Additional resources

- Full path list: [reference.md](reference.md)
