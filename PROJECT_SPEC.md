# MMI Platform — Complete Project Specification

**Document status:** Updated November 8, 2026  
**Purpose:** Master source of truth for product requirements, technical architecture, development, and deployment.

---

# 1. Project Overview

## 1.1 Product

We are building a Canadian-focused Multiple Mini Interview (MMI) preparation platform for prospective medical school applicants.

The platform allows students to:

- Practise realistic MMI interviews.
- Access a curated bank of Canadian MMI questions.
- Complete timed mock interviews.
- Record spoken answers for transcription.
- Receive detailed AI-generated feedback.
- Review their interview history and progress.
- Practise with their own custom questions.

The goal is to create an accessible, affordable, realistic MMI preparation experience.

The initial platform should be free for students. Payment processing and monetization are not part of the initial MVP.

## 1.2 Target users

Primary users:
- Canadian medical school applicants.
- Undergraduate students preparing for medical school interviews.
- Students who want to practise ethical, personal, and policy-based interview questions.

## 1.3 Expected usage

Design for:
- 50–100 simultaneous active users.
- Multiple simultaneous interview sessions.
- Bursts of transcription and AI evaluation requests.
- Growth beyond the initial user base without requiring architectural replacement.

These are design targets, not verified capacity claims. Actual capacity must be demonstrated through load testing.

## 1.4 Development constraints

The project is being developed by a student with limited financial resources.

The developer has:
- An everyday MacBook.
- No dedicated server.
- No dedicated GPU.
- No production compute infrastructure.
- A maximum target infrastructure budget of approximately $50 USD/month once users arrive.

Requirements:
- Develop locally on the MacBook.
- Use managed cloud infrastructure.
- Use hosted AI APIs.
- Do not self-host AI models.
- Do not require the developer's computer to remain running.
- Avoid unnecessary paid infrastructure.
- Track AI costs separately from hosting costs.
- Never provision paid infrastructure without approval.

---

# 2. Core Product Features

## 2.1 User accounts

Users must be able to:

- Register using email.
- Verify their email address.
- Sign in and sign out.
- Reset their password.
- Maintain a personal profile.
- Access their interview history.
- View previous interview feedback.
- Delete their account and associated data.

Authentication must be managed through AWS Cognito.

Passwords must never be stored in our PostgreSQL database.

## 2.2 Question bank

The application will have a built-in MMI question bank.

Three primary categories:

1. Ethical
2. Personal
3. Policy

Questions should also support:
- Topic tags.
- Difficulty levels.
- Optional follow-up questions.
- Question descriptions or context.
- Active/inactive status.

Users must be able to:

- Browse questions.
- Filter by category.
- Filter by topic.
- Select individual questions.
- Randomize questions.
- Create private custom questions.
- Include their custom questions in mock interviews.

Questions must be stored in PostgreSQL.

Do not call an LLM every time a user requests a question. The standard question bank should be curated and pre-populated.

An administrative mechanism should allow authorized administrators to add, edit, approve, and remove questions.

AI-generated question creation is a later feature. Generated questions must be reviewed before entering the permanent question bank.

## 2.3 Interview configuration

Users must be able to choose:

- Full mock interview.
- Custom number of stations.
- Individual questions.
- Question categories.
- Randomized questions.
- Their own custom questions.

Default full mock:

| Setting | Default |
|---|---|
| Stations | 8 |
| Preparation | 2 minutes |
| Spoken response | 6 minutes |
| Total per station | 8 minutes |
| Midway break | 2 minutes |
| Break location | After station 4 |

These settings should be configurable internally so that interview formats can be changed later.

## 2.4 Interview simulator

The interview simulator is the central product feature.

It should provide:

- Clean, distraction-free interview interface.
- Current station number.
- Question display.
- Preparation countdown.
- Response countdown.
- Progress indicator.
- Camera preview.
- Microphone access.
- Automatic transition from preparation to response.
- Automatic transition between stations.
- Midway break.
- Completion screen.

