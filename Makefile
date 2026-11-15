# Serverless Notes - common developer commands. Run `make help`.
SHELL := /bin/bash
PY := backend/.venv/bin
STACK ?= serverless-notes-dev

.PHONY: help setup demo-backend demo-frontend lint typecheck test test-backend test-frontend \
        test-e2e build validate audit check benchmark-local deploy frontend-env live-test destroy

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

setup: ## Install backend + frontend dependencies
	./scripts/setup/setup.sh

demo-backend: ## Terminal 1: Local Demo backend on :8787 (real handlers, in-memory DynamoDB)
	cd backend && PYTHONPATH=src .venv/bin/python -m local_demo.server --port 8787 --seed

demo-frontend: ## Terminal 2: frontend in Local Demo mode on :5173
	cd frontend && npm run dev

lint: ## Ruff (lint + format check) and ESLint
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd frontend && npm run lint

typecheck: ## mypy (strict) and tsc
	cd backend && .venv/bin/mypy
	cd frontend && npm run typecheck

test-backend: ## Backend unit + integration + security tests with coverage
	cd backend && .venv/bin/pytest --cov --cov-report=term-missing

test-frontend: ## Frontend unit/component tests
	cd frontend && npm test

test-e2e: ## Browser end-to-end tests (starts Local Demo backend + Vite automatically)
	cd frontend && npm run test:e2e -- --trace off

test: test-backend test-frontend ## All fast tests

build: ## Production build of the frontend
	cd frontend && npm run build

validate: ## Validate the SAM/CloudFormation template (needs cfn-lint + SAM CLI)
	cfn-lint infrastructure/template.yaml
	sam validate --lint --region eu-central-1 -t infrastructure/template.yaml

audit: ## Dependency vulnerability scans
	cd backend && .venv/bin/pip-audit
	cd frontend && npm audit --omit=dev

check: lint typecheck test build ## Everything CI runs except e2e and template validation

benchmark-local: ## Latency benchmark against the running Local Demo backend (not AWS numbers!)
	$(PY)/python scripts/testing/benchmark.py --base-url http://127.0.0.1:8787 --demo-user alice --label local-demo

deploy: ## Deploy to AWS (asks for change-set confirmation)
	./scripts/deployment/deploy.sh

frontend-env: ## Write frontend/.env.aws from the stack outputs
	$(PY)/python scripts/deployment/write_frontend_env.py --stack-name $(STACK)

live-test: ## Acceptance + security tests against the deployed stack
	$(PY)/python scripts/testing/live_api_tests.py --stack-name $(STACK)

destroy: ## Delete the AWS stack (asks for confirmation)
	./scripts/cleanup/destroy.sh $(STACK)
