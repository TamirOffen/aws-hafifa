# Version 1 — in-memory baseline

Tasks live in the container's memory and vanish on every restart. Used for
Stages 0–6 (local baseline, VPC, ECS, ALB, Prod VPC, CloudWatch).

- `backend/` — Express API, in-memory store
- `frontend/` — React app (identical in every version)

See [docs/versions.md](../../docs/versions.md) for the version matrix and
switching instructions.