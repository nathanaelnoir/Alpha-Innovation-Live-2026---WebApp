# Conference survey

Anonymous, interactive two-dimensional conference survey. The project is being
built incrementally as two applications: a FastAPI/PostgreSQL backend and a
React/Vite frontend.

## Run locally in this workspace

The dependencies, ignored development environment files, and workspace-local
PostgreSQL runtime are already present here. Start the complete application from
the repository root with:

```bash
scripts/local-dev
```

Then open:

- Participant survey: <http://localhost:5173>
- Organizer dashboard: <http://localhost:5173/admin>
- API documentation: <http://localhost:8000/docs>

The organizer dashboard uses the local-only `RESULTS_EXPORT_TOKEN` in
`backend/.env`. The launcher starts PostgreSQL when necessary, applies every
Alembic migration, and runs the frontend and backend together. `Ctrl-C` stops
both application processes; the local database continues running so responses
remain available. Stop it separately with `backend/scripts/local-postgres stop`.

## Current implementation

The repository contains a FastAPI/PostgreSQL backend and a mobile-first
React/Vite participant frontend. The backend includes configuration, structured
logging, request-scoped asynchronous SQLAlchemy sessions, Alembic migrations,
pseudonymous participant tokens, response upserts, and protected CSV export.

The participant interface creates and saves a pseudonymous identity in browser
local storage, loads the open session, and advances through that session's
ordered questions independently in each browser. It supports touch, pen, mouse,
and keyboard response selection. A compact header control switches the full
participant experience between English, German, and Italian and remembers the
selection locally. Accepted answers remain in PostgreSQL, while the current
session progress is stored locally in the participant's browser.
It does not display or collect names, contact details, or participant tokens.

While the page is visible, it checks for question changes every 5–7 seconds
while a session is active and every 15–17 seconds while waiting. The randomized
delay prevents all participant browsers from polling simultaneously. Polling
pauses in hidden tabs and resumes immediately when the tab becomes visible.

Available endpoints:

- `GET /health`
- `POST /api/v1/participants`
- `GET /api/v1/sessions/active`
- `GET /api/v1/sessions` (organizer Bearer token required)
- `POST /api/v1/sessions` (organizer Bearer token required)
- `PUT /api/v1/sessions/{session_id}/open` (organizer token required)
- `PUT /api/v1/sessions/{session_id}/close` (organizer token required)
- `DELETE /api/v1/sessions/{session_id}` (organizer token required)
- `GET /api/v1/questions/active`
- `GET /api/v1/questions` (organizer Bearer token required)
- `POST /api/v1/questions` (organizer Bearer token required)
- `PUT /api/v1/questions/{question_id}/activate` (legacy session-open alias)
- `PUT /api/v1/questions/{question_id}/close` (legacy session-close alias)
- `DELETE /api/v1/questions/{question_id}` (organizer token required)
- `PUT /api/v1/questions/{question_id}/response`
- `GET /api/v1/results.csv` (organizer Bearer token required)
- `DELETE /api/v1/admin/collected-data` (organizer token required)

The results download uses semicolons as its CSV delimiter so it opens into
separate columns in Excel installations that use European regional settings.
It exports readable session titles and question text instead of their internal
IDs. Normalized coordinates are accompanied by shortened axis labels and the
same rounded percentage values shown in the participant frontend.

Participant tokens contain only a versioned, HMAC-signed UUID. They are not
logged or intended to represent a person's real identity.

Response submission uses `Authorization: Bearer <participant token>` and a JSON
body containing normalized `x` and `y` values between `0` and `1`. Repeating a
submission for the same participant and question updates the existing response,
so a client may safely retry after a network failure.

The frontend presents a four-quadrant plane centered at visual `(0, 0)` while
the API continues to store normalized coordinates. The conversion is
`display_x = 2 * x - 1` and `display_y = 2 * y - 1`; therefore normalized
`(0.5, 0.5)` is the visual origin.

