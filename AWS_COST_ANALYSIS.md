# AWS cost analysis

> **Read this first.** The unit prices below are list prices for `eu-north-1` (Stockholm), read from the **AWS Price List API** (`pricing:GetProducts`, filter `regionCode=eu-north-1`) on 2026-11-16. The scenario totals are still **estimates** built on the stated assumptions: the development stack was deployed on 2026-11-17, but Cost Explorer needs a day or more to show usage, so no real bill has been compared yet. Usage during the 2026-11-17 tests: roughly 2,000 API requests, 2,000 Lambda invocations and a few thousand DynamoDB request units — a cost of well under one cent at the prices below. Prices exclude VAT and can change; re-check before quoting them in the thesis ([AWS Pricing Calculator](https://calculator.aws/)).

## Verification status

| Item | Result | Source |
|---|---|---|
| Unit prices in the table below (API Gateway REST, Lambda arm64, DynamoDB on-demand, Cognito Lite, CloudWatch Logs and alarms, S3 storage) | **Confirmed for eu-north-1** on 2026-11-16 | AWS Price List API |
| Free Tier change of 15 July 2025: new accounts choose a Free or Paid plan; the Free plan ends after 6 months or when credits run out; up to $200 in credits; older accounts keep the 12-month model | **Confirmed** (web check 2026-11-15) | [AWS What's New](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan), [AWS News Blog](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits) |
| Cognito: 10,000 MAU per month free on Lite and Essentials | **Confirmed** (web check 2026-11-15); the Price List API lists only the paid tiers | [Cognito pricing](https://aws.amazon.com/cognito/pricing) |
| Always-free allowances (Lambda 1 million requests + 400,000 GB-seconds; CloudWatch 5 GB logs and 10 alarm-metrics; 100 GB data transfer out) | Not re-checked for this account; the estimates ignore them | pricing pages |
| Data transfer out, SNS, HTTP API prices | Not queried | pricing pages |

## This project's account (checked 2026-11-16, before any deployment)

| Fact | Value | How it was read |
|---|---|---|
| Account plan | Free plan, active; USD 99.68 of credits remaining; plan end date 2027-04-18 | `freetier:GetAccountPlanState` |
| Budget | "My Monthly Cost Budget": USD 10.00 per month, notifications only, no budget actions | `budgets:DescribeBudgets`, `DescribeBudgetActionsForBudget` |
| Budget status | Budget "actual" USD 11.21 for November (USD 9.55 in October) — above the limit — but this is **gross usage, fully offset by Free-plan credits: net charge ≈ USD 0**. Cause (checked 2026-11-17): one EC2 `t3.small` instance with a 20 GB gp2 volume and a public IPv4 address, running in eu-north-1 since 2026-10-18 and **unrelated to this project** — about USD 0.71 per day (EC2 compute ≈ 73 %, VPC public IPv4 ≈ 17 %, EBS ≈ 10 %). At that rate the remaining credits (USD 98.94) last until about early April 2027; the Free plan ends on 2027-04-18 or when the credits run out. | `budgets:DescribeBudgets`, Cost Explorer `GetCostAndUsage` (grouped by service, region and record type), `ec2:DescribeInstances` |
| Allowed region | eu-north-1 only (organization policy; ADR 0008) | `iam:SimulatePrincipalPolicy` |

Expected cost of deploying and testing the development stack: the nine alarm-metrics accrue about $0.90 per month ($0.03 per day) at list price, everything else is per request. One deployment, the live tests and a bounded benchmark (a few thousand requests) come to **a few cents; under $1 if the stack is left running for a month** without traffic. Details in the scenarios below.

## What costs money in this architecture

Everything is pay-per-use; there is no always-on server, load balancer, NAT gateway or provisioned database.

| Service | Billed for | Unit price, eu-north-1 (Price List API, 2026-11-16) | Pricing page |
|---|---|---|---|
| API Gateway REST API | requests | $3.50 per million (first 333 million per month) | aws.amazon.com/api-gateway/pricing |
| Lambda (arm64) | requests + duration × memory | $0.20 per million requests + $0.0000133334 per GB-second (x86: $0.0000166667) | aws.amazon.com/lambda/pricing |
| DynamoDB on-demand | read/write request units + storage | $0.67 per million write units, $0.1345 per million read units, $0.269 per GB-month (first 25 GB free) | aws.amazon.com/dynamodb/pricing/on-demand |
| Cognito user pool (Lite tier) | monthly active users (MAU) | first 10,000 MAU free, then $0.0055 per MAU | aws.amazon.com/cognito/pricing |
| CloudWatch Logs | GB ingested + GB stored | $0.54 per GB ingested, $0.028 per GB-month stored | aws.amazon.com/cloudwatch/pricing |
| CloudWatch alarms | per alarm-metric-month | $0.10 per standard-resolution alarm metric (4 alarms; metric-math alarms are billed per metric they use: 1 + 1 + 5 + 2 = 9 alarm-metrics) | same |
| Data transfer out | GB to the internet | first 100 GB/month free (account-wide), then ≈ $0.09 per GB (not queried) | aws.amazon.com/ec2/pricing/on-demand (Data Transfer) |
| S3 (SAM deployment artifacts) | storage | $0.023 per GB-month; the package is about 18 KB → far below a cent | aws.amazon.com/s3/pricing |
| S3 (frontend site bucket, since 2026-11-17) | storage, requests | $0.023 per GB-month; $0.005 per 1,000 PUT; $0.004 per 10,000 GET (Price List API, 2026-11-17). Site ≈ 0.5 MB per version → far below a cent | aws.amazon.com/s3/pricing |
| CloudFront (frontend, since 2026-11-17) | data out, HTTPS requests, invalidations | Europe: $0.085 per GB (first 10 TB), $0.012 per 10,000 HTTPS requests, invalidations free for the first 1,000 paths a month (Price List API, 2026-11-17). **Always-free tier: 1 TB and 10 M requests a month** → $0 at thesis scale; ≈ 140 kB transferred per first visit | aws.amazon.com/cloudfront/pricing |
| SNS e-mail (only if `AlarmEmail` set) | notifications | first 1,000 e-mails/month free (not queried) | aws.amazon.com/sns/pricing |

Not used, therefore no cost: VPC/NAT gateway, provisioned concurrency, X-Ray, API Gateway caching, WAF, KMS customer keys, CloudWatch dashboards, detailed API metrics, Cognito Essentials/Plus features, SES.

## Free tier — check your account, do not assume

- AWS changed the Free Tier for accounts created **on or after 15 July 2025**: new accounts get a credit-based free plan (limited duration and credit amount) instead of the old 12-month offers. Older accounts keep the legacy rules (for example 1 million API Gateway REST calls per month for the first 12 months).
- "Always free" allowances that have applied to all accounts — verify they still do for yours: Lambda 1 million requests + 400,000 GB-seconds per month; DynamoDB 25 GB storage (on-demand *requests* are not free); CloudWatch 5 GB log ingestion, 10 alarm-metrics, 10 custom metrics; Cognito 10,000 MAU (Lite/Essentials); 100 GB data transfer out.
- Check: Billing console → **Free Tier** page shows exactly what your account is entitled to and how much is used.

The estimates below therefore show **list price without any free tier** (worst case) so they cannot understate the cost.

## Assumptions for the estimates

- Mix per 100 requests: 50 list, 25 get, 10 create, 10 update, 5 delete.
- Lambda: 256 MB, average billed duration 30 ms (assumption — measure it; includes occasional cold starts) → 0.0075 GB-s per request.
- DynamoDB: notes ≈ 1 KB. Create = 2 write units (table + index), delete = 2, update = 1; get (strongly consistent) = 1 read unit; list page of 20 × 1 KB eventually consistent ≈ 3 read units. Per 100 requests: 40 write units, 175 read units.
- Logs: ≈ 0.5 KB of application log + ≈ 0.4 KB of Lambda START/END/REPORT lines per request ≈ 0.9 KB.
- Response size ≈ 2 KB average (list pages up to ≈ 25 KB).
- Each Cognito user is active in the month.

## Scenarios (list price, no free tier, per month)

| | Very low — you testing and demonstrating | Small application | Moderate |
|---|---|---|---|
| Users (MAU) | 5 | 200 | 5,000 |
| Requests / month | 10,000 | 300,000 | 5,000,000 |
| API Gateway | $0.04 | $1.05 | $17.50 |
| Lambda requests | $0.002 | $0.06 | $1.00 |
| Lambda duration | $0.001 | $0.03 | $0.50 |
| DynamoDB writes | $0.003 | $0.08 | $1.34 |
| DynamoDB reads | $0.002 | $0.07 | $1.18 |
| DynamoDB storage | < $0.01 (MBs) | $0.01 (≈ 20 MB) | $0.27 (≈ 1 GB incl. index) |
| Cognito | $0 | $0 | $0 (under 10,000 MAU) |
| CloudWatch Logs | $0.005 | $0.15 | $2.49 |
| CloudWatch alarms | ≈ $0.90 | ≈ $0.90 | ≈ $0.90 |
| Data transfer | $0 | $0 | $0 (≈ 10 GB < 100 GB) |
| **Total (approx.)** | **≈ $1** | **≈ $2.35** | **≈ $25** |

Observations:
- At thesis scale the bill is dominated by the **alarms**, not by traffic — and those fall inside the always-free CloudWatch allowance if your account has it, making the realistic figure a few cents. Delete the alarms from the template if you want literally minimal cost.
- At scale the dominant line is **API Gateway REST requests** (~70 %). An HTTP API costs roughly a third as much per request (its Stockholm price was not queried) and would cut the moderate scenario by roughly $11; see ADR 0001 for why the REST API was kept.
- Cost grows linearly with requests and falls to (almost) zero with no traffic. A comparable always-on setup (one small EC2 instance or container + a managed relational database + load balancer) costs tens of dollars per month even when idle.
- Cognito becomes the largest item only beyond 10,000 monthly active users.

## One-time and occasional costs

| Item | Cost |
|---|---|
| Deploying / redeploying the stack (CloudFormation) | free |
| Running `live_api_tests.py` (≈ 40 requests, 2 temporary users) | far below one cent |
| Benchmark at the hard cap (2,500 requests) | ≈ 1–2 cents |
| Cost Explorer API calls (`aws ce …`) | $0.01 per request; the console UI is free |
| CI on GitHub Actions | no AWS cost (uses no AWS resources) |

## Keeping the cost under control

1. Use a dedicated AWS account for the project.
2. Keep a budget with e-mail alerts: Billing → Budgets (this account has one of $10 per month — see the account table above; it is already exceeded). **A budget only notifies you — it does not stop resources or cap spending.**
3. The stage throttle (10 req/s) bounds the worst case: 10 req/s × 30 days ≈ 26 million requests ≈ $125/month if someone hammered the API continuously with *valid* credentials; unauthenticated requests rejected by the authorizer are not billed by Lambda/DynamoDB (verify whether API Gateway bills rejected requests on the pricing page).
4. Log retention is 14 days, so log storage cannot grow without bound.
5. When you are not working on the project for a while: `make destroy`. Redeploying takes minutes.
6. Check actual usage: Billing → Bills (by service) and Free Tier; CloudWatch metric `AWS/ApiGateway Count` for request volume.

## Formula (for your own numbers)

```
monthly ≈ R × P_apigw
        + R × P_lambda_req + R × (duration_s × memory_GB) × P_gb_second
        + W × P_write + Rd × P_read + GB × P_storage
        + max(0, MAU − 10,000) × P_mau
        + log_GB × P_ingest + alarms × P_alarm
```
`R` requests, `W`/`Rd` DynamoDB write/read units, all `P_*` from the pricing pages.
