# Security policy

## Supported versions

Only the latest commit on `main` and the stack deployed from it are maintained.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it, and the impact you expect. You should receive a reply within a week.

This is a student project with a public demo deployment. Please do not run load tests, scanners or brute-force attempts against the public site or API; a reproduction against the Local Demo (`make demo-backend`) is preferred.

The threat model, the controls in place and the known limitations are documented in [`docs/security/SECURITY.md`](../docs/security/SECURITY.md).
