# AGENTS.md

## Project purpose

This repository contains an anonymous interactive survey for a conference.

Approximately 200 participants may use the application at the same time. Each participant is shown an active question and answers by placing a point in a two-dimensional coordinate system. The backend stores the normalized X and Y coordinates together with a pseudonymous participant UUID.

The application must be reliable during a short burst of concurrent submissions, must not collect unnecessary personal information, and must preserve all accepted responses in PostgreSQL.

## Source of truth

Follow this file for repository-wide implementation decisions.

Before changing code:

1. Read this file.
2. Inspect the existing repository and relevant tests.
3. Preserve working behavior unless the task explicitly requires a change.
4. Prefer the smallest complete solution that satisfies the requirements.
5. Do not replace the chosen architecture without explaining a concrete technical reason.

More specific `AGENTS.md` files may be added later inside `frontend/` or `backend/`. When present, the closest applicable file takes precedence.

## Repository architecture

Use one Git repository with separate frontend and backend applications:

```text
conference-survey/
├── AGENTS.md
├── README.md
├── render.yaml
├── frontend/
└── backend/
```

Deploy the applications as separate Render services:

- `frontend/`: Render Static Site
- `backend/`: Render Web Service
- Database: managed Render PostgreSQL
- Infrastructure configuration: root-level `render.yaml`
- Deployment runtime: Render native runtimes
- Docker: do not add Docker unless explicitly requested or required by a dependency

Do not merge the React application into FastAPI unless explicitly requested.

## Required technology stack

### Frontend

- React
- TypeScript
- Vite
- Pointer Events for mouse, touch, and pen support
- Vitest
- React Testing Library
- ESLint
- Production build produced with Vite

### Backend

- Python 3.12 or the current supported production version selected by the project
- FastAPI
- Uvicorn
- SQLAlchemy 2.x
- SQLAlchemy async ORM for application database access
- Psycopg 3 using the `postgresql+psycopg` SQLAlchemy dialect
- PostgreSQL
- Alembic for migrations
- Pydantic v2
- `pydantic-settings`
- Pytest
- `pytest-asyncio`
- HTTPX
- Ruff
- Mypy

Do not use SQLite as the production database. Backend tests that exercise persistence must use PostgreSQL behavior rather than silently substituting SQLite.

## Backend package structure

