# AWS account pre-flight checks — 2026-11-16 (before any deployment)

All values below were read from the AWS APIs on 2026-11-16 with read-only calls (through the AWS MCP server and AWS CLI 2.40.3, same identity). The account id is redacted as `<account-id>` in the evidence files of this directory. Nothing in this file is a deployment result.

## Identity and permissions

| Check | Result | API |
|---|---|---|
| Caller | assumed role `AccountFullAccessRole` (path `/managed/`), managed policy `AdministratorAccess`, no permissions boundary, no inline policies | `sts:GetCallerIdentity`, `iam:GetRole`, `iam:ListAttachedRolePolicies` |
| Organization | the account is a member of an AWS Organization with service control policies enabled | `organizations:DescribeOrganization` |
| Deployment permissions in **eu-north-1** | `allowed` for all 43 simulated actions (CloudFormation change sets and stacks, S3, IAM roles and PassRole, Lambda, API Gateway, DynamoDB, Cognito user pools, CloudWatch Logs and alarms) when `aws:RequestedRegion=eu-north-1` | `iam:SimulatePrincipalPolicy` |
| Same actions in eu-central-1, eu-west-1, us-east-1 | `explicitDeny`, `AllowedByOrganizations: false` (sampled: `cloudformation:CreateChangeSet`, `lambda:CreateFunction`, `cognito-idp:CreateUserPool`) | `iam:SimulatePrincipalPolicy` |

Conclusion: the project can only be deployed to eu-north-1 from this account (ADR 0008).

## State of eu-north-1 before the change set was created

| Resource type | Count |
|---|---|
| CloudFormation stacks | 0 |
| DynamoDB tables | 0 |
| Cognito user pools | 0 |
| API Gateway REST APIs | 0 |
| Lambda functions | 0 |
| CloudWatch alarms | 0 |
| Log groups `/aws/lambda/serverless-notes-dev*` | 0 |
| S3 buckets (account-wide) | 0 |
| Cognito hosted-domain prefix `serverless-notes-dev-<account-id>` | free |

## Quotas relevant to the stack

| Quota | Value |
|---|---|
| Lambda concurrent executions (account, region) | 400 (unreserved 400) |
| Lambda code storage used | 0 of 300 GB |
| API Gateway account-level throttle | 10,000 requests/s, burst 5,000 (the stack sets 10 / 20 on its stage) |
| DynamoDB on-demand table throughput limits | 40,000 read / 40,000 write units per table |
| API Gateway CloudWatch role (region-wide setting) | not set; the stack leaves it untouched because `EnableApiAccessLogs=false` |

## Billing

| Check | Result | API |
|---|---|---|
| Account plan | Free plan, `ACTIVE`; USD 99.68 credits remaining on 2026-11-16, USD 98.94 on 2026-11-17; plan end date 2027-04-18 | `freetier:GetAccountPlanState` |
| Budget | `My Monthly Cost Budget`, USD 10.00 monthly, cost budget; three notifications (actual > 60 % in `ALARM`; forecast > 50 % and > 100 % `OK`); no budget actions | `budgets:DescribeBudgets`, `DescribeNotificationsForBudget`, `DescribeBudgetActionsForBudget` |
| Budget actual spend | USD 10.769 on 2026-11-16, USD 11.212 on 2026-11-17 — above the limit. This is **gross usage; Free-plan credits offset all of it (Cost Explorer `RECORD_TYPE`: Usage +11.21, Credit −11.21 for November), so the net charge is ≈ USD 0.** | `budgets:DescribeBudgets`, Cost Explorer |
| Source of that usage (2026-11-17) | one EC2 `t3.small` instance + 20 GB gp2 volume + public IPv4 address in eu-north-1, running since 2026-10-18, **not part of this project** and left untouched. Since 2026-10-01: EC2 compute USD 15.22, VPC (public IPv4) USD 3.53, EC2-Other (EBS) USD 2.01, S3 < USD 0.01 — about USD 0.71 per day. The serverless resource counts above were correct, but EC2 had not been listed on 2026-11-16. | Cost Explorer `GetCostAndUsage`, `ec2:DescribeInstances` |
| Unit prices for eu-north-1 | see `AWS_COST_ANALYSIS.md` | `pricing:GetProducts` |

## What the change-set preparation created in the account

| Resource | Purpose | Cost |
|---|---|---|
| Stack `aws-sam-cli-managed-default` with one S3 bucket (`aws-sam-cli-managed-default-samclisourcebucket-…`) | holds the deployment package (18 KB zip) and the packaged template (28 KB) | far below one cent per month |
| Stack `serverless-notes-dev` in status `REVIEW_IN_PROGRESS` with change set `samcli-deploy1794851343` (`CREATE_COMPLETE`, `AVAILABLE`) | the proposed deployment; the stack contains **no resources** until the change set is executed | free |

Re-checked 2026-11-17 before execution: the change set is still `CREATE_COMPLETE` / `AVAILABLE` with 33 `Add` actions; the stack still has 0 resources; the region still has no table, user pool, REST API, Lambda function or alarm; the Cognito domain prefix is still free. The change set's template equals the local `infrastructure/template.yaml` once the build-added `Metadata` and `CodeUri` are ignored, and its code package equals `backend/src` file by file (25 files, SHA-256).

A first change set (`samcli-deploy1794851211`) failed in the SAM transform and was deleted; see `aws-changeset-create.txt` and `docs/deployment/TROUBLESHOOTING.md`.
