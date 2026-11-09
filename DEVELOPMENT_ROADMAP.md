# Development Roadmap

Each phase is reviewed by the project owner before the next begins. Every phase ends with the report required by `PROJECT_SPEC.md` section 13, and updates `PROGRESS.md`.

| Phase | Name | Status |
|---|---|---|
| 0 | Architecture and planning | Complete |
| 1 | Project foundation | Awaiting CI run on GitHub and review |
| 2 | Database and authentication | Not started |
| 3 | Question bank and dashboard | Not started |
| 4 | Interview simulator | Not started |
| 5 | Audio capture and transcription | Not started |
| 6 | AI evaluation | Not started |
| 7 | Production readiness | Not started |
| 8 | Post-MVP features | Not started |

## Phase 0 — Architecture and planning

**Acceptance criteria**
- All design documents exist and are consistent with the spec.
- Spec claims are checked against official documentation.
- Next.js with OpenNext builds and runs in the Workers runtime locally.
- No paid resources were provisioned.

## Phase 1 — Project foundation

**Owner needed:** a Cloudflare account, the OpenNext decision (D-003).

**Scope:** Next.js App Router, TypeScript, OpenNext, Node 24 pin, Wrangler configuration with staging, environment handling, Vitest, Playwright, structured logging, GitHub Actions, and `RUNBOOK.md`.

**Acceptance criteria**
- A fresh clone runs locally by following `RUNBOOK.md`.
- A pull request runs type checks, tests and a production build.
- A page and `/api/health` respond from a live Workers staging URL.
- CPU time per request is measured and recorded, informing D-004.
- A secret set in Cloudflare is readable on the server and absent from the browser bundle.

**Tests:** unit test setup, one Playwright smoke test against the Workers runtime.

## Phase 2 — Database and authentication

**Owner needed:** a Neon account, approval to create the Cognito development pool.

**Scope:** the schema's user tables, Drizzle migrations, Cognito pool with managed login, PKCE flow, cookies, JWT verification, profile routes, ownership helper, rate limiting approach, and account deletion.

**Acceptance criteria**
- A person can register, verify their email, sign in, reset a password, sign out and delete their account on staging.
- Tampered, expired, wrong-issuer, wrong-client and ID tokens are each rejected with `401`.
- A user cannot read another user's resource, confirmed by tests returning `404`.
- Account deletion removes the database user and the Cognito user.

**Tests:** JWT rejection cases, ownership checks, migrations on a fresh database, sign-in end to end.

## Phase 3 — Question bank and dashboard

**Owner needed:** who writes the questions and rubric.

**Scope:** dashboard, browse and filter, custom questions, admin question management, interview configuration, interview history, and seeded curated questions.

**Acceptance criteria**
- Filters by category, topic and difficulty return correct results.
- Custom questions are visible only to their owner.
- Only approved, active curated questions reach students.
- A student can configure every option in spec section 2.3.
- Editing a question does not change an existing session's snapshot.
- Loading questions makes no LLM calls.

**Tests:** selection logic, visibility rules, admin permissions.

## Phase 4 — Interview simulator

**Owner needed:** early finish, break placement in custom sessions, and language scope.

**Scope:** timeline calculation, session start and recovery, phase UI, break, transitions, progress, camera preview, permissions, audio-only mode, completion screen, consent. No AI.

**Acceptance criteria**
- A default mock runs through 8 stations and a 2-minute break with no input, on a simulated clock.
- Refreshing, switching tabs, sleeping and reconnecting all land in the correct phase with the correct time remaining.
- Denied camera access still allows audio practice. Denied microphone access offers the text fallback.
- The interview works with all AI services disabled.
- A disconnect longer than a phase marks the station `missed` without losing the session.

**Tests:** extensive timeline unit tests including boundaries and clock offset, Playwright with a mocked clock, manual run of a real 66-minute session.

## Phase 5 — Audio capture and transcription

**Owner needed:** Workers Paid if required, a $5 OpenAI credit purchase, approval for R2 and Queues resources.

**Scope:** MediaRecorder capture, format selection, IndexedDB buffering, R2 upload, Queues and dead-letter queues, processor Worker, `gpt-transcribe`, transcript review, retries, audio deletion and expiry, usage recording.

**Acceptance criteria**
- Audio from Chrome, Safari and Firefox, where supported, is transcribed on staging.
- A slow or failing upload never delays the timer.
- Audio is deleted after success, and expires after failure.
- Oversized or mismatched uploads are rejected.
- Duplicate queue delivery does not produce a duplicate transcript or charge.
- A permanent failure offers retry or typed entry, and the session survives.
- Transcripts can be edited, and the edit is recorded.
- Items marked unconfirmed in `DECISIONS.md` for transcription are resolved.

**Tests:** provider contract tests with a fake, idempotency, failure paths, accuracy against the spec's sample audio set.

## Phase 6 — AI evaluation

**Owner needed:** monthly AI budget, per-user limits, human reviewers.

**Scope:** `gpt-6-luna` through the Responses API, rubric and prompts, strict schema with Zod validation, station and report jobs, results page, usage and cost tracking, limits, pause control.

**Acceptance criteria**
- A completed mock produces 8 station evaluations and one report without the browser staying open.
- Malformed output is never saved, and retries stop at the limit.
- Repeat `evaluate` calls create no duplicate jobs or quota use.
- Reaching a limit or pausing makes no OpenAI call and shows a clear message.
- Recorded cost per mock matches OpenAI's usage data.
- Every evidence quote is found in the transcript, checked by code.
- The benchmark of 30 to 50 human-graded answers meets thresholds agreed before it runs.

**Tests:** schema validation, cost calculations, quota logic, evidence check, benchmark.

## Phase 7 — Production readiness

**Owner needed:** approval for each paid item, a domain, SES setup, privacy text review.

**Scope:** production environment, custom domain, SES for Cognito email, secrets, error and usage monitoring, billing alerts, Neon limits and backups, privacy disclosures, rate limit verification, security testing, and load testing.

**Acceptance criteria**
- Load test passes at the spec's targets: 100 simultaneous users and sessions, simultaneous uploads, 800 transcription jobs, 100 evaluation workflows, and recovery from provider throttling.
- Billing alerts are confirmed to fire.
- A database restore has been rehearsed.
- Disclosures accurately describe external processing and retention.
- The complete end-to-end test from spec section 12 passes on staging.

## Phase 8 — Post-MVP

Considered only after the MVP is stable: optional permanent recordings, private sharing, peer comments, AI question generation with review, additional formats, and advanced analytics.
