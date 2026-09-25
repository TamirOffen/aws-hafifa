# Version 2 — SQS + Lambda

Same app, plus: creating a task publishes `TASK_CREATED` to SQS, and a
pre-written Lambda consumes it. Used for Stage 7 (async, queues, DLQs).

- `backend/` — v1 backend + SQS publisher (requires `QUEUE_URL`)
- `frontend/` — unchanged from v1
- `lambdas/task-created-consumer/` — the SQS consumer Lambda (deploy it, don't edit it)

See [docs/versions.md](../../docs/versions.md) for the version matrix and
switching instructions.