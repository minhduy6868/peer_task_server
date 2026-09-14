## Summary

- 

## Test plan

- [ ] `npm run db:check` (or migrate if schema changed)
- [ ] Hit the changed endpoint(s) with a valid JWT
- [ ] Permission denied for the wrong role
- [ ] Socket join/leave if signaling changed

## Notes

Base branch: `dev`. Do not include client changes in this PR.
Mention new env vars or migrations explicitly.
