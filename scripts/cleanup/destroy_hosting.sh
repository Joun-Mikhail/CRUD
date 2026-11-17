#!/usr/bin/env bash
# Delete the frontend hosting stack (CloudFront distribution, OAC, headers policy, S3 bucket).
# The API stack, its users and notes are NOT affected. Afterwards remove the CloudFront URL
# from the API stack's AllowedOrigin/CallbackUrls/LogoutUrls (docs/deployment/DEPLOYMENT.md).
set -euo pipefail
WEB_STACK="${1:-serverless-notes-dev-web}"
REGION="${AWS_REGION:-eu-north-1}"

BUCKET="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$WEB_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)"
read -r -p "Delete stack '$WEB_STACK' and every object version in '$BUCKET'? Type the stack name: " answer
[ "$answer" = "$WEB_STACK" ] || { echo "Aborted."; exit 1; }

# A versioned bucket must be emptied of all versions and delete markers before deletion.
while true; do
  batch="$(aws s3api list-object-versions --region "$REGION" --bucket "$BUCKET" --max-items 500 \
    --query '{Objects: [Versions, DeleteMarkers][][].{Key: Key, VersionId: VersionId}}' --output json)"
  [ "$(echo "$batch" | grep -c '"Key"')" -eq 0 ] && break
  aws s3api delete-objects --region "$REGION" --bucket "$BUCKET" --delete "$batch" >/dev/null
done
aws cloudformation delete-stack --region "$REGION" --stack-name "$WEB_STACK"
aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$WEB_STACK"
echo "Deleted $WEB_STACK."
