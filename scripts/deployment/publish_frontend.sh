#!/usr/bin/env bash
# Build the frontend for its hosted (CloudFront) origin and publish it to the private S3 bucket
# of the hosting stack, then invalidate the CloudFront cache.
#
#   ./scripts/deployment/publish_frontend.sh
#
# Needs: AWS credentials (AWS_PROFILE), Node 22, the backend virtualenv (for boto3).
# Stacks: API_STACK (default serverless-notes-dev), WEB_STACK (default serverless-notes-dev-web).
set -euo pipefail
cd "$(dirname "$0")/../.."

REGION="${AWS_REGION:-eu-north-1}"
API_STACK="${API_STACK:-serverless-notes-dev}"
WEB_STACK="${WEB_STACK:-serverless-notes-dev-web}"
if [ -z "${PYTHON:-}" ]; then
  if [ -x backend/.venv/Scripts/python.exe ]; then PYTHON=backend/.venv/Scripts/python.exe
  else PYTHON=backend/.venv/bin/python; fi
fi

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$WEB_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET="$(output BucketName)"
DISTRIBUTION="$(output DistributionId)"
SITE_URL="$(output SiteUrl)"
echo "==> Publishing to $SITE_URL (bucket $BUCKET, distribution $DISTRIBUTION)"

# boto3 cannot use `aws login` profiles without botocore[crt]; hand it short-lived credentials.
if [ -n "${AWS_PROFILE:-}" ]; then
  eval "$(aws configure export-credentials --format env)"
  unset AWS_PROFILE
fi

"$PYTHON" scripts/deployment/write_frontend_env.py --stack-name "$API_STACK" --region "$REGION" --target hosted
(cd frontend && npm run build:hosted)

# Hashed bundles never change: cache for a year. Old bundles are kept so that browsers still
# holding the previous index.html can finish loading (S3 lifecycle removes old versions only).
aws s3 sync frontend/dist/assets "s3://$BUCKET/assets" --region "$REGION" \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors
# Everything else (index.html, theme-init.js, favicon) must be revalidated on every visit.
aws s3 sync frontend/dist "s3://$BUCKET" --region "$REGION" --exclude "assets/*" --delete \
  --cache-control "no-cache" --only-show-errors

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query 'Invalidation.[Id,Status]' --output text
echo "==> Done: $SITE_URL"
