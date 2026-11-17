#!/usr/bin/env bash
# Install everything needed for local development (no AWS account required).
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> Backend: Python virtual environment + dependencies"
# Python 3.13 is required. On Windows (Git Bash) the launcher is 'py' and the venv uses Scripts/.
if command -v py >/dev/null 2>&1; then PYTHON=(py -3.13); else PYTHON=(python3); fi
"${PYTHON[@]}" -m venv backend/.venv
VENV_PY=backend/.venv/bin/python
[ -x "$VENV_PY" ] || VENV_PY=backend/.venv/Scripts/python.exe
"$VENV_PY" -m pip install --quiet --upgrade pip
"$VENV_PY" -m pip install --quiet -e 'backend[dev]'

echo "==> Frontend: npm dependencies"
(cd frontend && npm ci)

echo "==> Done. Next: 'make demo' (two terminals: 'make demo-backend' and 'make demo-frontend')."
