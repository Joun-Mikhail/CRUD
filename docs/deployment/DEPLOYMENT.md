# Deployment guide

> **Status: AWS DEPLOYMENT: NOT VERIFIED — NO AUTHORIZED CLOUD ENVIRONMENT.**
> The template passes `cfn-lint`, `sam validate --lint` and `sam build`, but it has never been deployed. Expect to fix small things on the first deployment and record what you changed. The most likely candidates are listed in `TROUBLESHOOTING.md`.

Region: `eu-central-1`. Stack name used below: `serverless-notes-dev`.

## 0. Prerequisites

| Tool | Version used here | Install |
|---|---|---|
| Python | 3.13 | python.org |
| Node.js | 22 | nodejs.org |
| AWS CLI v2 | — | docs.aws.amazon.com/cli |
| AWS SAM CLI | 1.172 | `pip install aws-sam-cli` or the official installer |
| cfn-lint | 1.58 | `pip install cfn-lint` |

An AWS account you control. Strongly recommended: a **separate account or at least a dedicated IAM role for this project**, with a budget alert (a budget notifies; it does not stop spending).

## 1. Install dependencies

```bash
make setup          # = scripts/setup/setup.sh: backend venv + pip install, frontend npm ci
```

## 2. Configure AWS credentials

Use short-lived credentials (IAM Identity Center / `aws configure sso`, or `aws login`). Do not create long-lived access keys for the root user.

```bash
aws configure sso                       # once
export AWS_PROFILE=<your-profile>
aws sts get-caller-identity             # confirm the account id is the one you expect
```
Permissions needed by the deploying identity: CloudFormation, S3 (SAM artifact bucket), Lambda, API Gateway, DynamoDB, Cognito, IAM (create roles for the functions), CloudWatch Logs/Alarms, SNS (only if `AlarmEmail` is set).

## 3. Validate and build

```bash
cd infrastructure
cp samconfig.example.toml samconfig.toml        # git-ignored; edit stack name / parameters if you like
cfn-lint template.yaml
sam validate --lint --region eu-central-1
sam build
```

## 4. Deploy

```bash
sam deploy            # shows the change set and asks for confirmation
# or, from the repository root: make deploy
```
First deployment takes a few minutes. What gets created: 1 REST API + stage, 5 Lambda functions with 5 IAM roles, 1 DynamoDB table with 1 index, 1 Cognito user pool + domain + resource server + 1–2 app clients, 5 log groups, 4 alarms. No VPC, no NAT gateway.

Parameters (see the top of `template.yaml`):

| Parameter | Default | Meaning |
|---|---|---|
| `Stage` | `dev` | `dev`/`test` delete data with the stack; `prod` retains the table, enables PITR and user-pool deletion protection |
| `AllowedOrigin` | `http://localhost:5173` | the one origin allowed by CORS |
| `CallbackUrls`, `LogoutUrls` | localhost URLs | OAuth redirect URIs |
| `CognitoDomainPrefix` | empty → `<stack>-<account id>` | hosted login domain prefix (must be regionally unique) |
| `LogRetentionDays` | 14 | |
| `ThrottlingRateLimit` / `BurstLimit` | 10 / 20 | stage throttle |
| `AlarmEmail` | empty | set to receive alarm e-mails (confirm the SNS subscription) |
| `EnableApiAccessLogs` | `false` | `true` also sets the region-wide API Gateway CloudWatch role |
| `EnableScopeTestClient` | `false` (example config: `true`) | read-only app client for live scope tests |

## 5. Stack outputs

```bash
aws cloudformation describe-stacks --stack-name serverless-notes-dev --region eu-central-1 \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
```
| Output | Used for |
|---|---|
| `ApiBaseUrl` | `VITE_API_BASE_URL` |
| `Region` | `VITE_AWS_REGION` |
| `UserPoolId` | `VITE_COGNITO_USER_POOL_ID` |
| `UserPoolClientId` | `VITE_COGNITO_CLIENT_ID` |
| `CognitoDomain` | `VITE_COGNITO_DOMAIN` |
| `TokenIssuer` | expected `iss` claim |
| `NotesTableName`, `LogGroupPrefix` | operations |
| `ReadOnlyTestClientId` | live scope tests (if enabled) |

## 6. Configure and start the frontend against AWS

```bash
make frontend-env        # writes frontend/.env.aws from the outputs (identifiers only, git-ignored)
cd frontend && npm run dev:aws      # http://localhost:5173
```
Register with a real e-mail address, enter the code Cognito sends, sign in. The frontend is run locally; hosting it (S3 + CloudFront or Amplify Hosting) is future work — if you do, add the hosted origin to `AllowedOrigin`, `CallbackUrls` and `LogoutUrls` and build with `npm run build:aws`.

## 7. Test the deployment

```bash
make live-test           # scripts/testing/live_api_tests.py --stack-name serverless-notes-dev
```
Creates two temporary users, signs them in through the hosted login with PKCE, runs the thesis table + authentication + isolation checks, deletes what it created and writes `evidence/tests/live-api-tests.json`. It has never been run — treat a failure first as a possible script problem.

Manual smoke test with curl (copy an access token from the app? — the app deliberately never shows it; use the live script, or the hosted-login flow in a tool such as Postman with PKCE):

```bash
curl -i "$API/notes"                                   # expect 401 + JSON envelope
curl -s "$API/notes" -H "Authorization: Bearer $ACCESS_TOKEN"
```
Then look at the logs:
```bash
sam logs --stack-name serverless-notes-dev --region eu-central-1 --tail
```
Latency benchmark (bounded, sequential): see `docs/performance/PERFORMANCE.md`.

## 8. Inspect usage and cost

```bash
aws cloudformation list-stack-resources --stack-name serverless-notes-dev --region eu-central-1
aws ce get-cost-and-usage --time-period Start=2026-11-01,End=2026-12-01 --granularity MONTHLY \
  --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE      # Cost Explorer API: small charge per call
```
Console: Billing → Bills (per service), Cost Explorer, Budgets; CloudWatch → Metrics for request counts. See `AWS_COST_ANALYSIS.md`.

## 9. Clean up

```bash
make destroy             # scripts/cleanup/destroy.sh: lists resources, asks you to type the stack name, sam delete
```
`dev`/`test`: everything, including all notes, users and logs, is deleted. Afterwards verify: `aws cloudformation describe-stacks --stack-name serverless-notes-dev` must fail with "does not exist". SAM's shared artifact bucket (stack `aws-sam-cli-managed-default`) remains; delete it separately if you no longer need it.

## GitHub Actions deployment (optional)

`.github/workflows/deploy.yml` is manual (`workflow_dispatch`), runs in a GitHub Environment, and assumes an AWS role through OIDC — no stored keys.

1. AWS → IAM → Identity providers → add OpenID Connect provider `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
2. Create a role trusted by that provider with the condition
   `token.actions.githubusercontent.com:sub = repo:<owner>/<repo>:environment:dev`, and attach the deployment permissions from step 2 above.
3. GitHub → Settings → Environments → `dev`: add required reviewers; add the environment **variable** `AWS_DEPLOY_ROLE_ARN`.
4. Actions → "Deploy (manual)" → Run workflow → approve.
