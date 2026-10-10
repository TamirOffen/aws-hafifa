# Prerequisites

Everything you need before starting [Stage 0](workshop/stage-00-local-baseline.md).
**Read the cost section before creating anything in AWS.**

## 1. The promise of this workshop

You will **never write application code**. The task app is finished, in four
versions, in [`versions/`](../versions/). Your job is to configure AWS:
networking, IAM, containers, load balancing, observability, queues, and
databases. When something breaks (sometimes because we broke it on purpose),
you debug it.

## 2. AWS account

- A single AWS account is used for **both** environments (Dev and Prod). They
  will be isolated at the network level (separate VPCs), which is the lesson —
  not separate accounts.
- You need enough permissions in that account to: **enable IAM Identity Center
  (SSO)** and create roles/policies, VPCs, ECR repositories, ECS clusters, load
  balancers, Lambda functions, SQS queues, DynamoDB tables, and billing
  alarms/budgets. Enabling Identity Center for the first time requires root or
  administrator access in the **management** account: for a standalone account
  this just means your own account (enabling Identity Center creates an AWS
  Organization with your account as the management account); if you are already
  in an organization, ask your management-account administrator to enable it and
  assign you.
- Register **MFA** on the identity you will use — SSO makes this expected, and
  the workshop treats it as normal practice.
- **New/empty account recommended.** If you use an account with existing
  infrastructure, double-check every resource name you create — the
  conventions below assume a clean slate.

> **Region discipline.** Every example assumes **us-east-1** (North Virginia).
> You may use any region, but pick one and stay there — including for the
> Identity Center instance, so there is only one region to reason about. Half
> the classic AWS foot-guns are "the resource exists, just not in the region
> you're looking at." The workshop keeps hammering this: always know which
> region your CLI is pointed at before you press enter.

## 3. Tools

| Tool | Version | Check | Why |
|---|---|---|---|
| Node.js | ≥ 20 | `node -v` | Run the app locally (Stage 0) and package Lambdas |
| npm | ≥ 10 | `npm -v` | Installs per-version dependencies |
| Docker | any recent | `docker version` | Build images; run DynamoDB Local for v3/v4 tests |
| AWS CLI | v2 | `aws --version` | The primary interface for the whole workshop |
| `zip` | any | `zip -h` | Package Lambda functions (v2/v4) |

Verify Docker can actually run a container before Stage 0:
`docker run --rm hello-world`.

## 4. AWS CLI authentication (SSO)

The workshop authenticates the CLI with **AWS IAM Identity Center (SSO)**: you
sign in through the AWS access portal (with MFA), and the CLI uses short-lived,
auto-refreshing credentials instead of a long-lived access key. This is how a
real company grants engineers access — and it means no static secret ever lands
in a file you could commit.

You will set up a named CLI profile (`workshop`) in Stage 1 with
`aws configure sso`, then run `aws sso login --profile workshop` at the start of
each session so that "which account am I on?" is a one-command answer for the
rest of the project. SSO credentials expire; re-running that one command is the
cure.

> **Already created a long-lived IAM user for this workshop?** Finish Stage 1
> through SSO first, then delete that user's access key (and the user). One way
> in is easier to reason about than two.

## 5. Cost guardrails (read this twice)

The whole workshop is designed to fit in **an account with $100 of credits,
completed within about a month**. The dominant cost driver is the **NAT
Gateway** (~$0.045/hr ≈ **$33/month each** when left running). The
architecture is deliberately shaped around that:

- **One NAT Gateway per VPC**, not one per AZ (saves ~$65/month vs. the
  textbook layout — the trade-off is taught, not hidden).
- **Prod is "parked"** after Stage 5: services scaled to 0, NAT and ALB
  deleted; the VPC skeleton stays (it's free). A redeploy checklist brings it
  back for Stage 9's final verification.
- **Pause guidance**: away for more than a week? Park Dev's NAT + services
  too. See [cost-estimates.md](cost-estimates.md) and [teardown.md](teardown.md).

In Stage 1, before creating anything, you will install a **billing alarm
($5)** and a **monthly budget ($50)**. These are permanent habits, not
sidebars. Every stage ends with a **Cost check**.

## 6. Naming conventions used throughout

Every resource is prefixed with its environment. Region in examples:
`us-east-1`. Availability zones: `us-east-1a` and `us-east-1b`.

| Resource | Dev | Prod |
|---|---|---|
| VPC | `dev-vpc` (`10.10.0.0/16`) | `prod-vpc` (`10.20.0.0/16`) |
| Subnets | `dev-public-a/b`, `dev-private-a/b` | `prod-public-a/b`, `prod-private-a/b` |
| Internet Gateway | `dev-igw` | `prod-igw` |
| NAT Gateway | `dev-nat-a` | `prod-nat-a` |
| Route tables | `dev-rt-public`, `dev-rt-private-a/b` | `prod-rt-public`, `prod-rt-private-a/b` |
| Security groups | `dev-sg-alb`, `dev-sg-backend`, `dev-sg-frontend`, `dev-sg-ssh` | `prod-...` equivalents |
| ECS cluster | `dev-cluster` | `prod-cluster` |
| Task definitions | `dev-backend`, `dev-frontend` | `prod-backend`, `prod-frontend` |
| ECS services | `dev-backend-service`, `dev-frontend-service` | `prod-...` equivalents |
| ALB / target groups | `dev-alb`, `dev-tg-backend`, `dev-tg-frontend` | `prod-...` equivalents |
| Log groups | `/ecs/dev-backend`, `/ecs/dev-frontend` | `/ecs/prod-...` |
| SQS (Stage 7) | `dev-task-events` + `dev-task-events-dlq` | — |
| Lambda (Stage 7) | `dev-task-created-consumer` | — |
| DynamoDB (Stage 8) | `dev-tasks` | — |
| SQS (Stage 9) | `dev-task-notifications` + `dev-task-notifications-dlq` | — |
| Lambdas (Stage 9) | `dev-task-stream-router`, `dev-task-processor` | — |

**ECR repositories are shared across environments** (they are regional
resources, not inside any VPC): `aws-task-app-backend` and
`aws-task-app-frontend`, with image tags per app version (`v1`–`v4`; `:v4`
exists to keep the naming obvious even though v4's backend code is identical
to v3's). The frontend image never changes across versions — only the backend
does.

## 7. App versions at a glance

The backend exists in four pre-written versions; you switch by changing which
image + environment variables a task definition uses — never by editing code:

| Version | Tasks stored | Publishes events? | Stage |
|---|---|---|---|
| v1 | in memory | no | 0–6 |
| v2 | in memory | yes — API → SQS | 7 |
| v3 | DynamoDB | no | 8 |
| v4 | DynamoDB | yes — DynamoDB Streams → Lambda → SQS → Lambda | 9 |

Details: [versions.md](versions.md).