The interview must feel like a realistic MMI.

### Timer requirements

The timer must not depend exclusively on a browser interval.

Use server-persisted timestamps for station start times and deadlines.

The frontend should calculate the displayed countdown using those timestamps.

This ensures:
- Refreshing the page does not reset the timer.
- Switching tabs does not reset the timer.
- Browser sleep does not incorrectly extend a station.
- Interview progress can be recovered after a temporary connection failure.

The interview timer must never wait for transcription or AI processing.

### Camera and microphone

- Request camera and microphone permissions before starting.
- Display camera preview where supported.
- Capture audio during the spoken response.
- Do not permanently record video in the MVP.
- Do not require camera access if the user only wants audio practice.
- Provide a manual text-response fallback if microphone access is unavailable.

Audio is captured specifically for transcription. It is not automatically a permanently saved recording.

---

# 3. AI Architecture

AI is responsible for two separate tasks:

1. Speech-to-text transcription.
2. Reasoning, answer evaluation, and feedback.

These must remain separate services.

## 3.1 Reasoning and feedback model

**Selected provider:** OpenAI

**Selected model:** GPT-6 Luna

**Exact API model ID:** `gpt-6-luna`

**API:** OpenAI Responses API

**Reasoning effort:** Medium

Use the model for:
- Evaluating individual MMI answers.
- Identifying strengths.
- Identifying weaknesses.
- Assessing ethical reasoning.
- Identifying missing perspectives.
- Assessing communication and organization.
- Generating actionable improvements.
- Producing an overall interview report.

GPT-6 Luna is selected because it is designed for cost-sensitive, high-volume workloads.

Published standard pricing:
- Input: $0.10 per million tokens.
- Output: $0.50 per million tokens.

Actual cost must be measured using API usage data. Reasoning tokens also contribute to output usage.

Official documentation:
https://developers.openai.com/api/docs/models

### Evaluation rubric

Every answer should be evaluated consistently.

Use these criteria:

1. Understanding of the question.
2. Relevance of the response.
3. Quality of reasoning.
4. Ethical awareness.
5. Recognition of stakeholders.
6. Consideration of alternative perspectives.
7. Empathy and communication.
8. Organization and clarity.
9. Practical recommendations and conclusions.

The model should provide:

- A brief overall assessment.
- Specific strengths.
- Specific weaknesses.
- Missing considerations.
- Actionable improvements.
- Evidence from the student's actual transcript.
- Optional rubric-based ratings.

Do not provide generic feedback.

For example, instead of saying:

"You should consider other perspectives."

The AI should explain which perspective was missing and why considering it would improve the answer.

Do not fabricate evidence or claim the student said something that is absent from their transcript.

If the transcript is incomplete or unclear, the model must acknowledge that limitation.

Scores must be educational feedback, not official medical school admissions scores or predictions of acceptance.

### Evaluation workflow

The user completes the entire mock interview before receiving feedback.

The backend should:

1. Retrieve all completed station transcripts.
2. Evaluate each station individually.
3. Save each station's structured evaluation.
4. Generate an overall interview summary using the station evaluations.
5. Save the completed report.
6. Notify the frontend that results are ready.

This produces eight individual station evaluations and one overall report for a standard eight-station mock.

Evaluations should run asynchronously.

The user must not have to keep the browser open while evaluations are running.

### Structured output

Use structured JSON output with a defined schema.

Validate every response on the backend using Zod or an equivalent validation library.

Do not trust raw model output.

If a response fails validation:
- Retry a limited number of times.
- Record the error.
- Do not save malformed feedback.
- Do not charge the user for duplicate successful evaluations.

### AI provider abstraction

Keep the AI provider independent from the application logic.

Implement an interface so that a different model can be introduced without rewriting the interview system.

However, GPT-6 Luna is the production default.

Do not automatically switch to another paid provider.

---

# 4. Speech-to-Text Architecture

## 4.1 Selected provider

**Provider:** OpenAI

**Model:** GPT Transcribe