Use this structure unless the existing repository already has a compatible equivalent:

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── dependencies.py
│   │   ├── router.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py
│   │       ├── participants.py
│   │       ├── questions.py
│   │       ├── responses.py
│   │       └── results.py
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── exceptions.py
│   │   ├── logging.py
│   │   └── security.py
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   └── session.py
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── participant.py
│   │   ├── question.py
│   │   └── response.py
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── participant.py
│   │   ├── question.py
│   │   ├── response.py
│   │   └── result.py
│   │
│   ├── repositories/
│   │   ├── __init__.py
│   │   ├── participants.py
│   │   ├── questions.py
│   │   └── responses.py
│   │
│   └── services/
│       ├── __init__.py
│       ├── participants.py
│       ├── questions.py
│       ├── responses.py
│       └── results.py
│
├── alembic/
│   ├── versions/
│   └── env.py
├── tests/
│   ├── conftest.py
│   ├── api/
│   ├── repositories/
│   └── services/
├── alembic.ini
├── pyproject.toml
└── .env.example
```

Avoid generic folders such as `utils/` when a more specific module name is possible.

## Layer responsibilities

Use the following request flow:

```text
HTTP route -> service -> repository -> PostgreSQL
```

### Routes

Routes are responsible for:

- Parsing path, query, header, and body values
- Declaring request and response schemas
- Declaring status codes
- Applying FastAPI dependencies
- Calling services
- Mapping known application exceptions to HTTP responses through shared exception handlers

Routes must remain thin.

Routes must not:

- Contain direct SQLAlchemy queries
- Commit or roll back transactions
- Contain substantial business logic
- Return raw database errors
- Return ORM models without an explicit response schema

### Schemas

Pydantic schemas are responsible for:

- Request validation
- Response serialization
- Coordinate validation
- Stable API contracts

Use separate schemas where create, update, and read shapes differ. Do not reuse ORM models as API schemas.

### Models

SQLAlchemy models are responsible for:

- PostgreSQL table definitions
- Relationships
- Foreign keys
- Indexes
- Unique constraints
- Database-level check constraints

Use PostgreSQL UUID columns. Use timezone-aware timestamps and store all timestamps in UTC.

### Repositories

Repositories are responsible for SQLAlchemy statements and persistence operations.

Repositories may:

- Select rows
- Insert rows
- Update rows
- Delete rows when explicitly required
- Perform PostgreSQL upserts
- Flush changes when generated database values are needed

Repositories must not:

- Know about HTTP status codes
- Raise `HTTPException`
- Commit or roll back transactions
- Contain unrelated business rules
- Use a generic base repository abstraction unless repeated code clearly justifies it

Prefer small feature-specific repository functions over a large generic CRUD framework.

### Services

Services are responsible for:

- Business rules
- Application-level validation
- Transaction boundaries
- Coordinating multiple repositories
- Converting persistence outcomes into application outcomes
- Raising typed application exceptions

The service layer owns commits and rollbacks, normally by using `async with session.begin():`.

## Async rules

The backend application uses asynchronous database access.

Use:

- `async def` for routes that await database or network operations
- `create_async_engine`
- `async_sessionmaker`
- One `AsyncSession` per request
- `expire_on_commit=False`
- `pool_pre_ping=True`
- A small bounded connection pool
- `await` for all async SQLAlchemy operations

Do not:

- Share one `AsyncSession` between requests
- Share one `AsyncSession` between concurrently running tasks
- Perform blocking database or file I/O inside `async def` routes
- Mark pure calculations async when they do not await anything
- Create a database session at import time for request use
- Run long CPU-bound work in the event loop

Pure functions, models, schemas, validation helpers, and coordinate calculations should remain synchronous.

Alembic migrations may remain synchronous. They do not need to use the application's async request path.

Avoid implicit lazy loading in async ORM code. Explicitly select or eager-load related data when needed.

## Database configuration

Use a single database settings object loaded from environment variables.

The application database URL must use the Psycopg dialect:

```text
postgresql+psycopg://...
```

For Render production:

- Use the internal PostgreSQL connection URL
- Place the backend and database in the same Render region
- Start with SQLAlchemy's own small connection pool
- Do not enable PgBouncer unless load testing or metrics show connection pressure
- Never expose database credentials to the frontend
- Never commit production connection strings

Recommended starting pool configuration:

```python
create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)
```

Treat these values as defaults, not permanent tuning. Change them only with a documented reason.

## Required data model

### Participant

Required fields:

- `id`: UUID primary key
- `created_at`: timezone-aware timestamp

The UUID must be generated server-side.

### Question

Required fields:

- `id`: UUID primary key
- `prompt`: non-empty text
- `x_axis_label`: optional text
- `y_axis_label`: optional text
- `is_active`: boolean
- `created_at`: timezone-aware timestamp
- `updated_at`: timezone-aware timestamp

The initial version may assume one active question at a time. Enforce this through service logic unless a database constraint is deliberately added and tested.

### Response

Required fields:

- `id`: UUID primary key
- `participant_id`: foreign key to participant
- `question_id`: foreign key to question
- `x`: double precision
- `y`: double precision
- `submitted_at`: timezone-aware timestamp
- `updated_at`: timezone-aware timestamp

Required database constraints:

- `CHECK (x >= 0 AND x <= 1)`
- `CHECK (y >= 0 AND y <= 1)`
- Unique constraint on `(participant_id, question_id)`
- Index on `question_id`
- Appropriate foreign-key indexes when PostgreSQL will benefit from them

Use PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` for response submission so retries are idempotent and do not create duplicate participant/question responses.

Do not store screen pixels. Store normalized coordinates only.

## Participant identity

Participant identity is pseudonymous and must not require names, email addresses, phone numbers, or other personal information.

Preferred flow:

1. The frontend calls the participant creation endpoint.
2. The backend creates a UUID.
3. The backend returns the UUID and a signed participant token.
4. The frontend stores the UUID and signed token locally.
5. Submission requests send the signed token.
6. The backend verifies the token and derives the participant UUID from it.
7. The backend does not trust a participant UUID supplied independently in the request body.

The token is not a personal identity system. It only prevents accidental or trivial UUID impersonation.

Use a strong environment-provided signing secret. Do not log the participant token.

If the project intentionally chooses unsigned UUIDs for a simpler prototype, document that decision explicitly and treat the UUID only as an untrusted grouping value.

## API conventions

Use the prefix:

```text
/api/v1
```