The graph is rendered responsively and can be a different pixel size on each
device. Pointer coordinates are calculated against the graph's current bounding
rectangle and immediately normalized to `[0, 1]`; bottom-left is `(0, 0)` and
top-right is `(1, 1)`. Screen pixels are never sent to the API.

### Initial session

Alembic revision `20260803_0002` seeds this question:

- Prompt: “How are you experiencing this session right now?”
- X axis: “Engagement (low to high)”
- Y axis: “Understanding (low to high)”

Migration `20260805_0003` places existing questions into an `Initial session`
in their creation order. If a question was active before migration, that session
remains open so existing participant links continue to work.

### Event session flow

Create a session, add its ordered questions, and then open it. Every participant
starts at the first locally unanswered question and advances only after the API
confirms that the current answer was stored. After the last question, that
browser shows the transmission-complete page. Closing the session preserves all
accepted responses and moves participant pages into the waiting state. Opening
a later session starts fresh. Reopening the same session also creates a new run
UUID, so every browser restarts at question one and earlier run responses remain
linked to that participant. A new answer to the same question overwrites the
earlier answer. The pseudonymous participant UUID itself does not change.

All organizer commands use the secret configured as `RESULTS_EXPORT_TOKEN`:

```bash
curl -X POST http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer $RESULTS_EXPORT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Morning keynote"}'

curl -X POST http://localhost:8000/api/v1/questions \
  -H "Authorization: Bearer $RESULTS_EXPORT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID","position":1,"prompt":"How do you feel before the keynote?","prompt_de":"Wie fühlen Sie sich vor der Keynote?","prompt_it":"Come si sente prima del keynote?"}'

curl -X PUT http://localhost:8000/api/v1/sessions/SESSION_ID/open \
  -H "Authorization: Bearer $RESULTS_EXPORT_TOKEN"

curl -X PUT http://localhost:8000/api/v1/sessions/SESSION_ID/close \
  -H "Authorization: Bearer $RESULTS_EXPORT_TOKEN"
```

Questions cannot be added while their session is open, and an empty session
cannot be opened. Opening one session atomically closes any previous session.
English question text and labels use `prompt`, `x_axis_label`, and
`y_axis_label`. Optional German translations use the `_de` suffix and Italian
translations use `_it`; active-question and active-session responses return all
three languages.

### Organizer dashboard

Open `/admin` on the frontend origin and enter `RESULTS_EXPORT_TOKEN`. The token
is held only in the current page's memory. The dashboard can create sessions,
add ordered questions to closed sessions, open or close sessions, refresh state,
download the protected CSV export, and permanently delete closed sessions or
questions with confirmation. Deleting a question also deletes its responses;
deleting a session deletes its questions and their responses.

The dashboard danger zone can wipe all collected responses and pseudonymous
participant UUIDs while preserving sessions and questions. Every session must
be closed, and the organizer must type `WIPE DATA` and accept a final warning.
Export the CSV first if the data must be retained. Browsers whose participant
identity was wiped automatically obtain a fresh pseudonymous identity when they
next attempt to submit.

### Backend setup

Python 3.12 or newer and PostgreSQL are required.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

The development database URL in `.env.example` assumes a local PostgreSQL
database named `conference_survey`. Replace its placeholder credentials for
your local installation. Production refuses to start unless both token secrets
are configured.

### Checks

```bash
scripts/check
```

The root check script runs Ruff, formatting, Mypy, all backend tests against the
isolated PostgreSQL test database, the migration drift check, ESLint, all
frontend tests, and the Vite production build. Backend integration tests apply
pending migrations to the `_test` database before executing.

Persistence and migration execution require a real PostgreSQL database. The
integration tests use `TEST_DATABASE_URL`; SQLite is not used as a substitute.

Run the PostgreSQL integration suite with an explicitly isolated test database:

```bash
TEST_DATABASE_URL=postgresql+psycopg://lab@127.0.0.1:55432/conference_survey_test pytest
```

