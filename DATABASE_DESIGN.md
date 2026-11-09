# Database Design

**Status:** design only. The schema will be implemented with Drizzle migrations starting in Phase 2. Columns marked **+** are additions to the spec (D-008).

## Conventions

- PostgreSQL on Neon, using Drizzle ORM and migrations.
- Primary keys are `uuid` with `gen_random_uuid()`. Timestamps are `timestamptz` in UTC.
- Money uses `numeric(12,6)`. Status fields are PostgreSQL enums.
- `updated_at` is set by application code.
- Passwords, audio and API keys are never stored here.

## Relationships

```text
users 1---* interview_sessions 1---* interview_stations
users 1---* questions (private custom questions)
interview_sessions 1---0..1 interview_reports
interview_stations 1---* audio_assets
interview_stations 1---0..1 transcripts
interview_stations 1---0..1 station_evaluations
questions 1---* interview_stations (nullable; snapshot is authoritative)
users, sessions, stations 1---* processing_jobs
users, sessions, stations 1---* ai_usage (set null on delete)
```

## Enums

| Enum | Values |
|---|---|
| `user_role` | `student`, `admin` |
| `question_category` | `ethical`, `personal`, `policy` |
| `question_difficulty` | `easy`, `medium`, `hard` |
| `question_source` | `curated`, `user`, `ai_generated` |
| `question_review_status` | `draft`, `pending_review`, `approved`, `rejected` |
| `session_status` | `configured`, `in_progress`, `completed`, `abandoned` |
| `session_type` | `full_mock`, `custom` |
| `station_status` | `pending`, `preparation`, `response`, `completed`, `missed` |
| `audio_status` | `pending_upload`, `uploaded`, `processing`, `deleted`, `failed`, `expired` |
| `transcript_status` | `pending`, `ready`, `failed` |
| `transcript_source` | `transcription`, `manual` |
| `job_type` | `transcription`, `station_evaluation`, `interview_report` |
| `job_status` | `queued`, `running`, `succeeded`, `failed` |
| `report_status` | `pending`, `ready`, `failed` |
| `ai_operation_type` | `transcription`, `station_evaluation`, `interview_report` |
| `ai_usage_status` | `succeeded`, `failed`, `invalid_output` |

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| cognito_sub | text | **Unique**, not null |
| email | text | Not null |
| display_name | text | |
| role | user_role | Default `student` |
| deletion_requested_at **+** | timestamptz | Set when account deletion begins |
| created_at, updated_at | timestamptz | |

### questions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| category | question_category | Not null |
| question_text | text | Not null |
| description | text | |
| difficulty | question_difficulty | Not null |
| topics **+** | text[] | Replaces the spec's single `topic`; default empty |
| follow_up_questions | jsonb | Array of strings |
| source | question_source | Not null |
| review_status **+** | question_review_status | Default `draft` |
| created_by | uuid FK users | Set null on delete for curated; see constraint |
| is_active | boolean | Default true |
| created_at | timestamptz | |
| updated_at **+** | timestamptz | |

Constraint: if `source = 'user'`, `created_by` must be set. Custom questions are deleted with their owner, enforced by the deletion flow.

**Visibility:** students see `curated`, `approved`, active questions, plus their own `user` questions. Admins see all.

Indexes: `(category, is_active)`, GIN on `topics`, `(created_by)`, `(review_status)`.

### interview_sessions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users | Not null, cascade |
| status | session_status | Default `configured` |
| session_type | session_type | Not null |
| configuration | jsonb | Snapshot; see below |
| total_stations | integer | Check `> 0` |
| started_at | timestamptz | |
| scheduled_end_at **+** | timestamptz | Final deadline |
| break_started_at **+** | timestamptz | Null if no break |
| break_ends_at **+** | timestamptz | Null if no break |
| completed_at | timestamptz | |
| recording_consent_at **+** | timestamptz | Set when consent is given |
| consent_version **+** | text | Version of the text agreed to |
| created_at | timestamptz | |

`configuration` shape: `{ stationCount, prepSeconds, responseSeconds, breakSeconds, breakAfterStation }`.

Indexes: `(user_id, created_at desc)`, `(status)`.

### interview_stations
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | Not null, cascade |
| question_id | uuid FK questions | Set null on delete |
| station_number | integer | Check `> 0` |
| question_snapshot | jsonb | Not null |
| status | station_status | Default `pending` |
| preparation_started_at | timestamptz | Scheduled at start |
| response_started_at | timestamptz | Scheduled; also ends preparation |
| response_ends_at **+** | timestamptz | Deadline |
| completed_at | timestamptz | |

