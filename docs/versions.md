# App versions — what changes and how to switch

The backend exists in four pre-written versions under [`versions/`](../versions/).
**Students never edit code** — switching versions is an AWS deployment action:
push the new image (if you haven't), update the task definition (image tag +
environment variables), and update the service. The frontend image never
changes; only the backend does.

## 1. Behavior matrix

| Capability | v1 | v2 | v3 | v4 |
|---|---|---|---|---|
| Tasks stored | in memory | in memory | **DynamoDB** | DynamoDB |
| API publishes `TASK_CREATED` to SQS | – | **yes** | – | – |
| Lambda: SQS consumer | – | **yes** | – | – |
| DynamoDB Streams → router Lambda → SQS → processor Lambda | – | – | – | **yes** |
| Data survives container restarts | – | – | **yes** | yes |
| IAM: task role needs | – | `sqs:SendMessage` | DynamoDB read/write | same as v3 |
| IAM: new Lambda roles | – | consumer execution role | – | router + processor roles |
| Teaches | baseline | SQS, Lambda, async, DLQ | managed DB, task roles | CDC, at-least-once, idempotency |

The pedagogical arc, called out in the workshop: **v2's API *announces*
events; v4's *database emits* them.** v3 deliberately drops SQS so you feel
the difference between explicit publishing and change-data-capture.

## 2. What each version changes in the code

| | Backend source | Frontend | Lambdas |
|---|---|---|---|
| v1 | Express API, in-memory store | React app | – |
| v2 | v1 + SQS publisher (`src/events.ts`) | **identical to v1** | `task-created-consumer` |
| v3 | store swapped: `dynamo-store.ts` behind the same `TaskStore` interface | **identical to v1** | – |
| v4 | **identical code to v3** — the stream does the rest | **identical to v1** | `task-stream-router`, `task-processor` |

Diffing v2 against v3 shows the smallest possible change set (a store adapter
behind an unchanged interface). Diffing v3 against v4 shows *no backend change
at all* — the entire event pipeline lives outside the application.

## 3. Switching versions in AWS (summary)

For the Dev environment (the only one you switch during the workshop):

1. Build and push the new backend image tag to ECR
   (`aws-task-app-backend:v2`, `:v3`, `:v4`).
2. Create a **new revision** of the `dev-backend` task definition pointing at
   the new image tag and the required environment variables (table below).
3. Update `dev-backend-service` to the new revision.
4. For v2/v4: deploy the Lambda(s) and related resources first — the workshop
   stages walk through the full order.

The old revision stays; rolling back is "update the service to the previous
revision". That safety net is one of the reasons task definitions are
versioned at all.

### Required environment variables (backend task definition)

| Version | Env vars |
|---|---|
| v1 | `ENVIRONMENT=dev`, `PORT=3000` |
| v2 | + `QUEUE_URL=<dev-task-events queue URL>` |
| v3 | `ENVIRONMENT=dev`, `PORT=3000`, `TABLE_NAME=dev-tasks`, `AWS_REGION=us-east-1` (no `QUEUE_URL` — removed on purpose) |
| v4 | same as v3 (backend code is identical) |

The backend **fails fast at boot** when a required variable is missing — you
will see that as a stopped-task reason, which is exactly the intended
learning experience.

The frontend task definition never changes across versions: image
`aws-task-app-frontend:v1`, container port 80, no app env vars (the
environment shown in the UI comes from the backend's `/api/environment`).

## 4. Running versions locally

Each version is fully self-contained:

```bash
cd versions/v1/backend
npm install && npm run dev        # ENVIRONMENT=dev npm run dev — see Stage 0

cd ../frontend
npm install && npm run dev       # http://localhost:5173, proxies /api to :3000
```

v2 local run also wants `QUEUE_URL` (the API starts without reaching SQS —
publishing is best-effort and logged), v3/v4 want `TABLE_NAME`/`AWS_REGION`
(and optionally `DYNAMODB_ENDPOINT_URL=http://127.0.0.1:8000` pointing at
DynamoDB Local — `scripts/dynamodb-local.sh start`).

Tests: every version runs `npm test` in its backend (and one smoke test in
the frontend). v3/v4's DynamoDB-backed tests run when DynamoDB Local is up
and skip with a notice otherwise.