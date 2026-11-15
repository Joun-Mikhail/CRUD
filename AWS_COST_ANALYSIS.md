# AWS cost analysis

> **Read this first.** The unit prices below are list prices for `eu-central-1` (Frankfurt). A web check on 2026-11-15 confirmed some facts and could not confirm others (see "Verification status" below): **the Frankfurt-specific unit prices remain unconfirmed.** Treat every figure as an estimate, verify each unit price on the linked AWS pricing page with the region set to Europe (Frankfurt) before quoting it in the thesis, and prefer the [AWS Pricing Calculator](https://calculator.aws/). Prices exclude VAT. Nothing has been deployed, so there is no real bill to compare with.

## Verification status (web check, 2026-11-15)

| Item | Result | Source |
|---|---|---|
| Free Tier change of 15 July 2025: new accounts choose a Free or Paid plan; the Free plan ends after 6 months or when credits run out; up to $200 in credits; older accounts keep the 12-month model | **Confirmed** | [AWS What's New](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan), [AWS News Blog](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits) |
| Cognito: 10,000 MAU per month free on Lite and Essentials, not tied to the 12-month term; Essentials $0.015 per MAU above that | **Confirmed** | [Cognito pricing](https://aws.amazon.com/cognito/pricing) |
| Cognito Lite ≈ $0.0055 per MAU above the free allowance | Third-party source only | [Frontegg guide](https://frontegg.com/guides/aws-cognito-pricing) |
| Lambda: 1 million requests and 400,000 GB-seconds free per month; $0.20 per million requests; arm64 $0.0000133334 vs x86 $0.0000166667 per GB-second | Confirmed for US East by third-party guides; **Frankfurt rate not confirmed** (may carry a small uplift) | [Wiz](https://wiz.io/academy/cloud-cost/aws-lambda-cost-breakdown), [official page](https://aws.amazon.com/lambda/pricing/) |
| API Gateway: REST $3.50 and HTTP API $1.00 per million in US regions | Third-party sources | [CloudZero](https://www.cloudzero.com/blog/aws-api-gateway-pricing) |
| API Gateway REST in Frankfurt $3.70 per million | Only an **archived 2018** copy of the AWS page shows this; current value not confirmed | [official page](https://aws.amazon.com/api-gateway/pricing/) |
| DynamoDB on-demand: $0.625 per million writes, $0.125 per million reads, $0.25 per GB-month in us-east-1 | Third-party calculator; **no Frankfurt figures found**. The Frankfurt values used below (≈ $0.76 / $0.15 / $0.31) are my estimate of the regional uplift | [Dynobase](https://dynobase.dev/dynamodb-cost-optimization/), [official page](https://aws.amazon.com/dynamodb/pricing/on-demand/) |
| CloudWatch Logs and alarm prices, data-transfer allowance | Not checked | [official page](https://aws.amazon.com/cloudwatch/pricing/) |

Because the estimates deliberately use the higher Frankfurt-style figures and ignore every free allowance, a correction is more likely to lower the totals than to raise them. The conclusions (pay-per-use, API Gateway dominates at scale, near-zero idle cost) do not depend on the exact values.

## What costs money in this architecture

Everything is pay-per-use; there is no always-on server, load balancer, NAT gateway or provisioned database.

| Service | Billed for | Unit price to verify (eu-central-1, approximate) | Pricing page |
|---|---|---|---|
| API Gateway REST API | requests | ≈ $3.70 per million | aws.amazon.com/api-gateway/pricing |
| Lambda (arm64) | requests + duration × memory | ≈ $0.20 per million requests + ≈ $0.0000133 per GB-second | aws.amazon.com/lambda/pricing |
| DynamoDB on-demand | read/write request units + storage | ≈ $0.76 per million write units, ≈ $0.15 per million read units, ≈ $0.31 per GB-month | aws.amazon.com/dynamodb/pricing/on-demand |
| Cognito user pool (Lite tier) | monthly active users (MAU) | first 10,000 MAU free, then ≈ $0.0055 per MAU | aws.amazon.com/cognito/pricing |
| CloudWatch Logs | GB ingested + GB stored | ≈ $0.63 per GB ingested, ≈ $0.03 per GB-month stored | aws.amazon.com/cloudwatch/pricing |
| CloudWatch alarms | per alarm-month | ≈ $0.10 per standard alarm (4 alarms; metric-math alarms are billed per metric they use, so count ≈ 9 alarm-metrics) | same |
| Data transfer out | GB to the internet | first 100 GB/month free (account-wide), then ≈ $0.09 per GB | aws.amazon.com/ec2/pricing/on-demand (Data Transfer) |
| S3 (SAM deployment artifacts) | storage | a few MB → fractions of a cent | aws.amazon.com/s3/pricing |
| SNS e-mail (only if `AlarmEmail` set) | notifications | first 1,000 e-mails/month free | aws.amazon.com/sns/pricing |

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
| API Gateway | $0.04 | $1.11 | $18.50 |
| Lambda requests | $0.002 | $0.06 | $1.00 |
| Lambda duration | $0.001 | $0.03 | $0.50 |
| DynamoDB writes | $0.003 | $0.09 | $1.52 |
| DynamoDB reads | $0.003 | $0.08 | $1.31 |
| DynamoDB storage | < $0.01 (MBs) | $0.01 (≈ 20 MB) | $0.31 (≈ 1 GB incl. index) |
| Cognito | $0 | $0 | $0 (under 10,000 MAU) |
| CloudWatch Logs | $0.006 | $0.17 | $2.84 |
| CloudWatch alarms | ≈ $0.90 | ≈ $0.90 | ≈ $0.90 |
| Data transfer | $0 | $0 | $0 (≈ 10 GB < 100 GB) |
| **Total (approx.)** | **≈ $1** | **≈ $2.50** | **≈ $27** |

Observations:
- At thesis scale the bill is dominated by the **alarms**, not by traffic — and those fall inside the always-free CloudWatch allowance if your account has it, making the realistic figure a few cents. Delete the alarms from the template if you want literally minimal cost.
- At scale the dominant line is **API Gateway REST requests** (~70 %). An HTTP API (≈ $1.20 per million in Frankfurt — verify) would cut the moderate scenario by roughly $12; see ADR 0001 for why the REST API was kept.
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
2. Create a budget with e-mail alerts (e.g. $5): Billing → Budgets. **A budget only notifies you — it does not stop resources or cap spending.**
3. The stage throttle (10 req/s) bounds the worst case: 10 req/s × 30 days ≈ 26 million requests ≈ $130/month if someone hammered the API continuously with *valid* credentials; unauthenticated requests rejected by the authorizer are not billed by Lambda/DynamoDB (verify whether API Gateway bills rejected requests on the pricing page).
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
