---
name: peertask-backend
description: Implements PeerTask Express routes, PostgreSQL, JWT, and permission middleware. Use when editing server src, migrations, or env in the API repo.
---

# PeerTask backend

## Stack

Express 4, CommonJS, `pg` Pool (`DATABASE_URL`), Socket.IO on the same HTTP server, `express-validator`, `AppError` + `asyncHandler`.

## Add a route

1. Extend `src/routes/`.
2. `authenticateToken` unless public (`/auth/register`, login, forgot/reset, `/health`, `/ai/*`, invite GET).
3. Permission helper from `middleware/permissions.js`.
4. Parameterized SQL. Return `snake_case` JSON.
5. Mount in `src/index.js` — **no** `/api`.

```javascript
router.post('/', authenticateToken, requireBoardEdit, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `INSERT INTO tasks (id, board_id, title, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, boardId, title, req.user.id]
  );
  res.status(201).json(result.rows[0]);
}));
```

## Permissions

Workspace owner → `edit` on every board. Editor/viewer → only `board_members`. Use existing helpers; do not re-implement.

## Schema

Baseline: `src/db/migrate.js`. Extra task columns: `src/db/migrations/add_task_fields.js`.

New columns: new migration file + tell the Flutter repo to update `fromJson`. Do not break `CREATE TABLE IF NOT EXISTS` on existing DBs.

## Tokens

Access + refresh signed with `JWT_SECRET`. Refresh rows in `refresh_tokens`. Socket: `handshake.auth.token`; missing ⇒ offline mode.

## Additional resources

- Env, scripts, tables: [reference.md](reference.md)
