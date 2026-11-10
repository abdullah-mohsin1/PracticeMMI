# Decisions

Architectural decisions and their reasoning. `PROJECT_SPEC.md` is the source of truth. These entries record what the spec chose, where it was silent, and what Phase 0 found when checking it. A decision that would change the spec needs the project owner's approval.

**Status values:** *Spec* (set by the spec), *Proposed* (made in Phase 0, reviewed at the end of the phase), *Open* (needs the owner).

## Phase 0 verification

Checked on November 8, 2026 against official documentation, except where noted.

### Compatibility test

A throwaway app, not kept in this repository, was built with Next.js 16.4.5, React 19.3.0, `@opennextjs/cloudflare` 1.20.16 and Wrangler 4.158.0, on Node 24. It ran in the local Workers runtime (`wrangler dev`). Nothing was deployed.

| Check | Result |
|---|---|
| OpenNext build | Passed |
| Bundle size | 5.19 MB raw, 1.10 MB gzip, against a 64 MiB limit |
| Rendered page and 404 handling | Passed with `cacheComponents` and `partialPrefetching` off |
| Same page with those two options on | **Failed:** the Worker hung and returned a 500 |
| Route handler using `jose` (RS256 sign and verify) | Passed |
| Route handler constructing Drizzle with the Neon HTTP driver | Passed. No database query was sent |
| `aws4fetch` presigned R2 PUT URL generation | Passed. The URL was not used against real R2 |
| Zod 4 parsing | Passed |

Not tested: a real Cloudflare deployment (Phase 1), CPU time per request, Worker startup time, and real Neon, R2, Queues, Cognito or OpenAI calls.

### Spec claims

| Claim | Result |
|---|---|
| `gpt-6-luna`, $0.10 / $0.50 per million tokens, Responses API, medium effort, Structured Outputs | Confirmed |
| `gpt-transcribe`, `/v1/audio/transcriptions`, $0.0045 per minute, 25 MB limit, WebM and MP4 accepted, keyword hints | Confirmed |
| `gpt-4o-mini-transcribe` shutdown on February 26, 2027 | Confirmed |
| OpenAI training default, 30-day abuse monitoring on Responses, Zero Data Retention and Modified Abuse Monitoring need approval | Confirmed |
| Workers Paid at $5, 10M requests, 30M CPU ms | Confirmed |
| Queues at 1M operations on Paid; R2 allowances | Confirmed |
| Neon Free 100 CU-hours and 1 GB; Launch $0.106 per CU-hour, no minimum | Confirmed |
| Cognito Lite and Essentials 10,000 free monthly active users | Confirmed |
| OpenNext is the way to deploy Next.js on Workers | **Changed:** see D-003 |

### Facts the spec does not mention

| Finding | Effect |
|---|---|
| Free and Paid Workers both allow 64 MiB. Free allows 10 ms of CPU per invocation | CPU time, not bundle size, decides when Workers Paid is needed. See D-004 |
| Queues is on the Free plan: 10,000 operations per day, 24-hour retention | Early development may not need Paid |
| Presigned R2 URLs can lock content type but not size | Size is checked after upload. See D-011 |
| R2 lifecycle expiry is expressed in days, and removal is typically within 24 hours of expiry | See D-012 |
| Neon's HTTP driver has no interactive transactions | See D-009 |
| Cognito's default email sender is limited to about 50 emails per day (read from a summarised part of the AWS page; confirm in Phase 2) | SES is required before launch. See D-016 |
| OpenAI's Canadian option stores data in Canada but does not process it there, and requires approved abuse-monitoring controls | See D-020 |
| The transcription abuse-log table lists retention as "None"; Responses lists 30 days | Disclosures must describe the two services separately |
| OpenAI's Build tier needs $5 of credit purchases and allows 5,000 requests per minute for both models. Free-tier access to them is not confirmed | Phase 5 needs a $5 purchase |
| The AWS project is on the Free plan with $100 credit, and the plan expires on May 9, 2027 | See D-017 |
| Wrangler needs Node 22 or later. This Mac defaults to Node 20 | See D-005 |

### Not confirmed

- Which `usage` variant `gpt-transcribe` returns (duration or tokens). The reference allows both.
- The Responses API field name for reasoning tokens.
- Which `response_format` values `gpt-transcribe` accepts, and any maximum audio duration or prompt length.
- OpenAI model-level eligibility for Canadian residency or Zero Data Retention.
- Whether Cognito Lite includes managed login. The AWS pricing page is inconsistent.
- Whether a Queues consumer on the Free plan is limited to 10 ms of CPU. Cloudflare's pages also disagree on the Paid consumer CPU limit (5 or 15 minutes).

## Hosting and structure

### D-001: Use the selected stack — *Spec*
Next.js with Route Handlers on Cloudflare Workers through OpenNext, a separate Worker for queues, Neon with Drizzle, Cognito, R2, Queues and OpenAI. Excluded by the spec: Supabase, Vercel Pro, NestJS, EC2, RDS, Lambda, SQS and self-hosted models.

