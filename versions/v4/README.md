# Version 4 — DynamoDB Streams, end to end

Same backend as v3 — but now the **table emits the events**. Enable DynamoDB
Streams, and the two pre-written Lambdas pipe task events through SQS.
Used for Stage 9 (change-data-capture, at-least-once, idempotency).

- `backend/` — identical code to v3 (that is the lesson)
- `frontend/` — unchanged from v1
- `lambdas/task-stream-router/` — stream records → SQS messages
- `lambdas/task-processor/` — SQS consumer with dedup + poison hook

See [docs/versions.md](../../docs/versions.md) for the version matrix and
switching instructions.