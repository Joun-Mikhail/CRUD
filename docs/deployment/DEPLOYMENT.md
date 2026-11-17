# Deployment guide

> **Status (2026-11-17): DEPLOYED AND TESTED in eu-north-1** — stack `serverless-notes-dev` (development stage).
> The reviewed change set (33 resources) reached `CREATE_COMPLETE` in about 90 s on 2026-11-17; three follow-up updates changed only the API definition (one of them a temporary diagnostic, reverted) and the function code. Live suite: 38/38 checks passed; browser test of the AWS mode, CloudWatch checks and a bounded benchmark are in `docs/testing/TESTING.md`. Evidence: `evidence/aws/`, `evidence/tests/live-api-tests.json`, `evidence/benchmarks/aws-dev-eu-north-1.json`. Problems met on the way and their fixes: `TROUBLESHOOTING.md`, "First deployment".

Region: `eu-north-1` (Stockholm; ADR 0008 explains why not the thesis text's eu-central-1). Stack name used below: `serverless-notes-dev`.

**Deploying to another region**: the template itself is region-neutral. Set `region` in `infrastructure/samconfig.toml` and `export AWS_REGION=<region>` before `make deploy`, `make frontend-env`, `make live-test` and `make destroy`; the scripts use `AWS_REGION` and fall back to `eu-north-1`. Before choosing another region, confirm there that Cognito user pools, Lambda on arm64 with the `python3.13` runtime, API Gateway REST APIs and DynamoDB are available, and check that your account is allowed to use that region (an organization policy may deny it).

## 0. Prerequisites

| Tool | Version used here | Install |
|---|---|---|
| Python | 3.13 | python.org |
| Node.js | 22 | nodejs.org |
| AWS CLI v2 | — | docs.aws.amazon.com/cli |
| AWS SAM CLI | 1.172 | `pip install aws-sam-cli` or the official installer |
| cfn-lint | 1.60 | `pip install cfn-lint` |

**Windows.** Use Git Bash for the shell scripts. `make` is not part of Git for Windows; either install it or run the commands behind each target (they are one-liners in the `Makefile`). The virtual environment's programs are in `backend/.venv/Scripts/` instead of `backend/.venv/bin/`; the `Makefile`, `scripts/setup/setup.sh` and the Playwright configuration handle both. The SAM CLI and cfn-lint can be installed without administrator rights with `uv tool install aws-sam-cli` and `uv tool install cfn-lint`. `sam build` needs a `python3.13` interpreter on `PATH`; Docker is not required because the functions have no third-party dependencies.

An AWS account you control. Strongly recommended: a **separate account or at least a dedicated IAM role for this project**, with a budget alert (a budget notifies; it does not stop spending).

## 1. Install dependencies

```bash
make setup          # = scripts/setup/setup.sh: backend venv + pip install, frontend npm ci
```

## 2. Configure AWS credentials

Use short-lived credentials (IAM Identity Center / `aws configure sso`, or `aws login`). Do not create long-lived access keys for the root user.

The AWS CLI and SAM CLI read an `aws login` profile directly. The Python helper scripts (`make frontend-env`, `make live-test`) use boto3, which needs the extra package `botocore[crt]` for that credential type; without installing anything you can hand them short-lived credentials from the CLI instead (nothing is printed):
```bash
eval "$(aws configure export-credentials --profile <your-profile> --format env)"; unset AWS_PROFILE
```

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
sam validate --region eu-north-1           # runs the SAM transform - the check that matters
sam validate --lint --region eu-north-1    # runs cfn-lint only; it does NOT run the transform
sam build
```

## 4. Deploy

```bash
sam deploy --no-execute-changeset   # optional: only create the change set and review it
sam deploy            # shows the change set and asks for confirmation
# or, from the repository root: make deploy
```
First deployment takes a few minutes. What gets created (33 resources with the example configuration): 1 REST API + deployment + stage, 5 Lambda functions with 5 IAM roles and 5 invoke permissions, 1 DynamoDB table with 1 index, 1 Cognito user pool + domain + resource server + 2 app clients, 5 log groups, 4 alarms. No VPC, no NAT gateway. The first `sam deploy --resolve-s3` in a region also creates the stack `aws-sam-cli-managed-default` with one S3 bucket for the deployment package (about 18 KB).

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
aws cloudformation describe-stacks --stack-name serverless-notes-dev --region eu-north-1 \
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
Register with a real e-mail address, enter the code Cognito sends, sign in. (Verified on 2026-11-17 with an SES mailbox-simulator address, except reading the code — see `docs/testing/TESTING.md`.) Cognito's default e-mail sending is limited to a small number of messages per day; that is enough for development. The frontend is run locally; hosting it (S3 + CloudFront or Amplify Hosting) is future work — if you do, add the hosted origin to `AllowedOrigin`, `CallbackUrls` and `LogoutUrls` and build with `npm run build:aws`.

## 7. Test the deployment

```bash
make live-test           # scripts/testing/live_api_tests.py --stack-name serverless-notes-dev
```
Creates two temporary users, signs them in through the hosted login with PKCE, runs the thesis table, authentication, scope, isolation, routing, validation, CORS and throttling checks (38 in total), deletes what it created and writes `evidence/tests/live-api-tests.json`. Result on 2026-11-17: 38/38 passed. The throttling check sends two bursts of 120 list requests at the end; afterwards `GET /notes` can keep answering 429 for a few minutes (`docs/performance/PERFORMANCE.md`), so wait before using the app, or run with `--skip-throttle`.

Manual smoke test with curl (copy an access token from the app? — the app deliberately never shows it; use the live script, or the hosted-login flow in a tool such as Postman with PKCE):

```bash
curl -i "$API/notes"                                   # expect 401 + JSON envelope
curl -s "$API/notes" -H "Authorization: Bearer $ACCESS_TOKEN"
```
Then look at the logs:
```bash
sam logs --stack-name serverless-notes-dev --region eu-north-1 --tail
```
Latency benchmark (bounded, sequential): see `docs/performance/PERFORMANCE.md`.

## 8. Inspect usage and cost

```bash
aws cloudformation list-stack-resources --stack-name serverless-notes-dev --region eu-north-1
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