### D-002: Use one package with two Worker configurations — *Proposed*
The web app and queue consumer share one `package.json`, with `src/` for shared code and `workers/processor/` for the consumer entry point.
**Why:** both need the same schema and validation code, and a workspace setup adds tooling without a current need. **Trade-off:** the consumer's bundle must avoid importing web-only code, which the module boundaries in `ARCHITECTURE.md` enforce.

### D-003: Stay on OpenNext although Cloudflare now recommends vinext — *Decided by owner, November 8, 2026*
Cloudflare's guide recommends vinext for new Next.js apps and describes OpenNext as the path for existing apps. vinext is still in beta. The spec requires OpenNext and forbids vinext in production without approval. OpenNext builds and runs in the compatibility test, and it avoids depending on a beta. Revisit once vinext leaves beta.

### D-004: Deploy staging on the Workers Free plan first, then measure — *Proposed*
The spec budgets for Workers Paid but also forbids paid resources without approval. Phase 1 deploys to Free and records CPU time per request. Paid is requested from the owner only when measurements or queue needs justify it, and is expected by Phase 5.

**Measured on staging, November 8, 2026** (`wrangler tail`, Free plan, about 20 requests per route):

| Route | Median CPU | Maximum CPU | Over 10 ms | Failures |
|---|---|---|---|---|
| `/` | 12 ms | 27 ms | 10 of 20 | 0 |
| `/api/health` | 4 ms | 8 ms | 0 of 21 | 0 |
| Not-found page | 20 ms | 38 ms | 16 of 20 | 0 |

Cloudflare analytics over 96 requests showed a 99th percentile of 246 ms, which is likely cold starts. Cloudflare did not reject any request, but rendered pages already often exceed the published 10 ms limit before any database or token work. Staging can stay on Free for now. Workers Paid should be expected before real users, and may be needed earlier if requests start failing.

### D-005: Use Node 24 for development — *Proposed*
Wrangler requires Node 22 or later. Node 24 is pinned with `.nvmrc` in Phase 1. It is already installed through `nvm`, and the machine's default stays on Node 20.

### D-006: Turn off Cache Components and Partial Prefetching — *Proposed*
`create-next-app` now enables both. With them on, the page hung in the Workers runtime. Almost every page here is per-user and dynamic, so they offer little benefit.
**Revisit:** only with a passing test on the Workers runtime.

### D-007: Avoid Node.js middleware and Next.js image optimization — *Proposed*
OpenNext does not support Node.js middleware, and image optimization would add a Cloudflare Images dependency. Authentication and ownership are enforced in route handlers.

## Data

### D-008: Add to the spec's schema — *Proposed*
The spec allows additional tables where necessary. `DATABASE_DESIGN.md` lists every addition, including deadline fields, question review status, job tracking, usage limits and consent records. It replaces the single `topic` column with a `topics` array because the spec's requirements call for topic tags.

### D-009: Use the Neon HTTP driver by default — *Proposed*
Each query is a stateless `fetch`, so simultaneous requests do not hold database connections. Multi-statement atomic writes use non-interactive `sql.transaction([...])`. WebSocket `Pool` use is reserved for true interactive transactions and must open and close within one request. Migrations run from CI or a developer machine, not from Workers.

### D-010: Keep AI cost records after account deletion, without identity — *Proposed*
`ai_usage.user_id`, `session_id` and `station_id` are set to null on deletion. Only provider, model, counts and cost remain, which keeps monthly totals accurate without retaining personal data.

## Audio

### D-011: Check upload size after upload — *Proposed*
R2 presigned URLs cannot limit size. `audio-complete` reads the stored object's size, then rejects and deletes it if it exceeds 25 MB or differs from what was declared. Content type is locked by signing it. Upload URLs last 15 minutes.

### D-012: Delete audio in the app, with a lifecycle rule as backstop — *Proposed*
The Worker deletes audio immediately after a successful transcription. A two-day R2 lifecycle rule on the temporary prefix handles everything else. Because R2 removal is typically within 24 hours of expiry, audio from failed jobs may last up to about three days, and the privacy text must say so.

### D-013: Record at 48 kbps — *Proposed*
Six minutes is about 2.2 MB, well under the 25 MB limit. Finished chunks are saved in IndexedDB until the upload is confirmed, so a refresh does not lose them. Phase 5 tests speech accuracy at this bitrate.

### D-014: Measure audio cost from the provider, falling back to recorded duration — *Proposed*
If `gpt-transcribe` returns `usage.seconds`, that value is stored. Otherwise the recorded duration is used and the row is marked as estimated. Phase 5 confirms which case applies.

## Interview

