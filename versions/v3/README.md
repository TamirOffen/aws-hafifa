# Version 3 — DynamoDB

Tasks now persist in DynamoDB. The SQS publisher from v2 is deliberately
**gone** — Stage 8 wants you to feel the difference between an app that
announces events and a plain persistent API. Used for Stage 8.

- `backend/` — same API, DynamoDB-backed store (requires `TABLE_NAME` + `AWS_REGION`)
- `frontend/` — unchanged from v1

See [docs/versions.md](../../docs/versions.md) for the version matrix and
switching instructions.