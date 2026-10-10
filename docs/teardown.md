# Teardown, park, and redeploy

Three kinds of cleanup, in increasing order of destruction:

1. **Park** — stop paying hourly charges, keep everything else (used for Prod
   after Stage 5 and for Dev during long pauses).
2. **Redeploy** — bring a parked environment back (used in Stage 9).
3. **Full teardown** — delete everything, in dependency-safe order.

Naming follows [prerequisites.md](prerequisites.md) (`dev-*`/`prod-*`). In
AWS, deletion is often a *cascade*: delete children first or parents refuse
to go. The orders below are the whole point.

## 1. Park checklist (Prod after Stage 5; Dev for pauses > 1 week)

Goal: hourly charges → ~$0. Keepers: VPC skeleton (subnets, route tables,
IGW, SGs — all free), ECR images, IAM roles, SQS queues, DynamoDB table,
log groups (set retention low or accept cents).

- [ ] Scale the ECS services' desired count to **0**
  (`dev-backend-service`, `dev-frontend-service` — or `prod-...`). Wait for
  tasks to stop.
- [ ] Delete the NAT Gateway (`dev-nat-a` / `prod-nat-a`).
- [ ] **Release the NAT's Elastic IP** (deleting the NAT leaves the EIP
  allocated — an idle EIP bills ~$0.005/hr).
- [ ] (Prod, and Dev pauses > 1 week) Delete the ALB and its target groups.
  During the pause the ALB bills ~$17/month.
- [ ] Optional: set log-group retention to 1 day during very long pauses.

Parked cost ≈ $0/month + cents of storage.

## 2. Redeploy checklist (Stage 9 uses this for Prod)

~15 minutes, ~$0.10 in hourly charges. Assumes Stage 4/5 names and settings.

- [ ] Create the NAT Gateway in `prod-public-a` (`prod-nat-a`), associate a
  fresh (or existing) Elastic IP, and add `0.0.0.0/0 → nat-...` routes to
  `prod-rt-private-a` and `prod-rt-private-b` (the exact steps you did in
  Stage 2 — that memory is the point).
- [ ] Recreate the ALB stack the way Stage 4 did: `prod-alb` in the public
  subnets with `prod-sg-alb`, target groups `prod-tg-backend` (port 3000,
  health `/health`) and `prod-tg-frontend` (port 80, health `/health`),
  listener rules: `/api/*` and `/health` → backend, default → frontend.
- [ ] Scale both services back to desired count **1** and wait for the
  services to report stable and both target groups healthy.
- [ ] Verify: hit the ALB DNS name — task list loads, header reads
  `Environment: prod`.
- [ ] Re-park when done (§1) unless the final teardown is next.

## 3. Full teardown — dependency order matters

Do **Dev and Prod one at a time**, per environment; regional resources are
listed separately. Use the CLI where you can — deleting via the Console for
things you built via the CLI is how orphaned resources survive.

### 3.1 Inside each VPC (dev, then prod)

1. ECS services → desired count 0, then delete services
   (`dev-backend-service`, `dev-frontend-service`), then the clusters
   (`dev-cluster`). Task definitions can't be deleted easily (deregister) —
   leave them; they're free.
2. ALB: delete listeners, target groups, then the ALB (`dev-alb`,
   `dev-tg-backend`, `dev-tg-frontend`).
3. NAT Gateway (`dev-nat-a`) → **release its Elastic IP**.
4. VPC (deleting the VPC cascades most of it, but walk it once first):
   subnets (`dev-public-a/b`, `dev-private-a/b`), route tables
   (`dev-rt-public`, `dev-rt-private-a/b`), IGW (`dev-igw`), security groups
   (`dev-sg-*`; default SG can't be deleted). If anything refuses, it still
   has something attached — that error is the lesson.
5. Throwaway EC2 test vehicles if any remain (Stage 2): terminate instances,
   delete key pairs (`dev-test-key`).

### 3.2 Regional resources (shared, delete last)

1. Lambda event source mappings, then functions
   (`dev-task-created-consumer`, `dev-task-stream-router`,
   `dev-task-processor`).
2. SQS: `dev-task-events-dlq` **then** `dev-task-events` (the DLQ's Redrive
   policy references it — dependency order again); same for
   `dev-task-notifications(-dlq)`.
3. DynamoDB: disable/delete the stream's consumers, then delete the table
   (`dev-tasks`).
4. ECR repositories `aws-task-app-backend` / `aws-task-app-frontend` — delete
   the images, then the repos (or keep them; storage costs cents).
5. CloudWatch: log groups `/ecs/dev-backend`, `/ecs/dev-frontend`
   (and `/aws/lambda/dev-*`), alarms, and the CloudWatch agent-less metric
   filters you created in Stage 6.
6. IAM: detach and delete the task/execution/Lambda roles you created and
   their inline/customer policies
   (`dev-backend-task-role`, `dev-backend-execution-role`,
   `dev-task-created-consumer-role`, `dev-task-stream-router-role`,
   `dev-task-processor-role`). Do **not** delete roles you didn't create.
7. **Last**: the billing alarm and budget from Stage 1 — they cost nothing,
   but they were yours. Delete them once the account shows $0 run-rate.

## 4. Verify you're clean

- Cost Explorer → daily spend trending to **$0** over the next day.
- `aws ec2 describe-vpcs` → only the default VPC (and not your `dev-vpc`).
- `aws ec2 describe-addresses` → **empty** (the classic leftover: unattached
  Elastic IPs from deleted NAT Gateways).
- Billing alarm from Stage 1 should go silent.