### D-015: Fix the whole interview timeline at start — *Proposed*
`POST /start` computes and stores every deadline. The current phase is a pure function of the stored timeline and the time, and the browser corrects for clock difference using `serverNow`.
**Why:** this meets every timer requirement. Refreshing or sleeping cannot extend a station, and transitions cost no server calls. It also removes the need for the transition routes that Phase 0 initially expected to add.
**Consequence:** a long disconnect does not pause the interview, as in a real MMI. A station missed during a disconnect is marked `missed`, and the student can type an answer afterwards.

## Authentication

### D-016: Send Cognito email through SES before launch — *Proposed*
The default sender cannot support a launch. Phase 7 sets up SES in the project's Region and requests removal from the SES sandbox. SES is on the AWS Free plan's supported list.

### D-017: The AWS project must be kept active past May 9, 2027 — *Open*
Authentication depends on this project. The owner needs to review what happens at plan expiry and upgrade before that date if required. Cognito's free allowance is not tied to the 12-month period, so upgrading should not add Cognito charges below 10,000 users.

### D-018: Keep tokens in httpOnly cookies set by the server — *Proposed*
The authorization-code-with-PKCE exchange happens in a route handler, and access and refresh tokens are stored in `httpOnly`, `Secure`, `SameSite=Lax` cookies. Browser JavaScript never sees a token, and the API is same-origin, so it needs no CORS headers. Mutating routes also check the `Origin` header.

### D-019: Delete the Cognito user with the user's own token — *Proposed*
Requesting the `aws.cognito.signin.user.admin` scope lets the server call Cognito's `DeleteUser` as that user, so Cloudflare holds no long-lived AWS credentials. **Trade-off:** the token can also change that user's own attributes, which is limited because it is never exposed to browser code.

## AI

### D-020: Make no Canadian data-location claims at launch — *Spec-derived, Proposed*
Canadian processing is not offered, and Canadian storage requires approval from OpenAI. Disclosures will state that AI processing may occur outside Canada. All OpenAI calls use the standard endpoint unless the owner later obtains approval.

### D-021: Start evaluation only when the student submits reviewed transcripts — *Proposed*
The spec requires transcript review before evaluation, so `POST /evaluate` is the student's explicit confirmation. It is idempotent. Results are retrieved by polling, which needs no WebSocket infrastructure and works if the browser is closed and reopened.

### D-022: Count usage per interview, not per attempt — *Proposed*
Quotas reserve one evaluation per session, so retries and duplicates do not consume more. `ai_usage` still records every attempt, because every attempt costs money.

### D-023: Serve budget limits from the database — *Proposed*
A single `app_settings` row holds the pause switch, monthly AI budget and per-user limits, checked before each OpenAI call. Changing a limit needs no deployment. Transcription is about 98% of the estimated AI cost per mock, so the limits are built around audio minutes as well as evaluations.

## Scope change, November 9, 2026

### D-028: Build a static, browser-only practice tool for 2–3 friends — *Owner direction*
The project owner finalized a smaller scope: a static-compatible Next.js app with no backend, no AI providers and no AI feedback. Recordings stay in the browser. Firebase, owned by Terminal 1, replaces Neon and Cognito for the question bank and sign-in. This supersedes the Cloudflare Workers, OpenNext, Neon, Cognito, R2 and AI decisions above for this branch. `PROJECT_SPEC.md`, `ARCHITECTURE.md` and the other planning documents still describe the old product, and need the owner's decision on whether to rewrite or retire them.

### D-029: Store recordings as chunks in IndexedDB — *Accepted*
Each station's MediaRecorder writes a chunk to IndexedDB every two seconds, so a crash loses seconds and not an answer. Requesting a keyframe every two seconds is required, because Chrome's MP4 writer otherwise held back all data (a 9-second recording left a 1,243-byte file). MP4 is preferred where the browser can write it, because QuickTime can open it. WebM is the fallback.

### D-030: Treat browser speech recognition as best-effort — *Accepted*
Timing and recording never depend on it. The device check says that Chrome, Edge and Safari can send microphone audio to Google or Apple, and offers an off switch, because this is the one path by which audio can leave the browser. On-device recognition is used when the browser already has it.

### D-031: Each station is eight minutes of answering, with no preparation phase — *Owner direction*
The setup screen no longer offers preparation time. Speaking time defaults to 8 minutes and can still be shortened for a quick run. The practice screen is always white, gives the camera the wider column and shows the question in a box.

## Open items

| ID | Decision | Needed by |
|---|---|---|
| — | Approve creating Cloudflare, Neon and Cognito development resources | Phases 1–2 |
| D-017 | AWS project after May 9, 2027 | Before that date |
| — | Author of the question bank and rubric | Phase 3 |
| — | Early finish, break placement in custom sessions, English only | Phase 4 |
| — | $5 OpenAI credit purchase | Phase 5 |
| — | Monthly AI budget and per-user limits | Phase 6 |
| — | Human reviewers for the AI benchmark | Phase 6 |
