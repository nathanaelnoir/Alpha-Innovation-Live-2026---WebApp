API_DESCRIPTION = """
## Anonymous coordinate survey

This API powers an interactive conference survey where participants answer the
currently active question by placing a point in a normalized two-dimensional
coordinate system.

### Typical participant flow

1. Create a pseudonymous participant with `POST /api/v1/participants`.
2. Store the returned participant token locally. It is shown only once.
3. Load the open session and its ordered questions with
   `GET /api/v1/sessions/active`.
4. Keep completed question IDs locally and submit each normalized coordinate with
   `PUT /api/v1/questions/{question_id}/response`.

The interface is a four-quadrant plane centered visually at `(0, 0)`. The API
stores that plane in normalized form: bottom-left is `(0, 0)`, the visual origin
is `(0.5, 0.5)`, and top-right is `(1, 1)`. Display values are recovered with
`display_x = 2 * x - 1` and `display_y = 2 * y - 1`.

Response submission is idempotent: retrying for the same participant and
question updates the existing point instead of creating a duplicate.

Organizer deletion endpoints are irreversible. Sessions must be closed before
their questions or associated responses can be deleted. The collected-data wipe
also requires every session to be closed and preserves the session and question
configuration.

### Authentication and privacy

Response submission uses the participant token as a Bearer token. Select
**Authorize** and paste the token returned by participant creation. The API does
not request names, email addresses, or other direct personal details.
"""


OPENAPI_TAGS = [
    {
        "name": "Participants",
        "description": (
            "Create a pseudonymous survey identity and receive its signed token."
        ),
    },
    {
        "name": "Sessions",
        "description": (
            "Load the open session or manage session boundaries with organizer access."
        ),
    },
    {
        "name": "Questions",
        "description": (
            "Retrieve the active question or manage questions with organizer access."
        ),
    },
    {
        "name": "Responses",
        "description": (
            "Submit or update one normalized coordinate response per question."
        ),
    },
    {
        "name": "Results",
        "description": "Organizer-only export of stored survey responses.",
    },
    {
        "name": "Organizer",
        "description": "Protected destructive data-retention operations.",
    },
    {
        "name": "Operations",
        "description": "Lightweight process-health information for deployment checks.",
    },
]


SWAGGER_UI_PARAMETERS = {
    "deepLinking": True,
    "displayRequestDuration": True,
    "docExpansion": "list",
    "filter": True,
    "operationsSorter": "method",
    "persistAuthorization": False,
    "syntaxHighlight.theme": "agate",
    "tagsSorter": "alpha",
    "tryItOutEnabled": True,
}