**Exact model ID:** `gpt-transcribe`

**Endpoint:** `/v1/audio/transcriptions`

**Purpose:** Convert completed station audio into text.

Published price:
- $0.0045 per minute.

A full eight-station interview has 48 minutes of speaking time.

Estimated transcription cost:
- One station: $0.027.
- One full mock: $0.216.
- 100 full mocks: $21.60.
- 500 full mocks: $108.

Use the current GPT Transcribe model for new development.

Do not implement the deprecated `gpt-4o-mini-transcribe` model as the production default, even though its historical pricing is lower. It is scheduled for shutdown on February 26, 2027.

Official documentation:
https://developers.openai.com/api/docs/guides/speech-to-text

## 4.2 Audio capture

Use the browser's MediaRecorder API.

During each six-minute spoken response:

1. Request microphone access.
2. Record audio only.
3. Capture the complete response.
4. Stop recording when the response ends.
5. Upload the audio for transcription.

Use browser-supported audio formats.

Prefer WebM/Opus where supported, with a compatible fallback such as MP4 where available.

Check supported formats using `MediaRecorder.isTypeSupported()`.

Keep audio files below OpenAI's 25 MB upload limit.

A six-minute recording at a reasonable compressed audio bitrate should remain comfortably below this limit.

## 4.3 Transcription flow

The transcription pipeline must be asynchronous.

1. Student completes a station.
2. Browser uploads audio to private Cloudflare R2 storage using a temporary signed URL.
3. Frontend informs the backend that the upload is complete.
4. Backend verifies ownership and upload metadata.
5. Backend adds a small transcription job to Cloudflare Queues.
6. A background Worker retrieves the audio from R2.
7. Worker sends the file to OpenAI GPT Transcribe.
8. OpenAI returns the transcript.
9. Worker saves the transcript in PostgreSQL.
10. Temporary audio is deleted after successful processing.

Queue messages should contain identifiers and metadata only.

Never place the actual audio file or a large transcript inside a queue message.

Use relevant MMI terminology as transcription context or keyword hints where supported.

## 4.4 Transcript review

Before AI evaluation, allow users to review and correct transcription errors.

This is important because an inaccurate transcript could cause the AI to unfairly evaluate an otherwise good answer.

Store whether a transcript has been edited.

The original transcript and corrected transcript may be tracked for debugging, but retention must follow the privacy policy.

## 4.5 Failure handling

Handle:
- Microphone permission failures.
- Unsupported recording formats.
- Upload failures.
- Transcription API errors.
- Rate limits.
- Timeouts.
- Incomplete recordings.

Implement retries with exponential backoff.

If transcription fails permanently, allow the user to retry or manually enter their answer.

Do not lose completed interview sessions because one transcription job failed.

## 4.6 Audio retention

Audio should be temporarily stored only for transcription.

Delete it after successful processing.

If processing fails, retain it temporarily for retries, with automatic expiration.

Permanent recording storage is not part of the initial MVP.

---

# 5. Technical Architecture

## 5.1 Frontend

**Technology:**
- Next.js
- React
- TypeScript

Use the Next.js App Router.

The frontend must be responsive and usable on desktop and mobile browsers.

## 5.2 Hosting and application runtime

**Provider:** Cloudflare

Use Cloudflare Workers to host the Next.js application.

Use the Cloudflare OpenNext adapter to deploy the existing Next.js architecture.

Do not use Vercel Pro.

Do not use GitHub Pages as the production host.

GitHub remains the source-code repository and version-control platform.

Cloudflare handles:
- Application deployment.
- Frontend delivery.
- Server-side application execution.
- Next.js route handlers.
- API endpoints.
- Custom domains.
- Serverless execution.

Important: Cloudflare's newer vinext approach is currently in beta. Do not introduce it into production without explicit approval and compatibility testing.

Validate the OpenNext deployment early, before building the entire product.

Official documentation:
https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/

## 5.3 Backend

Do not build a separate NestJS server initially.