Required initial endpoints:

```text
POST /api/v1/participants
GET  /api/v1/questions/active
PUT  /api/v1/questions/{question_id}/response
GET  /api/v1/results.csv
GET  /health
```

Expected behavior:

### `POST /api/v1/participants`

- Creates a participant
- Generates the UUID server-side
- Returns HTTP 201
- Returns the participant UUID and signed participant token
- Does not collect personal data

### `GET /api/v1/questions/active`

- Returns the active question
- Returns a safe not-found response when no question is active
- Does not expose unpublished internal data

### `PUT /api/v1/questions/{question_id}/response`

- Requires a valid participant token
- Accepts normalized `x` and `y`
- Validates both coordinates between 0 and 1
- Confirms that the question exists and is active
- Upserts one response per participant and question
- Returns success only after the database transaction completes
- Is safe to retry

### `GET /api/v1/results.csv`

- Is not public
- Requires an organizer/admin bearer secret or equivalent protected mechanism
- Supports exporting stored responses without exposing database credentials
- Must not log the authorization secret
- Should stream or efficiently return CSV output

### `GET /health`

- Returns HTTP 200 when the application process is healthy
- Must remain fast
- Should not expose secrets or detailed internal state
- May include a lightweight database readiness check if implemented carefully
- Is used by Render as the service health-check path

Use consistent JSON error responses. Do not expose SQL text, stack traces, credentials, or raw exception messages.

## Transaction rules

Use one request-scoped session.

Services should normally use:

```python
async with session.begin():
    ...
```

Repositories may call `flush()` but must not call `commit()`.

When a transaction fails:

- Roll it back
- Log a safe diagnostic message
- Return a stable client-facing error
- Preserve the original exception as the cause where appropriate
- Never partially report success

A frontend success state may only be shown after the backend confirms that the transaction succeeded.

## Configuration and secrets

Backend settings must be loaded with `pydantic-settings`.

Expected backend environment variables:

```text
APP_ENV
DATABASE_URL
FRONTEND_ORIGIN
PARTICIPANT_TOKEN_SECRET
RESULTS_EXPORT_TOKEN
LOG_LEVEL
```

Expected frontend environment variable:

```text
VITE_API_BASE_URL
```

Rules:

- Commit `.env.example` files with placeholders only
- Never commit `.env` files
- Never invent real secret values
- Never put secrets in variables prefixed with `VITE_`
- Never expose `DATABASE_URL` to the frontend
- Fail fast at startup when required production settings are missing
- Allow safe development defaults only where explicitly documented

## CORS

The frontend and backend are separate services, so configure CORS explicitly.

Allow:

- The local Vite development origin
- The exact deployed frontend origin
- Only required HTTP methods
- Only required headers

Do not use wildcard origins in production.

When credentials or authorization headers are used, test the complete browser preflight flow.

## Frontend behavior

The survey interface must:

- Display the active question
- Display optional X-axis and Y-axis labels
- Work on mobile phones, tablets, and desktop browsers
- Use Pointer Events
- Allow selection using touch, mouse, or pen
- Show the selected point clearly before submission
- Keep the point inside the graph bounds
- Normalize both coordinates to values between 0 and 1
- Use bottom-left as `(0, 0)` and top-right as `(1, 1)`
- Submit normalized values, never screen pixels
- Show distinct idle, selected, submitting, success, and error states
- Prevent accidental duplicate requests while a submission is in progress
- Allow a failed request to be retried
- Preserve the participant identity across normal page reloads
- Avoid collecting unnecessary personal information

Prefer an SVG-based coordinate surface because it scales cleanly across devices, but do not rewrite a working accessible implementation solely to use SVG.

Keep API calls in a dedicated frontend API module. Keep coordinate conversion in a pure, independently tested utility.

Do not use the participant token as a display value unless explicitly required.

## Coordinate normalization

Use normalized coordinates:

```text
x = horizontal position from left / graph width
y = 1 - vertical position from top / graph height
```

Clamp results to `[0, 1]`.

The backend must validate coordinates even when the frontend already validates them.

Test:

- All four corners
- Center
- Pointer positions outside the element bounds
- Mobile/touch events
- Resized graph dimensions
- Floating-point boundary values

Do not round coordinates aggressively before storage. Format them for display separately.

## Error handling

Create typed application exceptions in `app/core/exceptions.py`, for example:

- `ParticipantNotFoundError`
- `InvalidParticipantTokenError`
- `QuestionNotFoundError`
- `QuestionNotActiveError`
- `ResponsePersistenceError`
- `UnauthorizedResultsAccessError`

Register shared FastAPI exception handlers.

Do not raise `HTTPException` from repositories.

Client-facing errors must be understandable and stable. Internal logs may contain safe technical context but must not contain secrets, authorization headers, participant tokens, or database credentials.

## Logging

Use structured, production-appropriate logging.

Include useful context such as:

- Request method
- Request path
- Response status
- Request or correlation ID
- Safe entity identifiers when useful
- Error category

Do not log:

- Participant tokens
- Organizer/admin tokens
- Authorization headers
- Database URLs
- Environment secrets
- Full request bodies by default

Do not add a large observability platform unless explicitly requested. Standard logs and Render metrics are sufficient initially.

## Migrations

All schema changes require Alembic migrations.

Rules:

- Never rely on `Base.metadata.create_all()` in production
- Keep migrations reviewable and deterministic
- Include database constraints in migrations
- Verify upgrade from an empty database
- Verify upgrade from the current previous revision when relevant
- Avoid destructive migrations unless explicitly requested
- Explain data-loss risk before any destructive operation
- Run migrations as Render's pre-deploy command

Expected Render pre-deploy command:

```text
alembic upgrade head
```

## Testing requirements

### Backend unit and integration tests

Test at minimum:

- Participant creation
- Server-side UUID generation
- Participant token signing and verification
- Rejection of invalid or altered participant tokens
- Active-question retrieval
- Behavior when no question is active
- Coordinate validation below 0 and above 1
- Valid boundary coordinates at exactly 0 and 1
- Response creation
- Response upsert for the same participant and question
- Separate responses for different questions
- Separate responses for different participants
- Inactive-question rejection
- Unknown-question rejection
- Database constraint behavior
- Safe handling of database failures
- Protected CSV export
- Unauthorized CSV export rejection
- Health endpoint

Persistence tests must run against PostgreSQL semantics.

Use a dedicated `TEST_DATABASE_URL`. Testcontainers may be used when Docker is available, but the project must not depend on Docker for production deployment.

### Frontend tests

Test at minimum:

- Coordinate normalization
- All graph boundaries
- Bottom-left Y-axis conversion
- Pointer selection
- Responsive resizing behavior
- Participant creation flow
- Successful response submission
- Submission failure and retry
- Disabled state while submitting
- Success state only after server confirmation
- Missing active question state
- API error display

### End-to-end and load verification

Before production use:

- Add at least one end-to-end happy-path test
- Simulate 200 to 300 participants
- Include a burst of submissions over a short interval
- Verify no accepted responses are lost
- Verify retries do not create duplicate rows
- Verify the CSV export count matches stored responses
- Record the test command and result in the README or deployment checklist

Do not claim scalability solely from code inspection. Use a repeatable load test.

## Quality commands

Use the commands already defined by the repository. If no commands exist yet, configure equivalent commands to these.

### Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

On Windows, use the appropriate virtual-environment activation command.

### Backend development

```bash
cd backend
uvicorn app.main:app --reload
```

### Backend checks

```bash
cd backend
ruff check .
ruff format --check .
mypy app
pytest
```

### Alembic

```bash
cd backend
alembic upgrade head
alembic check
```

If `alembic check` is unavailable or unsuitable for the installed version, use the repository's documented migration drift check instead.

### Frontend setup

```bash
cd frontend
npm ci
```

Use `npm install` only when intentionally updating dependencies or creating the initial lockfile.

### Frontend development

```bash
cd frontend
npm run dev
```

### Frontend checks

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Do not report a task complete until relevant checks have been run, or clearly state which checks could not run and why.

## Render deployment

Use root-level `render.yaml`.

The Blueprint must define:

- One backend web service rooted at `backend/`
- One frontend static site rooted at `frontend/`
- One managed PostgreSQL database
- Same region for backend and database
- Backend health check at `/health`
- Backend pre-deploy migration command
- Backend start command
- Frontend build command and publish directory
- Environment-variable references without committed secrets

Expected backend start command:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Expected frontend build command:

```text
npm ci && npm run build
```

Expected frontend publish directory:

```text
dist
```

Do not hard-code paid plan names unless explicitly requested. Render plan names and availability can change.

