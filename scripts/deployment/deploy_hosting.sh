#!/usr/bin/env bash
# Create or update the frontend hosting stack (private S3 + CloudFront OAC) through a
# CloudFormation change set that is printed and must be confirmed before execution.
#
#   ./scripts/deployment/deploy_hosting.sh            # stack serverless-notes-dev-web
#
# Afterwards: add the printed SiteUrl to the API stack's AllowedOrigin, CallbackUrls and
# LogoutUrls (docs/deployment/DEPLOYMENT.md, "Frontend hosting"), then publish_frontend.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."

REGION="${AWS_REGION:-eu-north-1}"
STAGE="${STAGE:-dev}"
WEB_STACK="${WEB_STACK:-serverless-notes-$STAGE-web}"
TEMPLATE=infrastructure/frontend-hosting.yaml
CHANGE_SET="deploy-$(date +%Y%m%d%H%M%S)"

aws sts get-caller-identity --region "$REGION" --query Arn --output text
aws cloudformation validate-template --region "$REGION" --template-body "file://$TEMPLATE" >/dev/null

if aws cloudformation describe-stacks --region "$REGION" --stack-name "$WEB_STACK" >/dev/null 2>&1; then
  TYPE=UPDATE
else
  TYPE=CREATE
fi
aws cloudformation create-change-set --region "$REGION" --stack-name "$WEB_STACK" \
  --change-set-name "$CHANGE_SET" --change-set-type "$TYPE" --template-body "file://$TEMPLATE" \
  --parameters "ParameterKey=Stage,ParameterValue=$STAGE" \
  --tags "Key=Project,Value=serverless-notes" "Key=Stage,Value=$STAGE" >/dev/null
if ! aws cloudformation wait change-set-create-complete --region "$REGION" \
    --stack-name "$WEB_STACK" --change-set-name "$CHANGE_SET"; then
  aws cloudformation describe-change-set --region "$REGION" --stack-name "$WEB_STACK" \
    --change-set-name "$CHANGE_SET" --query StatusReason --output text
  exit 1
fi
aws cloudformation describe-change-set --region "$REGION" --stack-name "$WEB_STACK" \
  --change-set-name "$CHANGE_SET" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table
read -r -p "Execute this change set? [y/N] " answer
[ "$answer" = "y" ] || { echo "Not executed."; exit 0; }
aws cloudformation execute-change-set --region "$REGION" --stack-name "$WEB_STACK" --change-set-name "$CHANGE_SET"
if [ "$TYPE" = CREATE ]; then WAIT=stack-create-complete; else WAIT=stack-update-complete; fi
aws cloudformation wait "$WAIT" --region "$REGION" --stack-name "$WEB_STACK"
aws cloudformation describe-stacks --region "$REGION" --stack-name "$WEB_STACK" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
