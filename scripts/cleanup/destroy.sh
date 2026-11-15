#!/usr/bin/env bash
# Delete the CloudFormation stack and everything in it (API, Lambdas, table, user pool,
# log groups, alarms). ALL NOTES AND USER ACCOUNTS IN THE STACK ARE PERMANENTLY DELETED.
# Stage=prod stacks keep the table (DeletionPolicy: Retain) and block user-pool deletion.
set -euo pipefail

STACK_NAME="${1:-serverless-notes-dev}"
REGION="eu-central-1"

echo "Account / identity:"
aws sts get-caller-identity --region "$REGION" --output table
echo "Resources that will be deleted from stack '$STACK_NAME' in $REGION:"
aws cloudformation list-stack-resources --region "$REGION" --stack-name "$STACK_NAME" \
  --query 'StackResourceSummaries[].[ResourceType,PhysicalResourceId]' --output table

read -r -p "Type the stack name to confirm deletion: " answer
[ "$answer" = "$STACK_NAME" ] || { echo "Aborted."; exit 1; }

sam delete --stack-name "$STACK_NAME" --region "$REGION" --no-prompts
echo "Deleted. Verify nothing is left:"
echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION   # should fail: does not exist"
echo "Note: 'sam deploy --resolve-s3' created a shared bucket in stack 'aws-sam-cli-managed-default';"
echo "      delete that stack too if you no longer use SAM in this account."
