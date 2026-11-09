# Progress

## Current state

Phase 1 (project foundation) is deployed to staging. It still needs its CI workflow to run on GitHub, and the project owner's review.

**Staging:** https://practicemmi-staging.practicemmi.workers.dev

## Completed

### Phase 1, November 8, 2026
- Next.js 16.4.5 on Cloudflare Workers through OpenNext, with a staging environment on the Free plan.
- `/api/health`, validated environment configuration, and structured logging that redacts sensitive fields.
- Vitest, Playwright against the local Workers runtime, and a GitHub Actions workflow.
- `RUNBOOK.md`.

**Verified**

| Check | Result |
|---|---|
| Type checks | Passed |
| Unit tests | 16 passed |
| Browser tests on local Workers runtime | 3 passed |
| Live staging page, `/api/health`, 404 handling | Passed |
| Secret readable on the server | Passed |
| Secret absent from browser assets | Passed |
| CPU time per request | Recorded in D-004 |

**Not verified:** the GitHub Actions workflow has not run, because the branch has not been pushed.

**Known limitations**
- `npm audit` reports 4 high and 1 moderate issue in `glob` and `minimatch`, pulled in by OpenNext. npm's only automatic fix downgrades OpenNext to 0.3.0, so it was not applied. Whether any of this code reaches the deployed Worker has not been confirmed. Recheck before Phase 7.
- Rendered pages often exceed the Free plan's published 10 ms CPU limit. See D-004.

**Cost:** $0.

### Phase 0, November 8, 2026
- Added `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `API_SPECIFICATION.md`, `DEVELOPMENT_ROADMAP.md`, `DECISIONS.md` and this file.
- Checked the spec against official OpenAI, Cloudflare, Neon and AWS documentation.
- Built and ran a throwaway Next.js and OpenNext app in the local Workers runtime. Results are in `DECISIONS.md`.

## Next steps

1. Push the branches so CI can run.
2. Owner reviews Phase 1.
3. Phase 2 needs a Neon account and approval to create the Cognito development user pool.