Do not add a persistent disk to the backend. PostgreSQL is the persistent storage layer.

Do not deploy, create cloud resources, or modify production data unless explicitly requested.

## Security and privacy

This is an anonymous or pseudonymous survey, not an identity platform.

Requirements:

- Do not collect names or email addresses by default
- Minimize stored data
- Use HTTPS in production
- Keep database access private
- Protect result-export endpoints
- Validate all input on the backend
- Use parameterized SQLAlchemy statements
- Keep dependencies updated through deliberate changes
- Do not expose stack traces in production
- Do not trust client-supplied participant identity without validation
- Do not log secrets or tokens
- Do not place secrets in frontend code
- Do not create public endpoints that list all responses

A UUID is pseudonymous, not anonymous in every legal context. Avoid making legal or compliance claims in code or documentation unless reviewed by an appropriate expert.

## Scope control

Do not add these unless explicitly requested or justified by a measured need:

- Docker
- Kubernetes
- Redis
- Celery
- Kafka
- WebSockets
- GraphQL
- Microservices
- Generic CRUD frameworks
- Complex domain-driven design abstractions
- Multiple database replicas
- A full admin dashboard
- Social login
- Participant accounts
- Real-time analytics infrastructure

The first production version should remain a small, understandable monorepo.

A protected CSV export endpoint is sufficient for organizer access unless a separate results application is explicitly requested.

## Implementation order

When building the project from an empty repository, use this sequence:

1. Create the monorepo structure.
2. Configure backend settings, logging, database engine, and request-scoped async sessions.
3. Create SQLAlchemy models.
4. Create the initial Alembic migration.
5. Implement participant token signing and participant creation.
6. Implement active-question retrieval.
7. Implement response validation and PostgreSQL upsert.
8. Implement protected CSV export.
9. Add backend tests.
10. Create the React/Vite frontend.
11. Implement the coordinate selector and normalization tests.
12. Connect the frontend to the backend.
13. Add complete error, loading, retry, and success states.
14. Add `render.yaml`.
15. Add an end-to-end test.
16. Add and run a 200-to-300-participant load test.
17. Update README setup and deployment instructions.

Integrate frontend and backend early. Do not build both in isolation and postpone API integration until the end.

## Coding conventions

### Python

- Use complete type annotations
- Prefer clear names over abbreviations
- Use timezone-aware UTC datetimes
- Keep functions focused
- Avoid mutable default arguments
- Use explicit imports
- Prefer typed dependencies with `Annotated`
- Keep side effects out of module import where practical
- Use SQLAlchemy 2.x statement style
- Avoid unnecessary inheritance
- Add docstrings where behavior is not obvious
- Keep public API schemas explicit

### TypeScript

- Enable strict TypeScript settings
- Avoid `any`
- Use typed API request and response models
- Keep coordinate calculations pure
- Keep components focused
- Prefer explicit state transitions
- Handle aborts and component unmounts for requests where relevant
- Do not suppress type errors without a documented reason

### General

- Use UTF-8
- Keep line endings consistent
- Keep changes small and focused
- Avoid unrelated refactoring
- Update tests when behavior changes
- Update documentation when setup, commands, environment variables, endpoints, or deployment behavior changes
- Do not create Git commits unless explicitly requested

## Working procedure for Codex

For each task:

1. Read the applicable `AGENTS.md`.
2. Inspect relevant existing files and tests.
3. State the intended change briefly.
4. Implement the smallest complete solution.
5. Add or update tests.
6. Run relevant formatting, linting, typing, tests, and builds.
7. Review the diff for accidental changes and secrets.
8. Summarize:
   - Files changed
   - Behavior implemented
   - Commands run
   - Test results
   - Remaining risks or unresolved issues

When information is missing, prefer conservative assumptions that match this file and document them. Ask a question only when the missing decision materially changes the architecture, data model, security, or user-visible behavior.

## Definition of done

A task is complete only when:

- The requested behavior is implemented
- Architecture boundaries are respected
- Relevant tests are added or updated
- Relevant tests pass
- Ruff checks pass for backend changes
- Mypy passes for backend changes
- Frontend linting passes for frontend changes
- Frontend tests pass for frontend changes
- The frontend production build succeeds for frontend changes
- Alembic migrations are included for schema changes
- Migration checks pass where applicable
- No secrets or production credentials are committed
- Documentation reflects changed setup or behavior
- The final summary truthfully reports any checks that were not run
