# AWS Task App — a hands-on AWS workshop

One boring task app, ten stages, two environments, and an event-driven
architecture you build, break, and debug yourself — on AWS.

**You never write application code.** The app is finished (four versions,
TypeScript, tested — see [`versions/`](versions/)). Your job is the AWS side:
accounts and IAM, VPCs and routing, containers and load balancers,
observability, queues, databases, and change-data-capture — plus the
debugging of everything above, sometimes because you broke it on purpose.

## The path

```text
Stage 0  Run the app locally (no AWS)
Stage 1  Account, IAM, AWS CLI, billing guardrails
Stage 2  Dev VPC: subnets, route tables, IGW + NAT        ← the core stage
Stage 3  Docker + ECR + ECS task + ECS service
Stage 4  ALB, security groups, frontend                    ← Version 1 checkpoint
Stage 5  Prod VPC + isolation + parking
Stage 6  CloudWatch: logs, metrics, alarms
Stage 7  SQS + Lambda                  (app v2: the API announces events)
Stage 8  DynamoDB                      (app v3: persistence)
Stage 9  DynamoDB Streams              (app v4: the database emits events)
```

Full tutorial: **[docs/workshop/README.md](docs/workshop/README.md)** — start
with [prerequisites.md](docs/prerequisites.md) first.

## Quick start (Stage 0)

```bash
cd versions/v1/backend
ENVIRONMENT=dev npm install && ENVIRONMENT=dev npm run dev   # API on :3000

cd ../frontend
npm install && npm run dev                                    # UI on :5173
```

Open http://localhost:5173 — the header should read `Environment: dev`.
That's the whole app: create tasks, complete them, watch the JSON logs.
Then go to [Stage 0](docs/workshop/stage-00-local-baseline.md) for the rest
of the baseline.

## Repository map

```text
├── docs/
│   ├── workshop/            # THE tutorial — stage-00 … stage-09 + index
│   ├── prerequisites.md     # tools, account, region, naming, cost guardrails
│   ├── cost-estimates.md    # the $100/1-month budget math, per stage
│   ├── versions.md          # what changes v1→v4 and how to switch
│   ├── troubleshooting-solutions.md   # answers to every Break-it (start AFTER your own theory)
│   └── teardown.md          # teardown / park / redeploy checklists
├── versions/
│   ├── v1/                  # in-memory baseline (Stages 0–6)
│   ├── v2/                  # + SQS publish + consumer Lambda (Stage 7)
│   ├── v3/                  # + DynamoDB store (Stage 8)
│   └── v4/                  # + stream router + processor Lambdas (Stage 9)
└── scripts/
    └── dynamodb-local.sh    # local DynamoDB for v3/v4 integration tests
```

Each version is fully self-contained (backend + frontend + its Lambdas):
switching versions is an AWS deployment action — new image tag + task
definition revision — never a code edit. The frontend image never changes.

## Cost promise

Designed and modeled to complete within **$100 of credits in ~1 month**
(one NAT Gateway per VPC, Prod parked after Stage 5, every stage ends with a
Cost check): expected **~$70–80** total. Details and per-stage table:
[docs/cost-estimates.md](docs/cost-estimates.md). Stage 1 installs the
billing alarm + budget before anything billable exists.

## The app (deliberately boring)

React + Express + JSON APIs; no auth, no users, no microservices, no
Kubernetes — the complexity lives in the **infrastructure**, not the app.
API contract (all versions): `GET /health`, `GET /api/environment`,
`GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`. Same-origin
relative URLs everywhere; the ALB routes `/api/*` to the backend — no CORS.

## Testing

Every package runs green before you deploy it:

```bash
cd versions/v1/backend && npm test     # 26 tests (unit + supertest integration)
cd ../frontend && npm test            # 5 smoke tests
```

v3/v4 integration tests use DynamoDB Local: `./scripts/dynamodb-local.sh start`
first (they skip with a notice otherwise). Lambdas: `npm run package` bundles
`dist/lambda.zip` for deployment in Stages 7/9.

## The five themes, in the end

Networking/VPCs → IAM → ECS → observability → event-driven architecture.
The workshop refuses to let the later stages obscure the earlier ones: Stage 8
traces database traffic through the Stage 2 NAT, and Stage 9's events exist
because a private-subnet task could reach the outside at all.

**Begin: [prerequisites.md](docs/prerequisites.md) → [Stage 0](docs/workshop/stage-00-local-baseline.md).**