Unique: `(session_id, station_number)`.

### audio_assets
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | Not null, cascade |
| session_id | uuid FK | Not null, cascade |
| station_id | uuid FK | Not null, cascade |
| object_key | text | **Unique**, server-generated |
| mime_type **+** | text | `audio/webm` or `audio/mp4` |
| status | audio_status | Default `pending_upload` |
| file_size | bigint | Check `<= 26214400` |
| duration | numeric(8,2) | Seconds |
| expires_at | timestamptz | Not null |
| created_at | timestamptz | |

Indexes: `(station_id)`, `(status, expires_at)`.

### transcripts
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| station_id | uuid FK | **Unique**, not null, cascade |
| transcript_text | text | Null until ready |
| corrected_transcript | text | Student's edit |
| source **+** | transcript_source | Default `transcription` |
| transcription_provider | text | Null for manual answers |
| transcription_model | text | Null for manual answers |
| status | transcript_status | Default `pending` |
| user_edited | boolean | Default false |
| created_at, updated_at | timestamptz | |

### station_evaluations
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| station_id | uuid FK | **Unique**, not null, cascade |
| model | text | Not null |
| overall_assessment **+** | text | |
| rubric_results | jsonb | Nine criteria |
| strengths | jsonb | |
| weaknesses | jsonb | |
| missing_considerations **+** | jsonb | |
| evidence | jsonb | Quotes from the transcript |
| actionable_recommendations | jsonb | |
| transcript_limitations **+** | text | Null when none |
| schema_version **+** | integer | Not null |
| prompt_version **+** | text | Not null |
| created_at | timestamptz | |

### interview_reports
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | **Unique**, not null, cascade |
| overall_assessment | text | |
| performance_patterns | jsonb | |
| overall_strengths | jsonb | |
| overall_weaknesses | jsonb | |
| recommendations | jsonb | |
| model **+** | text | |
| status | report_status | Default `pending` |
| created_at | timestamptz | |

### processing_jobs **+**
Required by the spec's job status tracking and idempotency requirements.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Sent in queue messages |
| idempotency_key | text | **Unique**, e.g. `eval:{stationId}` |
| type | job_type | Not null |
| user_id, session_id | uuid FK | Not null, cascade |
| station_id | uuid FK | Null for report jobs, cascade |
| status | job_status | Default `queued` |
| attempts | integer | Default 0 |
| last_error_code | text | Never contains user content |
| created_at, updated_at | timestamptz | |

Indexes: `(session_id, type, status)`.

### ai_usage
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | One row per provider attempt |
| user_id | uuid FK | Nullable, set null on delete |
| session_id | uuid FK | Nullable, set null on delete |
| station_id | uuid FK | Nullable, set null on delete |
| provider | text | Not null |
| model | text | Not null |
| operation_type | ai_operation_type | Not null |
| input_tokens | integer | |
| output_tokens | integer | Includes reasoning tokens |
| reasoning_tokens **+** | integer | Where reported |
| audio_duration_seconds | numeric(8,2) | |
| duration_is_estimated **+** | boolean | Default false (D-014) |
| estimated_cost | numeric(12,6) | Not null |
| status | ai_usage_status | Not null |
| created_at | timestamptz | |

Indexes: `(created_at)`, `(user_id, created_at)`, `(session_id)`.

### app_settings **+**
A single row, enforced with `check (id = 1)`.

| Column | Type | Notes |
|---|---|---|
| id | integer PK | Always 1 |
| evaluations_paused | boolean | Default false |
| monthly_ai_budget_usd | numeric(10,2) | Set before Phase 6 goes live |
| max_mock_interviews_per_user_month | integer | |
| max_audio_minutes_per_user_month | integer | |
| updated_at | timestamptz | |

## Retention

| Data | Kept until |
|---|---|
| Station audio | Deleted after transcription, or by the two-day expiry rule (up to about three days in practice) |
| Transcripts, evaluations, reports | Account deletion, or the student deletes them |
| `ai_usage` | Kept with identifiers removed after account deletion |

## Migrations

Migrations are generated by Drizzle Kit, reviewed, committed in `drizzle/`, and applied first to a Neon branch, then to staging and production. Curated questions are seeded by a separate repeatable script.
