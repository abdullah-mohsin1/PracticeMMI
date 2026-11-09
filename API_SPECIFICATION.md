# API Specification

**Status:** design only. Routes will be implemented per phase. Routes marked **+** are additions to the spec's list.

## Conventions

- JSON over HTTPS, same-origin. Authentication uses `httpOnly` cookies set by `/auth/callback`.
- Request bodies and query strings are validated with Zod. Unknown fields are rejected.
- Mutating routes require a matching `Origin` header.
- List routes use `?limit=` (default 20, max 100) and `?cursor=`, and return `{ items, nextCursor }`.
- Timestamps are ISO 8601 UTC.

**Errors:** `{ "error": { "code": "STRING_CODE", "message": "Readable text" } }`

| Status | Used for |
|---|---|
| 400 | Validation failure |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not permitted, such as non-admin routes |
| 404 | Not found, **including other users' resources** |
| 409 | Invalid state for the action |
| 413 | Audio over 25 MB |
| 429 | Rate limit or usage limit |
| 503 | Evaluations paused |

## Authentication routes **+**

Redirect routes, not JSON.

| Route | Purpose |
|---|---|
| `GET /auth/login` | Create PKCE and state, redirect to Cognito managed login |
| `GET /auth/callback` | Validate state, exchange code, set cookies |
| `POST /auth/logout` | Clear cookies, redirect to Cognito logout |

## User

### `GET /api/me`
Returns `{ id, email, displayName, role, usage: { mocksThisMonth, mockLimit, audioMinutesThisMonth, audioMinuteLimit } }`. Creates the user row on first request.

### `PATCH /api/me`
Body: `{ displayName }`. Returns the updated user.

### `DELETE /api/me`
Body: `{ confirm: true }`. Deletes the account and associated data. Returns `204`. Safe to repeat.

## Questions

### `GET /api/questions`
Query: `category`, `topic`, `difficulty`, `mine`, `search`, `limit`, `cursor`. Admins may also send `reviewStatus`.
Returns questions visible to the caller.

### `GET /api/questions/:id`
Returns `{ id, category, questionText, description, difficulty, topics, followUpQuestions, source, isActive }`.

### `POST /api/questions`
Body: `{ category, questionText, description?, difficulty, topics?, followUpQuestions? }`.
Students create a private `user` question. Admins may also send `source: "curated"` and `reviewStatus`.

### `PATCH /api/questions/:id`
Owners may edit their custom questions. Admins may edit, approve or deactivate any question. Past interviews are unaffected because stations store snapshots.

### `DELETE /api/questions/:id`
Custom questions are deleted by their owner. Curated questions are made inactive, by admins only. Returns `204`.

## Interviews

### `POST /api/interviews`
```json
{
  "sessionType": "full_mock",
  "stationCount": 8,
  "questionIds": ["uuid"],
  "categories": ["ethical", "policy"],
  "randomize": true
}
```
`questionIds`, `categories`, and `randomize` are optional. Fails with `409 NOT_ENOUGH_QUESTIONS` if selection cannot fill the stations. Formats come from server configuration, so clients cannot send custom timing. Returns `201` with the session.

### `GET /api/interviews`
Lists the caller's sessions, newest first: `{ id, status, sessionType, totalStations, startedAt, completedAt, resultsStatus }`.

### `GET /api/interviews/:id`
Used for loading and recovery.
```json
{
  "id": "uuid",
  "status": "in_progress",
  "serverNow": "2026-11-08T20:00:00.000Z",
  "timeline": [
    { "kind": "preparation", "station": 1, "startsAt": "...", "endsAt": "..." },
    { "kind": "response", "station": 1, "startsAt": "...", "endsAt": "..." },
    { "kind": "break", "startsAt": "...", "endsAt": "..." }
  ]
}
```

