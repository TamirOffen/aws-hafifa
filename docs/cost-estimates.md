# Cost estimates

Design target: **complete the whole workshop on a $100-credit account within
~1 month.** All prices are us-east-1, on-demand, rounded; **re-verify against
current pricing before you rely on any number** — prices change.

## 1. The cost model in one table

Monthly run-rate when left running 24/7, per VPC (Dev shown; Prod identical while un-parked):

| Item | Rate | Monthly |
|---|---|---|
| NAT Gateway | $0.045/hr + $0.045/GB processed | **~$33** + cents |
| ALB | ~$0.0225/hr + LCU | **~$17** |
| Fargate task (0.25 vCPU / 0.5 GB) × 2 services | ~$0.0123/hr each | **~$18** |
| ECR storage (~0.5 GB of images) | $0.10/GB-mo | ~$0.05 |
| CloudWatch Logs (small volumes, short retention) | $0.50/GB in + $0.03/GB-mo | ~$1 |
| **Dev total, running** | | **≈ $70/month** |

Prod while parked ≈ **$0/month** (services at 0, NAT + ALB deleted, VPC
skeleton free). Deploy windows (~5 hours total across Stages 5 and 9) cost
~$0.10/hour: `ALB $0.0225 + NAT $0.045 + 2 tasks ~$0.025 ≈ $0.09/hr`.

Near-free regardless: SQS (1M requests/mo free), Lambda (1M requests +
400k GB-s free every month), DynamoDB on-demand at workshop scale (free-tier
WCU/RCU on new accounts, pennies otherwise), DynamoDB Streams (read units at
workshop scale ≈ $0), t3.micro EC2 test vehicles (free-tier eligible; used
for minutes), VPC/subnets/route tables/IGW/security groups (**free**).

**Total expected: ≈ $70–80 for the month.** Headroom against $100 exists
for a second attempt at a stage, forgotten-overnight instances, or slightly
higher ALB LCU. If your account has 12-month free-tier benefits or credits,
some lines shrink further — treat that as headroom, not as budget.

## 2. Per-stage cost table

Cumulative *new* monthly run-rate added by each stage (assuming you keep
everything running; parking guidance in §4):

| Stage | Adds | New monthly run-rate |
|---|---|---|
| 0 | nothing AWS | $0 |
| 1 | billing alarm + budget | $0 |
| 2 | Dev VPC + 1 NAT GW (+ throwaway EC2s, terminate immediately) | **~$33** |
| 3 | ECR (cents) + 1 Fargate task | ~$9 |
| 4 | ALB + 2nd Fargate task | ~$26 |
| 5 | Prod VPC stack — then **parked** (≈$0/mo; ~$1 total in deploy windows) | ≈$0 (parked) |
| 6 | log retention, metric filters, alarms | ~$1 |
| 7 | SQS + Lambda (free tier at this scale) | ~$0 |
| 8 | DynamoDB table (free tier at this scale) | ~$0 |
| 9 | Streams + 2 Lambdas + Prod redeploy window | ~$0 (redrive windows ≈ $0.10) |

Running **total at Stage 9 if you never parked anything: ≈ $70–80** — the
budget only works *because* Prod is parked after Stage 5 and Dev is parked
during long pauses.

## 3. The NAT Gateway callout (why this architecture looks the way it does)

- Textbook HA layout: one NAT Gateway **per AZ**. With 2 AZs × 2 VPCs that is
  **4 NAT Gateways ≈ $130/month — over the entire workshop budget before a
  single container runs.**
- This workshop: **one NAT Gateway per VPC**, in AZ-a's public subnet; the
  AZ-b private subnet routes cross-AZ through it. Saves ~$65/month.
- The trade-off is real and it is taught, not hidden: if AZ-a fails, outbound
  internet from private subnets fails with it. Stage 2 includes a sidebar and
  a paper exercise for sketching the production-grade 2-NAT variant — you just
  don't pay for it here.
- NAT also charges **$0.045/GB processed**. Workshop traffic is trivial; real
  workloads add this up fast.

## 4. Pause guidance

| Pause length | What to do | Restart cost |
|---|---|---|
| < 2 days | nothing | — |
| 2 days – 1 week | scale both Dev services to 0 (NAT is the big line — decide if ~$1.50/day is worth a 5-minute restart) | minutes, ~$0 |
| > 1 week | **Park Dev**: scale services to 0, delete Dev NAT GW **and release its Elastic IP** (~$0.005/hr if left dangling), optionally delete Dev ALB | ~10 min via [teardown.md](teardown.md) park/redeploy checklists; ECR images + VPC skeleton persist |

**Prod is always parked after Stage 5's checkpoint** — that is a step of the
workshop itself, not an optional pause.

## 5. What happens if the tutorial runs long

At ~$70/month running Dev, an extra month costs ~$70. If you need to stretch
across two or three calendar months, park everything between sessions (§4) and
the marginal cost of elapsed time is ≈ $0 + your deploy-window hours. The
VPC skeleton, ECR images, IAM roles, SQS queues, and the DynamoDB table are
all free (or cents) while parked — **only the NAT Gateway, ALB, and running
containers bill by the hour.**

## 6. Budget hygiene recap (Stage 1 installs these)

- Billing alarm at **$5** (catches runaway spend the same day).
- Monthly budget **$50** with alerts at 80% and 100% (expected steady-state is
  ~$70 in the final weeks — you will get the 80% ($40) alert mid-project on
  purpose; it should *not* surprise you, and reaching it while Dev is fully
  deployed is expected, not a problem).
- Every stage's **Cost check** tells you what that stage added and how to
  remove it.