Use Next.js Route Handlers for application API functionality, deployed through Cloudflare Workers.

Use a separate Cloudflare Worker for background queue processing.

This keeps the architecture relatively simple while allowing background workloads to scale independently.

Backend responsibilities:

- Authentication verification.
- User profiles.
- Question management.
- Interview management.
- Session state.
- Audio upload authorization.
- Transcription job creation.
- AI evaluation job creation.
- Results retrieval.
- Usage tracking.
- Data deletion.

Use TypeScript throughout.

Use Cloudflare-compatible libraries and APIs.

Do not assume the full Node.js runtime is available in Cloudflare Workers.

## 5.4 Database

**Provider:** Neon

**Database:** PostgreSQL

**ORM:** Drizzle ORM

Why:
- Managed PostgreSQL.
- No database server to maintain.
- Usage-based compute.
- Scale-to-zero capabilities.
- Suitable for structured application data.
- Independent of Supabase.

Use Neon serverless connectivity and connection pooling.

Do not create hundreds of direct database connections from simultaneous requests.

Use Drizzle migrations.

Official documentation:
https://neon.com/docs
https://neon.com/pricing

## 5.5 Authentication

**Provider:** AWS Cognito

Use Cognito User Pools.

Required functionality:
- Registration.
- Email verification.
- Login.
- Logout.
- Password resets.
- Access tokens.
- Refresh tokens.
- User identity.

Use the lowest suitable Cognito pricing tier.

The qualifying Lite and Essentials tiers currently provide a free allowance of 10,000 monthly active users for direct/social sign-ins.

Do not use AWS Identity Pools initially.

Frontend authentication should use a supported Cognito authentication flow, preferably OAuth Authorization Code with PKCE.

The backend must independently verify authentication tokens.

Use a Cloudflare-compatible JWT verification library such as `jose`, with Cognito's JWKS.

Validate:
- Token signature.
- Issuer.
- Expiration.
- Token type.
- App client ID or applicable claims.
- Required scopes.

Use the authenticated Cognito `sub` as the trusted user identifier.

Never trust a user ID supplied by the frontend.

## 5.6 File storage

**Provider:** Cloudflare R2

Use private buckets.

Store:
- Temporary station audio.
- Optional future interview recordings.
- Other uploaded files if required.

Use temporary signed URLs.

Do not expose R2 credentials to the frontend.

The initial application should delete temporary audio after successful transcription.

Official documentation:
https://developers.cloudflare.com/r2/

## 5.7 Background processing

**Provider:** Cloudflare Queues

Use separate queues for:

1. Transcription jobs.
2. Interview evaluation jobs.

The API produces messages.

A separate Cloudflare Worker consumes messages.

Implement:
- Configurable maximum concurrency.
- Retries.
- Exponential backoff.
- Dead-letter queues.
- Idempotency.
- Job status tracking.
- Failure reporting.

Concurrency must be configured based on actual OpenAI API rate limits.

Do not assume the AI provider can accept unlimited simultaneous requests.

Official documentation:
https://developers.cloudflare.com/queues/

## 5.8 AI services

Use OpenAI for both initial production AI services:

| Responsibility | Model |
|---|---|
| Answer reasoning and feedback | `gpt-6-luna` |
| Speech-to-text | `gpt-transcribe` |

Keep API keys in Cloudflare Worker secrets.

Never expose API credentials in frontend JavaScript.

---

# 6. High-Level Architecture

The system should follow this structure:

```text
STUDENTS
   |
   v
NEXT.JS APPLICATION
Cloudflare Workers + OpenNext
   |
   |---- AWS Cognito
   |       User authentication
   |
   |---- Neon PostgreSQL
   |       Users
   |       Questions
   |       Interview sessions
   |       Transcripts
   |       AI feedback
   |       Usage tracking
   |
   |---- Cloudflare R2
   |       Temporary audio
   |       Optional future recordings
   |
   |---- Cloudflare Queues
             |
             |---- Transcription jobs
             |       |
             |       v
             |    Processing Worker
             |       |
             |       v
             |    OpenAI GPT Transcribe
             |
             |---- Evaluation jobs
                     |
                     v
                  Processing Worker
                     |
                     v
                  OpenAI GPT-6 Luna
                     |
                     v
                  Neon PostgreSQL
```

