# Troubleshooting solutions (facilitator copy)

Answers to every **Break it** exercise in the workshop. Students get symptoms
and investigation questions only, inside each stage — the discussions are the
learning. Keep this file out of the student path, or treat it as
"check your reasoning" material after attempting each break.

Each entry: **Symptom → Investigate → Why → Fix.** Breaks are numbered by
stage (`S0-1`, `S1-2`, …) matching the stage files.

---

## Stage 0 — local baseline

### S0-1 — Vite proxy pointed at the wrong port
- **Symptom:** frontend loads fine at `http://localhost:5173`, but the page
  never gets data: network tab shows failed `/api/environment` and `/api/tasks`
  requests; the header stays `Environment: …`.
- **Investigate:** is anything listening on the port the proxy targets? What
  does the browser actually connect to for `/api/...` (hint: it is *not* the
  backend directly)?
- **Why:** the frontend only ever speaks *relative* URLs. In local dev the
  **Vite dev server** forwards `/api/*` and `/health` to the backend; in AWS
  the **ALB** does the same job. The frontend never knows where the backend
  lives — the hop in front of it decides. Point the proxy at a dead port and
  the frontend is helpless: no fallback, no retry, just errors.
- **Fix:** point `server.proxy` in `vite.config.ts` back at the backend's port
  (3000) and/or start the backend. The mental model — "a router in front
  decides where `/api` goes" — is exactly the ALB in Stage 4.

## Stage 1 — account, IAM, CLI

### S1-1 — command run against the wrong region
- **Symptom:** `aws ec2 describe-vpcs` (or similar) returns *empty*, no error,
  even though you created a VPC five minutes ago.
- **Investigate:** `aws configure list` / `aws sts get-caller-identity` / the
  region in your shell. Which region did the resource *actually* land in?
- **Why:** regions are fully separate deployments of the same service. An
  empty list is the most dangerous AWS output there is: it is not "missing",
  it is "not here". Most resources never tell you they exist elsewhere.
- **Fix:** set the region explicitly (CLI flag, profile, or env var), and
  adopt the habit of checking region *before* every create command. This is
  why the workshop uses a dedicated `workshop` profile.

### S1-2 — a command run with a read-only policy
- **Symptom:** `AccessDenied`/`ExplicitDeny` error text on a create/update
  command; read commands work fine.
- **Investigate:** which policy produced the error (the message includes the
  statement); who was authenticated (authn) vs what was authorized (authz).
- **Why:** authentication *proved you are you*; the *policy* decides what that
  identity may do. An `AccessDenied` that lists a specific action and resource
  is the IAM system telling you exactly which permission is missing — read it,
  don't panic.
- **Fix:** attach the missing action to the right identity (policy statement,
  or switch to a role that has it). Note the least-privilege lesson: the
  read-only identity was *correct* for read-only work.

## Stage 2 — Dev VPC and networking

### S2-1 — Internet Gateway route removed from the public route table
- **Symptom:** the public-subnet EC2 test vehicle suddenly cannot `curl`
  anything; SSH (if you were on it) freezes; the instance still shows
  *running*.