The integration fixture refuses database names that do not end in `_test` and
automatically runs `alembic upgrade head` against that isolated database.

### Workspace-local PostgreSQL

This development workspace currently has a user-owned PostgreSQL 18 cluster;
its runtime and data are ignored by Git. It listens only on
`127.0.0.1:55432` and contains separate `conference_survey` and
`conference_survey_test` databases.

```bash
cd backend
scripts/local-postgres status
scripts/local-postgres start
scripts/local-postgres stop
```

The ignored `backend/.env` points the API at the development database and holds
generated local-only secrets. Do not reuse those secrets in deployment.

### Frontend setup

Node.js 20.19 or newer is required by the current Vite toolchain. Start the API
on port 8000, then run:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

`VITE_API_BASE_URL` is the only frontend environment variable. It must point to
the backend origin and must never contain credentials or secrets. The backend's
`FRONTEND_ORIGIN` must exactly match the browser origin (the local default is
`http://localhost:5173`).

For local development, leave `VITE_API_BASE_URL` empty. Vite proxies `/api`
requests to FastAPI on `127.0.0.1:8000`, which also allows a temporary frontend
ngrok tunnel to reach the local backend through the same public origin. A
production static build must set `VITE_API_BASE_URL` to the deployed backend
origin because the Vite development proxy is not present in production.

Run the frontend quality checks with:

```bash
cd frontend
npm run lint
npm run test
npm run build
```

## End-to-end and burst verification

With `scripts/local-dev` running in another terminal, verify a complete API
happy path (health check, organizer setup, participant creation, idempotent
response retry, CSV export, and session close):

```bash
cd backend
.venv/bin/python scripts/verify-live.py
```

Run the repeatable conference-size burst with 250 independently created
participants and up to 50 concurrent flows:

```bash
cd backend
.venv/bin/python scripts/verify-live.py --participants 250 --concurrency 50
```

The command fails unless every accepted participant has exactly one matching
CSV row after retrying the same response. It creates uniquely named verification
data, closes its session, and restores the previously open session after success;
stored responses intentionally remain in PostgreSQL. Reopening a prior session
starts a new survey run, so use this only against local or staging data—not
during a live event.

Last verified in this workspace on 2026-08-15:

- `.venv/bin/python scripts/verify-live.py`: 1 participant passed.
- `.venv/bin/python scripts/verify-live.py --participants 250 --concurrency 50`:
  250 unique responses, idempotent retries, and 250 matching CSV rows passed.

## Deploy on Render

The root [`render.yaml`](render.yaml) is a Render Blueprint for three resources:

- `conference-survey-web`: a Vite static site rooted at `frontend/`
- `conference-survey-api`: a native Python web service rooted at `backend/`
- `conference-survey-db`: private managed PostgreSQL in the same Frankfurt region

The Blueprint builds each application independently, runs `alembic upgrade head`
when the single-instance free backend starts, configures `/health`, generates
both application secrets, connects the backend to PostgreSQL's internal URL,
connects each public service URL to the other, and rewrites frontend routes so
`/admin` works on a static host. No database credentials or application secrets
are committed.

To deploy:

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Render, create a new Blueprint and select the repository.
3. Review the three resources and apply the Blueprint.
4. After deployment, open the backend service's environment settings and copy
   the generated `RESULTS_EXPORT_TOKEN` for organizer use. Do not expose it to
   participants or add it to any `VITE_` variable.
5. Open the frontend URL and verify both `/` and `/admin`; check the backend URL
   at `/health` and `/docs`.

The backend and database are explicitly pinned to Render's Free instance types;
the static frontend is also free. Review Render's current limits before creating
the resources. In particular, free PostgreSQL expires after 30 days and has no
backups, and a free backend sleeps after 15 idle minutes. Upgrade both resources
before using this for a real conference. The database blocks direct public
connections; use Render's private network through the backend for normal
operation.