### `POST /api/interviews/:id/start`
Body: `{ consentVersion, audioOnly }`. Writes the full timeline. Calling it again returns the existing timeline. Returns the same shape as `GET /api/interviews/:id`.

### `POST /api/interviews/:id/complete`
Marks the session complete after the final deadline, and marks unattended stations `missed`. Safe to repeat. Returns `409 INTERVIEW_NOT_FINISHED` if called too early.

## Stations

### `GET /api/interviews/:id/stations`
Returns stations in order. Questions for future stations are withheld until their preparation begins.

### `GET /api/interviews/:id/stations/:stationId`
Returns one station under the same rule.

### `POST /api/interviews/:id/stations/:stationId/complete`
Records that the browser reached the end of the station. Safe to repeat, and it never moves a deadline.

### `POST /api/interviews/:id/stations/:stationId/text-response` **+**
Body: `{ text }` (maximum 20,000 characters). Stores a manual answer when the microphone is unavailable, transcription fails, or the station was missed. Creates a `manual` transcript.

## Audio and transcripts

### `POST /api/interviews/:id/stations/:stationId/upload-url`
Body: `{ mimeType: "audio/webm" | "audio/mp4", sizeBytes, durationSeconds }`.
Returns `{ assetId, uploadUrl, headers, expiresAt }`. Requires consent, and that the station's response window has begun.

### `POST /api/interviews/:id/stations/:stationId/audio-complete`
Body: `{ assetId }`. Verifies the stored object, then enqueues transcription. Returns `202 { jobId, status }`. Safe to repeat. Returns `413` and deletes the object if it's too large.

### `GET /api/interviews/:id/transcripts`
Returns `{ items: [{ id, stationId, stationNumber, status, source, text, userEdited }] }`. `text` is the corrected version when present.

### `PATCH /api/transcripts/:transcriptId`
Body: `{ correctedText }`. Sets `userEdited`. Returns `409` once evaluation has started.

### `POST /api/transcripts/:transcriptId/retry` **+**
Retries a failed transcription while the audio still exists. Returns `202`, or `409 AUDIO_EXPIRED`, in which case the student can enter text instead.

## Evaluation

### `POST /api/interviews/:id/evaluate`
Confirms that transcripts are reviewed and starts evaluation (D-021). Requires a completed session with no pending transcripts. Stations without an answer are excluded and shown as such.
Returns `202 { status: "queued" }`. Repeat calls return the current status and create no new jobs. Errors: `409 TRANSCRIPTS_PENDING`, `429 USAGE_LIMIT_REACHED`, `503 EVALUATIONS_PAUSED`.

### `GET /api/interviews/:id/results`
```json
{
  "status": "processing",
  "stationsReady": 5,
  "stationsTotal": 8,
  "stations": [
    {
      "stationNumber": 1,
      "overallAssessment": "...",
      "rubricResults": [],
      "strengths": [],
      "weaknesses": [],
      "missingConsiderations": [],
      "evidence": [],
      "actionableRecommendations": [],
      "transcriptLimitations": null
    }
  ],
  "report": null,
  "disclaimer": "Educational feedback only. Not an official medical school assessment."
}
```
Status is `not_started`, `processing`, `ready`, `partial` or `failed`. The frontend polls this route while the page is open.

## Administration **+**

These require `users.role = admin`.

### `GET /api/admin/settings`, `PATCH /api/admin/settings`
Reads or changes `evaluationsPaused`, `monthlyAiBudgetUsd` and per-user limits.

### `GET /api/admin/usage`
Query: `month`. Returns audio minutes, input, output and reasoning tokens, and cost by operation, plus average cost per mock.

## Authorization summary

| Resource | Rule |
|---|---|
| Interviews, stations, audio, transcripts, results | Owner only, from the verified Cognito `sub` |
| Custom questions | Owner, or admin |
| Curated questions | Read for all authenticated users; write for admins |
| Admin routes | Admin only |

Every ownership rule gets an automated test confirming another user receives `404`.