Keep the application modular.

Do not introduce microservices or dedicated application servers without a demonstrated need.

---

# 7. Database Design

Use PostgreSQL with properly defined relationships, indexes, constraints, and migrations.

The initial schema should include:

## Users

- id
- cognito_sub
- email
- display_name
- role
- created_at
- updated_at

The Cognito subject must be unique.

Do not store passwords.

## Questions

- id
- category
- question_text
- description
- difficulty
- topic
- follow_up_questions
- source
- created_by
- is_active
- created_at

## Interview Sessions

- id
- user_id
- status
- session_type
- configuration
- total_stations
- started_at
- completed_at
- created_at

## Interview Stations

- id
- session_id
- question_id
- station_number
- question_snapshot
- status
- preparation_started_at
- response_started_at
- completed_at

Store a question snapshot so that editing a question later does not alter historical interview records.

## Audio Assets

- id
- user_id
- session_id
- station_id
- object_key
- status
- file_size
- duration
- expires_at
- created_at

## Transcripts

- id
- station_id
- transcript_text
- corrected_transcript
- transcription_provider
- transcription_model
- status
- user_edited
- created_at
- updated_at

## Station Evaluations

- id
- station_id
- model
- rubric_results
- strengths
- weaknesses
- evidence
- actionable_recommendations
- created_at

## Interview Reports

- id
- session_id
- overall_assessment
- performance_patterns
- overall_strengths
- overall_weaknesses
- recommendations
- status
- created_at

## AI Usage

- id
- user_id
- session_id
- station_id
- provider
- model
- operation_type
- input_tokens
- output_tokens
- audio_duration_seconds
- estimated_cost
- status
- created_at

This table is important for tracking actual API expenses.

Additional tables can be introduced where necessary, but avoid unnecessary schema complexity.

---

# 8. API Design

Use authenticated API endpoints.

The initial API should cover the following functionality.

## User

- GET /api/me
- PATCH /api/me
- DELETE /api/me

## Questions

- GET /api/questions
- GET /api/questions/:id
- POST /api/questions
- PATCH /api/questions/:id
- DELETE /api/questions/:id

## Interviews

- POST /api/interviews
- GET /api/interviews
- GET /api/interviews/:id
- POST /api/interviews/:id/start
- POST /api/interviews/:id/complete

## Stations

- GET /api/interviews/:id/stations
- GET /api/interviews/:id/stations/:stationId
- POST /api/interviews/:id/stations/:stationId/complete

## Audio

- POST /api/interviews/:id/stations/:stationId/upload-url
- POST /api/interviews/:id/stations/:stationId/audio-complete
- GET /api/interviews/:id/transcripts
- PATCH /api/transcripts/:transcriptId

## Evaluation

- POST /api/interviews/:id/evaluate
- GET /api/interviews/:id/results

The backend must verify ownership of every user-specific resource.

---

# 9. Security and Privacy

Security must be implemented from the beginning, not added at the end.

Requirements:

- Never expose API keys.
- Validate all incoming data.
- Verify authentication tokens.
- Enforce user-level authorization.
- Prevent access to other users' interview sessions.
- Keep R2 buckets private.
- Use short-lived signed URLs.
- Rate-limit sensitive endpoints.
- Restrict CORS to the application domains.
- Protect against duplicate evaluation requests.
- Use secure secret management.
- Provide account deletion.
- Implement data retention policies.
- Avoid logging full audio transcripts or personal responses unnecessarily.

## AI data privacy

OpenAI states that API data is not used for model training by default.

However, standard API usage can involve abuse-monitoring retention of up to 30 days.

Zero Data Retention and Modified Abuse Monitoring require eligibility and approval.

Do not claim that student data is never retained or always processed in Canada.

