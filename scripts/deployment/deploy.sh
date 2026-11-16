#!/usr/bin/env bash
# Validate, build and deploy the stack to AWS with SAM. Requires: AWS credentials for a
# development account, the SAM CLI, and infrastructure/samconfig.toml (copy the example).
# Nothing is deployed until you confirm the CloudFormation change set.
set -euo pipefail
cd "$(dirname "$0")/../../infrastructure"

# Region: AWS_REGION if set, otherwise the thesis default (Frankfurt).
REGION="${AWS_REGION:-eu-central-1}"
echo "==> Region: $REGION"
[ -f samconfig.toml ] || { echo "Copy samconfig.example.toml to samconfig.toml first." >&2; exit 1; }

echo "==> Target account / identity (check this is your DEVELOPMENT account):"
aws sts get-caller-identity --region "$REGION" --output table

echo "==> sam validate --lint"
sam validate --lint --region "$REGION"

echo "==> sam build"
sam build

echo "==> sam deploy (you will be asked to confirm the change set)"
sam deploy --region "$REGION" "$@"

echo "==> Stack outputs"
STACK_NAME="$(grep -E '^stack_name' samconfig.toml | head -1 | cut -d'"' -f2)"
aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
echo "Next: python scripts/deployment/write_frontend_env.py --stack-name $STACK_NAME --region $REGION"
