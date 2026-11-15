#!/usr/bin/env bash
# Install everything needed for local development (no AWS account required).
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> Backend: Python virtual environment + dependencies"
python3 -m venv backend/.venv
backend/.venv/bin/pip install --quiet --upgrade pip
backend/.venv/bin/pip install --quiet -e 'backend[dev]'

echo "==> Frontend: npm dependencies"
(cd frontend && npm ci)

echo "==> Done. Next: 'make demo' (two terminals: 'make demo-backend' and 'make demo-frontend')."