The OpenAI documentation currently distinguishes Canadian data storage from Canadian processing. Verify the actual account's data-residency eligibility before making promises about data location.

Use `store: false` for Responses API requests where applicable, but do not mistake that setting for Zero Data Retention.

Students must be informed that:
- Their microphone audio is processed by an external transcription provider.
- Their transcript is evaluated by an external AI provider.
- Temporary audio is deleted according to the application's retention policy.
- Their feedback and transcripts are stored in their account until deleted.

Obtain explicit consent before recording.

Do not encourage users to include identifiable patient information in practice answers.

The application must clearly explain that its feedback is educational and not an official medical school assessment.

---

# 10. Cost Management

The infrastructure budget is approximately $50 USD/month.

AI API costs are separate and must be tracked independently.

## Infrastructure

Initial targets:

| Service | Expected approach |
|---|---|
| Cloudflare Workers | Paid plan, starting around $5/month |
| Cloudflare Queues | Included operations within plan allowance |
| Cloudflare R2 | Free allowance initially |
| Neon | Free development tier; usage-based Launch for production if needed |
| AWS Cognito | Free allowance for qualifying users |
| Domain | Annual registration expense |
| Vercel | Not used |

Current Cloudflare Workers Paid pricing includes 10 million monthly requests and 30 million CPU milliseconds for a $5 starting monthly price.

Cloudflare Queues has 1 million monthly operations included on Workers Paid.

Neon's current Free plan includes 100 compute-hours and 1 GB of storage per project. Its Launch compute is usage-based, currently $0.106 per CU-hour, without a monthly minimum.

R2 currently includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations.

Cognito provides a qualifying free allowance of 10,000 monthly active users on Lite and Essentials.

These allowances are subject to provider terms and may change.

Do not assume the database will remain free under production traffic. Configure compute limits, usage alerts, and spending controls.

## AI cost tracking

Track:
- Audio minutes transcribed.
- Input tokens.
- Output tokens.
- Reasoning-token usage where reported.
- Cost per station.
- Cost per full interview.
- Cost per user.
- Total monthly AI expenses.

At current published standard pricing:

GPT Transcribe: $0.0045/minute.

GPT-6 Luna:
- $0.10 per million input tokens.
- $0.50 per million output tokens.

An illustrative full mock using 48 minutes of transcription, 16,000 input tokens, and 4,000 output tokens would cost approximately $0.2196 in AI processing.

This is an estimate, not a guaranteed cost. Actual usage must be recorded from API responses.

Implement:
- Per-user usage limits.
- Global monthly AI budget.
- Maximum audio duration.
- Maximum request size.
- Provider rate limiting.
- Administrative ability to pause new evaluations.
- Clear user-facing messages when usage limits are reached.

Never automatically switch to a more expensive model.

The interview simulator must remain usable even when AI evaluation is temporarily unavailable.

---

# 11. Development Roadmap

Build incrementally.

Do not attempt to build the entire platform in one implementation task.

Each phase must have acceptance criteria, tests, and documentation.

## Phase 0 — Architecture and planning

Deliverables:
- ARCHITECTURE.md
- DATABASE_DESIGN.md
- API_SPECIFICATION.md
- DEVELOPMENT_ROADMAP.md
- DECISIONS.md
- Updated PROJECT_SPEC.md

Confirm the complete deployment strategy and validate Cloudflare compatibility.

Do not provision paid resources.

## Phase 1 — Project foundation

Set up:
- Next.js.
- React.
- TypeScript.
- Cloudflare Workers deployment.
- OpenNext adapter.
- GitHub integration.
- Environment variables.
- Local development.
- Basic testing.
- Logging.

First deploy a minimal application to a Cloudflare staging environment.

Confirm that the Next.js application works correctly before implementing major features.

## Phase 2 — Database and authentication

Implement:
- Neon PostgreSQL.
- Drizzle ORM.
- Database migrations.
- AWS Cognito.
- User registration.
- Email verification.
- Login and logout.
- Password reset.
- JWT verification.
- User profiles.
- Ownership checks.