- **Investigate:** the public route table's routes (`aws ec2
  describe-route-tables`); the instance has a public IP, so what path would
  responses take back?
- **Why:** a public IP is worthless without a route. "Public subnet" is not a
  subnet property — it is *the route table's* `0.0.0.0/0 → igw` entry. Remove
  the route and the subnet is effectively private no matter what its name or
  its instances' public IPs say.
- **Fix:** restore `0.0.0.0/0 → dev-igw` to `dev-rt-public`. The route table,
  not the IP address, is the internet faucet.

### S2-2 — private route table with no NAT route
- **Symptom:** the private-subnet EC2 test vehicle's `curl example.com` hangs
  until timeout. It has a valid private IP and a working internal path.
- **Investigate:** `dev-rt-private-a/b`'s routes; is there any entry for
  `0.0.0.0/0` at all? Try curling the public test vehicle's **private** IP
  (should work — intra-VPC traffic uses the `local` route, which is always
  there).
- **Why:** the implicit `local` route serves the VPC's own CIDR and nothing
  else. No default route → packets to the internet go nowhere. "Private" =
  "the VPC answers for me, and nobody else".
- **Fix:** add `0.0.0.0/0 → <dev-nat-a>` to the private route tables.

### S2-3 — NAT Gateway placed in a private subnet
- **Symptom:** private instances still can't reach the internet even though
  the NAT Gateway exists and the route table points at it.
- **Investigate:** which subnet is the NAT in, and does the NAT have an
  Elastic IP association? Check the NAT's subnet's own route table.
- **Why:** a NAT Gateway is itself a client of the internet. Its outbound
  packets must reach an Internet Gateway, which requires the NAT to sit in a
  **public** subnet with an **Elastic IP**. In a private subnet it is a
  very expensive paperweight: attached, routed to, and dead.
- **Fix:** delete and recreate the NAT in `dev-public-a` with an EIP; point
  the private routes at the new NAT ID. (This is also why the parking
  checklist deletes the NAT: it is trivially recreatable.)

## Stage 3 — ECR → ECS task → ECS service

### S3-1 — wrong container port in the task definition
- **Symptom:** the task runs (logs show `API listening` on 3000), but `curl
  <task-eni-private-ip>` on the task-definition port fails while port 3000
  answers.
- **Investigate:** what port does the *application* actually listen on (the
  `PORT` env var and the log line)? What port does the *task definition*
  declare? These are two separate facts that must agree.
- **Why:** the container port in a task definition is *metadata used by
  infrastructure* (security groups are meaningless here, but in Stage 4 the
  target group points at it). The app binds whatever `PORT` says. A mismatch
  means health checks and ALBs will knock on a door nobody opened.
- **Fix:** align container port with `PORT` (3000) in the task definition.
  The habit generalizes: infrastructure declares ports; applications bind
  ports; they only meet if you keep them in sync.

### S3-2 — image pull fails (task in private subnets with no outbound path)
- **Symptom:** tasks stop almost immediately; service stuck with no running
  tasks; task events/ stopped reason shows `CannotPullContainerError`
  (timeout pulling image/metadata).
- **Investigate:** the task's network path out: which subnets is the service
  in, and what route does `dev-rt-private-*` have for `0.0.0.0/0` right now?
  Is the NAT Gateway still there? (`Stage 2's` EC2 test would fail the same
  way.)
- **Why:** Fargate pulls the image from ECR — a **public regional service** —
  *at task start*, from the task's ENI in a private subnet. No NAT route, no
  pull, no task. The "egress for workloads" reason for the NAT's existence is
  exactly this.
- **Fix:** restore the NAT Gateway + private routes (teardown.md redeploy
  steps), then let the service replace the task itself — notice that you
  didn't have to nudge anything; ECS desired state did the work.

## Stage 4 — ALB, security groups, frontend

### S4-1 — ALB→ECS security-group reference removed
- **Symptom:** `504` from the ALB for `/api/*` while the static frontend still
  loads; target group shows **unhealthy** targets; task logs show... nothing
  — the requests never arrive.
- **Investigate:** `dev-sg-backend`'s inbound rules (is there a rule allowing
  from `dev-sg-alb`?); the ALB's health-check failures in target-group
  details; contrast with a direct curl from the Stage 2 test vehicle to the
  task's ENI IP on 3000 (works — the app is fine).
- **Why:** security groups are stateful firewalls *attached at the ENI*. The
  ALB→backend chain was: internet → `dev-sg-alb` → (SG reference) →
  `dev-sg-backend` → task. Removing the SG-reference rule means the ALB's
  health checks are dropped before the app. The app never sees them, so the
  ALB marks the target unhealthy *and* user traffic 504s.
