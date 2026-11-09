# Architecture

**Status:** design only. Nothing here is implemented yet. Update this file as each phase ships, so it describes what exists. Reasoning and evidence are in `DECISIONS.md`.

## System overview

```text
Browser (Next.js UI, camera preview, MediaRecorder)
   |  same-origin HTTPS, httpOnly cookies             | presigned PUT
   v                                                  v
Web Worker (Next.js via OpenNext)  --- signs URL ---> R2 (private temporary audio)
   |        |          |                              ^
   |        |          | sends job IDs                | reads and deletes
   |        |          v                              |
   |        |     Cloudflare Queues ----------> Processor Worker
   |        |     transcription + DLQ              |        |
   |        |     evaluation + DLQ                 |        v
   |        v                                      |     OpenAI
   |     Neon PostgreSQL <-------------------------+     gpt-transcribe
   v                                                     gpt-6-luna
AWS Cognito (managed login, JWKS)
```

## Components

| Component | Responsible for | Must not |
|---|---|---|
| Browser | UI, countdown display from server timestamps, camera preview, recording, direct R2 upload | Hold tokens, API keys or R2 credentials |
| Web Worker | Auth callback, token verification, ownership checks, session state, signing upload URLs, enqueueing jobs | Call OpenAI or wait for AI work |
| Processor Worker | Consuming queues, transcription, evaluation, usage recording, deleting audio | Serve user traffic |
| Neon | All durable application data | Store passwords or audio |
| R2 | Temporary audio only, in a private bucket | Be publicly readable |
| Queues | At-least-once delivery of identifiers and metadata | Carry audio or transcripts |
| Cognito | Identity, email verification, passwords, sessions | Hold application data |
| OpenAI | Transcription and evaluation behind provider interfaces | Be called with a fallback provider |

## Code layout

One package, two Worker configurations (D-002).

```text
src/app/                  Pages, layouts and Route Handlers
src/server/auth/          Token verification, current user, cookies
src/server/db/            Drizzle schema and client
src/server/questions/     Question queries and rules
src/server/interviews/    Session creation, station selection, persistence
src/server/audio/         Upload signing and verification
src/server/transcripts/   Transcript reading and editing
src/server/evaluation/    Job creation, rubric, prompts, Zod schemas
src/server/usage/         Limits and cost calculation
src/server/ai/            TranscriptionProvider, EvaluationProvider, OpenAI adapters
src/lib/interview-timeline/  Pure timeline and phase calculation, used on both sides
workers/processor/        Queue consumer entry point and handlers
drizzle/                  Generated migrations
```

**Boundaries**
- Route handlers parse input, call a `src/server` module and shape the response.
- `src/server/ai` knows nothing about interviews. Interview code never imports the OpenAI adapter directly.
- `src/lib/interview-timeline` has no I/O and is fully unit tested.

## Runtime rules

- Target the Workers runtime with `nodejs_compat`. Do not assume full Node.js APIs.
- Keep `cacheComponents` and `partialPrefetching` off (D-006). Do not use Node.js middleware (D-007).
- Use `aws4fetch` for R2 signing, `jose` for tokens, and `fetch` for OpenAI, which avoids additional SDKs.
- Memory is limited to 128 MB per isolate, so transcription handles only a few files of up to 25 MB at once.

## Environments

| Environment | App | Database | Auth | Storage and queues |
|---|---|---|---|---|
| Local | `next dev`, `wrangler dev` | Neon development branch | Development user pool | Local Wrangler simulation |
| Staging | Workers | Neon staging branch | Development user pool | Staging resources |
| Production | Workers, custom domain | Neon main | Production user pool | Production resources |

The AWS project allows one Region, `us-east-2`, so all Cognito resources go there. The Neon region is chosen in Phase 2.