Test authentication and unauthorized access.

## Phase 3 — Question bank and dashboard

Implement:
- Dashboard.
- Question browsing.
- Categories.
- Topics.
- Difficulty filters.
- Custom questions.
- Question selection.
- Interview configuration.
- Interview history.

Seed the database with curated questions.

Do not implement AI question generation yet.

## Phase 4 — Interview simulator

Implement:
- Eight-station full mock.
- Custom station count.
- Two-minute preparation.
- Six-minute spoken response.
- Two-minute midway break.
- Automatic station transitions.
- Progress tracking.
- Camera preview.
- Microphone permissions.
- Session recovery.
- Completion screen.

Test timer behavior and session recovery thoroughly.

The simulator must work independently of AI functionality.

## Phase 5 — Audio capture and transcription

Implement:
- Browser MediaRecorder.
- Audio format selection.
- Audio compression where necessary.
- R2 private storage.
- Signed upload URLs.
- Cloudflare Queues.
- Background transcription Worker.
- OpenAI GPT Transcribe integration.
- Transcript storage.
- Transcript editing.
- Retry handling.
- Temporary audio deletion.

Test on Chrome, Safari, and Firefox where supported.

## Phase 6 — AI evaluation

Implement:
- GPT-6 Luna integration.
- Responses API.
- Medium reasoning effort.
- Structured output.
- MMI evaluation rubric.
- Individual station feedback.
- Overall interview report.
- AI usage tracking.
- Token accounting.
- Rate limiting.
- Evaluation job processing.
- Error handling.

Do not generate feedback while the user is still completing the interview.

Evaluate only after the session is completed and transcripts are ready.

## Phase 7 — Production readiness

Implement and verify:
- Production environment.
- Custom domain.
- HTTPS.
- Secrets management.
- Error monitoring.
- Logging.
- Usage monitoring.
- Billing alerts.
- Database backups.
- Data deletion.
- Privacy disclosures.
- Security testing.
- API rate limits.
- Queue retry handling.

Conduct load testing.

Target test:
- 100 authenticated simultaneous users.
- 100 active interview sessions.
- Simultaneous station audio uploads.
- A burst of up to 800 transcription jobs from 100 completed eight-station interviews.
- Up to 100 interview evaluation workflows.
- Database concurrency.
- API provider throttling and recovery.

Do not claim 100-user production capacity until the test succeeds.

## Phase 8 — Post-MVP features

After the core platform is stable, consider:

- Optional permanent interview recordings.
- Private recording sharing.
- Peer feedback and comments.
- AI question generation.
- Additional interview formats.
- Advanced progress analytics.
- More detailed performance comparisons.

These features must not delay the initial MVP.

---

# 12. Testing Requirements

Every phase must include appropriate tests.

## Unit tests

Test:
- Timer calculations.
- Interview transitions.
- Question selection.
- Session state.
- Authorization.
- Rubric output validation.
- Cost calculations.

## Integration tests

Test:
- Cognito authentication.
- PostgreSQL operations.
- R2 uploads.
- Queue creation.
- Transcription processing.
- AI evaluation.
- Account deletion.

## End-to-end tests

Simulate a student completing an entire eight-station interview.

Verify:
1. Registration.
2. Login.
3. Question selection.
4. Interview start.
5. Preparation timer.
6. Spoken response.
7. Station transition.
8. Audio upload.
9. Transcription.
10. Transcript review.
11. AI evaluation.
12. Results display.
13. Interview history.

## AI quality tests

Create a benchmark of at least 30–50 sample MMI answers.

Include:
- Strong answers.
- Average answers.
- Weak answers.
- Ethical dilemmas.
- Personal questions.
- Policy questions.
- Different reasoning approaches.
- Different communication styles.

Have human reviewers grade the sample answers.

Compare the AI's feedback with the human reference.

Test consistency, specificity, fairness, and hallucination rates.