- **Fix:** restore the inbound rule on `dev-sg-backend`: port 3000, source =
  the `dev-sg-alb` **security group ID** (not a CIDR — a *reference*, which is
  the point: it stays correct as the ALB's IPs change).

### S4-2 — target group pointed at the wrong port
- **Symptom:** identical to S4-1 (unhealthy targets, 504s) **while** the SG
  rules are all correct.
- **Investigate:** the target group's **port** (`aws elbv2
  describe-target-groups`): is it 3000? Then trace the full chain:
  listener rule → target group → port → SG rule → task.
- **Why:** health checks originate from the ALB and connect to
  `target-group-port + target`. Point the backend TG at 80 and you are
  health-checking nginx's port on a Node container. Two totally different
  mistakes, identical symptom — which is why you trace the chain, not guess.
- **Fix:** target group port → 3000 (backend) / 80 (frontend).

### S4-3 — health check path mismatch
- **Symptom:** targets unhealthy, but user traffic *does* work when forced
  (e.g., you curl an API endpoint and get real JSON back); ALB may keep
  targets in service briefly or cycle them.
- **Investigate:** what does the health-check path return when *you* curl it?
  (`/health` on the backend returns 200; `/` returns 404 — the ALB only
  accepts 200s.)
- **Why:** the ALB's opinion of "is this target alive" is just an HTTP GET
  expecting 200. The backend deliberately exposes exactly one liveness route
  — `/health` — and returns 404 elsewhere. Point the check at `/` and the
  ALB concludes a perfectly healthy app is dead.
- **Fix:** health-check path back to `/health` for both target groups (nginx
  also serves `/health` → 200 for exactly this reason).

## Stage 5 — Prod VPC and isolation

### S5-1 — cross-VPC security-group reference attempt
- **Symptom:** the Console/CLI refuses the rule ("security group … does not
  exist in VPC …" / invalid group id for the other VPC).
- **Investigate:** which VPC does each SG belong to? What does the error say
  the reference was resolved against?
- **Why:** SG *references* are VPC-scoped. There is no way to say "allow from
  that group in another VPC" without peering — and no traffic was flowing
  between these VPCs anyway (next break). Isolation is structural: the
  primitives themselves refuse to bridge it.
- **Fix (concept):** in a peered-VPC world you would reference SGs across the
  peering connection. Here, the failure is the lesson — and if you ever see
  it in production, someone is attempting exactly this kind of shortcut.

### S5-2 — peering two VPCs with overlapping CIDRs
- **Symptom:** the peering connection (or a route to it) is rejected:
  `InvalidParameter` / CIDR conflict mentioning `10.10.0.0/16`.
- **Investigate:** the CIDRs of both VPCs you asked to peer (create a throwaway
  third VPC with `10.10.0.0/16` if you need a live overlap to try).
- **Why:** routing is longest-prefix-match over unambiguous address space. Two
  VPCs claiming the same CIDR make "route to 10.10.x.x" unanswerable — *which
  one?* Overlap is forbidden at the protocol's root. This is why the
  workshop's CIDR plan is deliberate and non-overlapping
  (`10.10/16` vs `10.20/16`), and why real orgs plan IP space like a
  scarce resource.
- **Fix:** none for the overlapped pair (that is the answer). Delete the
  throwaway VPC. The real fix is *planning*: non-overlapping CIDRs everywhere.

### S5-3 (exercise) — testing Dev↔Prod reachability, and the nuance
- **Symptom (expected):** from `dev-test-public`, curling a **prod private IP**
  times out; curling the **prod ALB's public DNS name** *succeeds*.
- **Why:** VPC isolation isolates *private* address space — there is no route
  between the VPCs, so private IPs are unreachable. But the prod ALB is
  *internet-facing by design*, and "the internet" is reachable from Dev's
  public subnet via the IGW. Isolation is a property of the network path, not
  of the letters "dev" and "prod" in a name.
- **Lesson:** if prod must be truly unreachable, that is a *different* design
  (internal ALBs, private-only, restrictive SGs, or network ACLs) — knowing
  which traffic you blocked and which you didn't is the skill.

## Stage 6 — CloudWatch

### S6-1 — bogus required environment variable → crash loop
- **Symptom:** POST/GET requests fail via the ALB (502/503 or unhealthy
  targets); the service "runs" but the task list flickers through
  provisioning; metrics show rapid task replacements.
- **Investigate:** the *stopped task's* stopped reason + its log stream —
  the app's very first log line is a `Configuration error` JSON. Recent
  service events show a replacement loop. Which env var did the new task
  definition revision change?
- **Why:** the app fails fast at boot when required env vars are missing
  (deliberately). ECS then does its job: task dies → replacement → dies →
  ... A crash loop is not one bug, it is a *policy of replacement* repeatedly
  hitting a deterministic error. The stopped-task reason + first log line are
  always the fastest path to truth.
- **Fix:** correct the task-definition revision (restore `ENVIRONMENT` /
  remove the bogus var), update the service, watch it stabilize. Note how
  *little* you actually touched: one revision.

### S6-2 — wrong retention
- **Symptom (eventual):** logs older than the retention period simply
  disappear from the group; a query from last week returns nothing.
- **Why:** CloudWatch Logs bills for storage; retention is the dial. "Never
  expire" feels safe and quietly accumulates cost forever; 1 day frees money
  and eats evidence. Production defaults are a decision, not a default.
- **Fix:** set retention deliberately per environment (e.g., 7 days dev /
  30 days prod in real life). Nothing to repair here — the point is noticing
  *when* you made the choice.

### S6-3 — alarm on the wrong metric
- **Symptom:** the app is demonstrably broken (crash-looping, 5xx spiking) but
  the alarm you configured stays green; or the alarm fires for a blip while
  the real incident passes silently.
- **Investigate:** which metric does the alarm watch, from which namespace/
  dimension? Is that metric *the* signal for the failure mode you experienced?
- **Why:** alarms are only as good as the metric-behavior link. An alarm on
  `CPUUtilization` is blind to a config crash-loop at 2% CPU. The right alarm
  for S6-1 would be ALB 5xx / target health — signals *at the user's
  boundary*, not inside the box.
- **Fix:** re-point the alarm at a user-facing signal (ALB 5xx count, target
  health-check failures), and keep the CPU one as capacity signal only.

## Stage 7 — SQS + Lambda (v2)

### S7-0 — task role missing `sqs:SendMessage`
- **Symptom:** the UI *still works* — POST returns 201, tasks list fine — but
  the Lambda never logs anything and the queue stays empty.
- **Investigate:** the **API's** logs (not the Lambda's): search the log group
  for `publishFailed` / `AccessDenied`. Then the task role's policies.
- **Why:** publishing is deliberately best-effort (v2 design): the synchronous
  work (creating the task) succeeds; the *event* is dropped with an error
  log. Two failure modes learned here: (1) permissions live on the **task
  role** — the container's identity — not the execution role; (2) "the feature
  works but the pipeline is dead" is the signature of best-effort side
  effects.
- **Fix:** attach a scoped `sqs:SendMessage` policy on the queue ARN to
  `dev-backend-task-role`. Watch the very next POST produce a `Lambda
  received TASK_CREATED` log line.

### S7-1 — Lambda execution role missing `sqs:ReceiveMessage`
- **Symptom:** messages pile up in the queue (approximate age of oldest
  message climbs in the SQS console/CLI); the Lambda logs nothing; the event
  source mapping shows errors next to its metrics.
- **Investigate:** the function's execution role policies; the mapping's
  error metric in the Lambda console; queue depth over time.
- **Why:** the event source mapping polls SQS **as the function's execution
  role**. Without receive/delete permissions it can't even take messages off
  the queue — nothing reaches the handler, so no logs, no errors *from the
  function itself*. "Queue grows, Lambda silent" is the fingerprint of a
  *plumbing* failure between them.
- **Fix:** grant `sqs:ReceiveMessage`, `sqs:DeleteMessage`,
  `sqs:GetQueueAttributes` on the queue (and DLQ) ARN to the function's
  execution role. Messages drain immediately after — note that the ones
  sitting in the queue weren't lost; they were waiting.

### S7-2 — visibility timeout shorter than the work
- **Symptom:** the same message gets processed more than once (multiple
  `Lambda received TASK_CREATED` log lines for one task creation); the
  consumer is fast so you may need the FAIL variant (S7-3) or a deliberate
  slowdown to notice.
- **Investigate:** the queue's `VisibilityTimeout`, the lambda's timeout,
  and the timestamps on the duplicate log lines (are they ~visibility-timeout
  apart?).
- **Why:** a message becomes visible again after the visibility timeout even
  if its first consumer is still working. Timeouts shorter than processing ⇒
  redelivery ⇒ **at-least-once delivery**, concretely. The correct recipe is
  visibility ≥ function timeout (ideally 6×).
- **Fix:** raise the queue's visibility timeout (e.g., 60s for a function
  with 10s timeout). The duplicate log lines are the cheapest possible
  demonstration of why consumers must be idempotent anyway (S9-4).

### S7-3 — poison message → DLQ
- **Symptom:** create a task whose title contains `FAIL`. The API returns 201;
  the Lambda logs `Lambda received TASK_CREATED` and then an error — three
  times (three receive attempts); afterwards the message sits in
  `dev-task-events-dlq`.
- **Investigate:** Lambda logs across the retries (count them; who scheduled
  the retries?); the DLQ's message count; the queue's Redrive policy
  (`maxReceiveCount`).
- **Why:** a throwing handler = failed batch = message returns to the queue
  for another attempt (batch size 1 keeps this clean). After
  `maxReceiveCount` attempts, SQS moves it to the DLQ. Nobody wrote a
  "retries then DLQ" feature — it emerges from queue configuration + the
  handler simply failing.
- **Fix:** nothing broken. Inspect the DLQ message (it's the original body),
  and clear it (delete or redrive). This is exactly how real poison
  messages — malformed, unprocessable, or bug-triggering — end up in DLQs.

## Stage 8 — DynamoDB (v3)

### S8-1 — task role missing `dynamodb:PutItem`
- **Symptom:** GET `/api/tasks` works (Scan is allowed), POST fails with 500
  via the ALB. Nothing visibly changes in the task list.
- **Investigate:** API logs for `AccessDeniedException` naming
  `dynamodb:PutItem` and the exact table ARN. The task role's policy document.
- **Why:** the store is DynamoDB now; each operation is a separately
  permissioned API call over the network. `Scan` allowed + `PutItem` missing
  = list works, create doesn't. And the *user-facing* symptom (a 500) hides
  a perfectly specific server-side log line — this pair is the core
  observability lesson of the stage.
- **Fix:** grant the missing action **on the table ARN only** (least
  privilege: `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:Scan`,
  `dynamodb:GetItem`, `dynamodb:Query` scoped to `dev-tasks`).

### S8-2 — wrong `TABLE_NAME`
- **Symptom:** every task operation 500s; API logs show
  `ResourceNotFoundException` naming the bogus table.
- **Investigate:** the task-definition env vars vs the actual table name
  (`aws dynamodb list-tables`). Why does the app trust the name blindly?
- **Why:** the app fails fast on *missing* config at boot, but a table that
  doesn't exist only fails when a request lands. Config validation has
  limits; that boundary is worth knowing.
- **Fix:** correct `TABLE_NAME` in a new revision. Compare boot-time vs
  request-time failure visibility (S6-1 vs S8-2).

### S8-3 — policy scoped to the wrong region's ARN
- **Symptom:** full `500`s with `AccessDeniedException` on Put/Scan, even
  though a `dynamodb:*` policy looks attached.
- **Investigate:** the policy's **Resource** ARNs — region, account, table.
  Compare with the ARN in the error message (they differ — where?).
- **Why:** IAM resource ARNs are literal strings; `us-east-2` in a policy
  guards a *different table that happens to share a name* in another region.
  Permissions match on exact ARNs, and DynamoDB is regional.
- **Fix:** correct the ARN (or use the table's real ARN). Cheap habit:
  copy ARNs from error messages and from `aws dynamodb describe-table`, never
  from memory.

### S8-4 — NAT Gateway deleted mid-Stage-8 (networking tie-back)
- **Symptom:** task operations hang for several seconds and then fail with
  timeout/socket errors — *not* auth errors. Health checks stay green (the
  ALB→task path is intra-VPC and needs no NAT).
- **Investigate:** which route does `dev-rt-private-a/b` have for
  `0.0.0.0/0`? Does the ENI's subnet have a path to the outside? What is
  different about DynamoDB vs the ALB as a *destination*?
- **Why:** DynamoDB is a **public regional service** — reached through the
  NAT Gateway exactly like ECR was in S3-2. The app is healthy; the *network
  path to the database* is severed. Timeout (not AccessDenied) = packets
  never made it to an authority to reject them.
- **Fix:** restore the NAT + routes (teardown redeploy checklist). Sidebar:
  a **Gateway VPC Endpoint for DynamoDB** makes this path free and
  NAT-independent — production would use one; the workshop deliberately
  doesn't so the dependency stays visible (and breakable).

## Stage 9 — DynamoDB Streams (v4)

### S9-1 — event source mapping created while the stream is disabled
- **Symptom:** creating the mapping fails immediately
  (`ResourceNotFoundException` naming the stream ARN), or an existing mapping
  flips to an error state when you disable the stream afterwards.
- **Investigate:** is streaming actually enabled on the table
  (`aws dynamodb describe-table` → `StreamSpecification`), and which stream
  view type?
- **Why:** the mapping polls a *real stream endpoint*; no stream, nothing to
  poll. Streams are also toggled per table and changing the view type
  recreates the stream ARN — a stale ARN in the mapping breaks the same way.
- **Fix:** enable the stream (`NEW_AND_OLD_IMAGES`), recreate the mapping
  with the current ARN. Create-then-enable order matters; the error message
  says so.

### S9-2 — router role missing `dynamodb:GetRecords` (+ friends)
- **Symptom:** the mapping exists and shows as enabled, but no Lambda logs;
  create/complete tasks produce no `Stream router published ...` lines; the
  mapping surfaces iterator errors.
- **Investigate:** the router's execution-role policies against the four
  stream-read actions (`DescribeStream`, `GetShardIterator`,
  `GetRecords` on the stream ARN — plus `dynamodb:DescribeTable` on the
  table); the mapping's error metrics.
- **Why:** the *mapping* (managed by Lambda) reads the stream using the
  function's role. The handler never runs if the front door can't open —
  again "silent consumer + growing upstream", this time the upstream is
  the shard.
- **Fix:** add the stream-read actions scoped to the stream ARN. The moment
  it's attached, the next table write triggers the router — note that no
  replay of "missed" records happens with `LATEST`; choose `TRIM_HORIZON`
  deliberately if you want them.

### S9-3 — processor role missing SQS permissions
- **Symptom:** `dev-task-notifications` queue depth grows; router logs
  publishes; processor logs nothing; its mapping errors.
- **Investigate:** identical pattern to S7-1, shifted one hop downstream —
  which proves you can now diagnose it in one step.
- **Why/fix:** as S7-1 (receive/delete/getattributes on the queue + DLQ). The
  workshop's repetition is intentional: every consumer in AWS is "something
  with a role polls something with an ARN".

### S9-4 (exercise) — duplicate delivery on purpose
- **Symptom:** redrive (or a short visibility timeout) delivers an already
  processed event; processor logs `skipped duplicate — already processed
  (idempotent)` and does not reprocess.
- **Why:** at-least-once is a *delivery* guarantee, not a bug — queues
  redeliver when they lose certainty. The processor's dedup key
  (`type:taskId`) makes redelivery a no-op **within a warm container**; a
  cold start after exactly-once-like behavior is impossible — that gap
  (in-memory dedup vanishing on cold start) is the discussion: real systems
  keep dedup keys in a table.
- **Takeaway:** idempotency is a consumer-side obligation. Producers give
  you *at least* once; correctness is your problem.