**Secrets**, held in Cloudflare Worker secrets and an uncommitted `.dev.vars` file locally: `OPENAI_API_KEY`, `DATABASE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. A public-client Cognito app needs no client secret.

## Key flows

### Authentication
1. `/auth/login` creates PKCE and state values and redirects to Cognito managed login.
2. `/auth/callback` exchanges the code on the server and sets `httpOnly` cookies (D-018).
3. Every API request verifies the access token with `jose` against Cognito's JWKS, checking signature, `iss`, `exp`, `token_use = access`, `client_id` and required scopes.
4. The Cognito `sub` finds the `users` row, which is created on first login. A user ID sent by the client is never trusted.
5. Admin access comes from `users.role`.

Mutating routes also verify the `Origin` header.

### Interview timer
`POST /start` writes the complete timeline in one transaction (D-015). A default mock runs for 66 minutes: 8 stations of 8 minutes, plus a 2-minute break after station 4.

```text
phase = computePhase(timeline, now)
displayed remaining = phase.endsAt - (Date.now() + serverOffset)
```

The browser moves between phases on its own, recalculating on `visibilitychange` and on reconnect. It never waits for upload, transcription or AI work. Transitions need no server call, so simultaneous sessions add no timer load.

### Audio and transcription
1. The browser records only during the response window, at 48 kbps, preferring `audio/webm;codecs=opus` and falling back to `audio/mp4` using `MediaRecorder.isTypeSupported()`.
2. Chunks are kept in IndexedDB until upload is confirmed. Upload happens in the background while the next station proceeds.
3. `upload-url` checks ownership and timing, creates an `audio_assets` row, and returns a 15-minute presigned PUT with a signed content type.
4. `audio-complete` confirms the object's size and type (D-011), creates the job and sends `{ jobId }` to the queue.
5. The Processor loads the job, skips it if already finished, reads the audio through its R2 binding, and calls `gpt-transcribe` with MMI keyword hints.
6. It saves the transcript and usage, then deletes the audio.
7. Temporary failures retry with exponential backoff using `message.retry({ delaySeconds })`. After the limit, the message goes to the dead-letter queue, the job is marked failed, and the student can retry or type an answer.

### Evaluation
1. The student reviews transcripts and calls `POST /evaluate` (D-021).
2. The server checks limits and the pause switch, creates one job per station plus one report job, and enqueues the station jobs. A unique key per job prevents duplicates.
3. The Processor calls `gpt-6-luna` through the Responses API with `store: false`, `reasoning: { effort: "medium" }` and a strict `text.format` JSON schema. `temperature` is not sent.
4. Every response is validated with Zod. Invalid output retries up to the limit and is never saved. Every attempt is recorded in `ai_usage`.
5. The job that finishes last atomically claims the report job and enqueues it.
6. The report uses station evaluations and is saved. The frontend polls `GET /results` while the page is open, and the student can close the browser and return.

If evaluation is paused or over budget, the interview still runs and transcripts are kept.

### Account deletion
1. Mark the user as deleting, and stop new jobs for them.
2. Delete their R2 objects.
3. Delete their database rows through cascades. `ai_usage` rows are anonymized (D-010).
4. Call Cognito `DeleteUser` with the user's token (D-019), then clear cookies.

Each step is safe to repeat, so a partial failure can be retried.

## Reliability and capacity

| Concern | Design |
|---|---|
| Duplicate queue delivery | Unique job key, status check before work, unique result rows |
| OpenAI rate limits | Configured `max_concurrency` and backoff on 429. No fallback provider |
| Database connections | Stateless HTTP queries, pooled host where a connection is required |
| Upload bursts | Browsers upload straight to R2, bypassing the Web Worker |
| Scale-to-zero | Neon resumes in typically a few hundred milliseconds, and the UI tolerates this |

100-user capacity is a target, not a claim, until the Phase 7 load test passes.

## Security and privacy

- All input is validated with Zod. Every user-owned resource is checked against the authenticated user, and other users' resources return `404`.
- API keys exist only in Worker secrets. The R2 bucket is private, and its CORS policy allows only `PUT` from application origins.
- Logs contain IDs, statuses and error codes, never transcripts or answers.
- Consent is recorded before recording begins. The privacy text covers external processing, retention and the educational nature of the feedback.
- Student-facing text makes no promise of Canadian processing or zero retention (D-020).
- Rate limits apply to sensitive routes. The mechanism is confirmed in Phase 2, without adding Redis.

## Expected cost

Prices were confirmed on November 8, 2026 and can change.

**Per full mock:** transcription is $0.216. The spec's illustrative token count adds $0.0036, for $0.2196. If tokens are five times higher, the total is about $0.234. Real usage will be recorded.

**Queues:** a full mock sends 17 messages, about 51 operations, so 1 million included operations covers roughly 19,600 mocks.

| Stage | Expected monthly infrastructure cost |
|---|---|
| Phases 1–4 | $0 if the Free plan holds up, else $5 for Workers Paid |
| Phases 5–6 | $5, plus small AI test usage and a one-time $5 OpenAI credit purchase |
| Production | About $5 plus Neon usage, within the $50 target, plus domain and AI usage |