Do not rely solely on the model's own self-assessment.

## Transcription tests

Use sample audio with:
- Different Canadian English accents.
- Different speaking speeds.
- Background noise.
- Pauses and filler words.
- Medical terminology.
- Ethical terminology.

Measure transcription accuracy and inspect errors that change the meaning of an answer.

---

# 13. Development Rules for the Coding Agent

These requirements apply throughout the project.

1. Treat this document as the source of truth.
2. Do not revert to Supabase.
3. Do not introduce Vercel Pro.
4. Do not introduce a dedicated NestJS server.
5. Do not introduce EC2, RDS, AWS Lambda, or AWS SQS into the initial architecture.
6. Do not introduce Kubernetes, Redis, or microservices without justification.
7. Do not self-host AI models.
8. Do not expose API keys.
9. Do not provision paid infrastructure without approval.
10. Do not implement every phase simultaneously.
11. Do not silently change selected technologies.
12. Do not add unnecessary dependencies.
13. Do not claim features are complete without testing them.
14. Do not leave placeholder implementations while claiming functionality is finished.
15. Do not invent API model IDs or use deprecated models.
16. Check official provider documentation when implementing integrations.
17. Document architectural changes.
18. Maintain automated tests.
19. Use Git commits after meaningful milestones.
20. Keep PROGRESS.md updated.

At the end of each phase, report:
- What was implemented.
- Which files changed.
- Tests performed.
- Tests passing and failing.
- Known limitations.
- Remaining work.
- Any cost implications.

---

# 14. Required Project Documentation

Maintain these files:

| File | Responsibility |
|---|---|
| PROJECT_SPEC.md | Complete product and technical requirements |
| ARCHITECTURE.md | System architecture and component responsibilities |
| DATABASE_DESIGN.md | Database schema and relationships |
| API_SPECIFICATION.md | API routes, request/response contracts |
| DEVELOPMENT_ROADMAP.md | Development phases and milestones |
| DECISIONS.md | Important architectural decisions and rationale |
| PROGRESS.md | Completed work, current work, and next steps |
| RUNBOOK.md | Deployment, configuration, troubleshooting |

All documentation must reflect the actual implementation, not an imagined future state.

---

# 15. Official Technical References

Use these sources when implementing the integrations.

OpenAI:
- GPT-6 models: https://developers.openai.com/api/docs/models
- GPT-6 usage: https://developers.openai.com/api/docs/guides/latest-model
- Speech-to-text: https://developers.openai.com/api/docs/guides/speech-to-text
- API pricing: https://platform.openai.com/pricing
- Data controls: https://developers.openai.com/api/docs/guides/your-data

Cloudflare:
- Next.js on Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Queues: https://developers.cloudflare.com/queues/
- R2: https://developers.cloudflare.com/r2/

Database:
- Neon: https://neon.com/docs
- Neon pricing: https://neon.com/pricing

Authentication:
- Cognito: https://docs.aws.amazon.com/cognito/
- Cognito pricing: https://aws.amazon.com/cognito/pricing/

Use current documentation rather than relying on outdated tutorials.

---

# Final Product Definition

The MVP is complete when a student can:

1. Create an account.
2. Log in.
3. Browse Canadian MMI questions.
4. Configure a mock interview.
5. Complete eight timed stations.
6. Record spoken responses.
7. Have those responses transcribed.
8. Review and correct transcripts.
9. Receive AI-generated feedback for each station.
10. Receive an overall interview report.
11. Review their previous interviews.

The application must be deployable, secure, and tested for the intended initial user load.

Prioritize a reliable, useful interview experience over unnecessary infrastructure and features.

The objective is to launch a real working product quickly while maintaining an architecture that can grow.

---

# Phase 0 Addendum

Phase 0 verified this specification against official provider documentation. Findings, and the additions needed where this specification was silent, are recorded in [DECISIONS.md](DECISIONS.md). The requirements above are unchanged. If DECISIONS.md and this document conflict, this document wins until the project owner approves a change.
