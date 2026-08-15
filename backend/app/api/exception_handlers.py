from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    ActiveQuestionNotFoundError,
    ActiveSessionNotFoundError,
    CollectedDataPersistenceError,
    CollectedDataWipeConflictError,
    EmptySurveySessionError,
    InvalidParticipantTokenError,
    OrganizerTokenConfigurationError,
    ParticipantNotFoundError,
    ParticipantPersistenceError,
    ParticipantTokenConfigurationError,
    QuestionListRetrievalError,
    QuestionNotActiveError,
    QuestionNotFoundError,
    QuestionPersistenceError,
    QuestionRetrievalError,
    ResponsePersistenceError,
    ResultsExportError,
    ResultsTokenConfigurationError,
    SurveySessionDeletionConflictError,
    SurveySessionNotEditableError,
    SurveySessionNotFoundError,
    SurveySessionPersistenceError,
    SurveySessionRetrievalError,
    UnauthorizedOrganizerAccessError,
    UnauthorizedResultsAccessError,
)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ActiveSessionNotFoundError)
    async def active_session_not_found_error(
        _request: Request, _error: ActiveSessionNotFoundError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_404_NOT_FOUND,
            "active_session_not_found",
            "There is no open session right now.",
        )

    @app.exception_handler(SurveySessionNotFoundError)
    async def survey_session_not_found_error(
        _request: Request, _error: SurveySessionNotFoundError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_404_NOT_FOUND,
            "session_not_found",
            "The requested session does not exist.",
        )

    @app.exception_handler(EmptySurveySessionError)
    async def empty_survey_session_error(
        _request: Request, _error: EmptySurveySessionError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_409_CONFLICT,
            "empty_session",
            "Add at least one question before opening this session.",
        )

    @app.exception_handler(SurveySessionNotEditableError)
    async def survey_session_not_editable_error(
        _request: Request, _error: SurveySessionNotEditableError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_409_CONFLICT,
            "session_not_editable",
            "Close the session before adding questions.",
        )

    @app.exception_handler(SurveySessionDeletionConflictError)
    async def survey_session_deletion_conflict_error(
        _request: Request, _error: SurveySessionDeletionConflictError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_409_CONFLICT,
            "session_deletion_conflict",
            "Close the session before deleting it or any of its questions.",
        )

    @app.exception_handler(CollectedDataWipeConflictError)
    async def collected_data_wipe_conflict_error(
        _request: Request, _error: CollectedDataWipeConflictError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_409_CONFLICT,
            "collected_data_wipe_conflict",
            "Close the active session before wiping collected participant data.",
        )

    @app.exception_handler(CollectedDataPersistenceError)
    async def collected_data_persistence_error(
        _request: Request, _error: CollectedDataPersistenceError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "collected_data_wipe_failed",
            "Collected participant data could not be wiped. Please try again.",
        )

    @app.exception_handler(SurveySessionRetrievalError)
    async def survey_session_retrieval_error(
        _request: Request, _error: SurveySessionRetrievalError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "sessions_unavailable",
            "Session information could not be loaded. Please try again.",
        )

    @app.exception_handler(SurveySessionPersistenceError)
    async def survey_session_persistence_error(
        _request: Request, _error: SurveySessionPersistenceError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "session_persistence_failed",
            "The session change could not be saved. Please try again.",
        )

    @app.exception_handler(ParticipantPersistenceError)
    async def participant_persistence_error(
        _request: Request, _error: ParticipantPersistenceError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "participant_persistence_failed",
            "The participant could not be created. Please try again.",
        )

    @app.exception_handler(ParticipantTokenConfigurationError)
    async def participant_token_configuration_error(
        _request: Request, _error: ParticipantTokenConfigurationError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "participant_token_unavailable",
            "Participant authentication is temporarily unavailable.",
        )

    @app.exception_handler(ActiveQuestionNotFoundError)
    async def active_question_not_found_error(
        _request: Request, _error: ActiveQuestionNotFoundError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_404_NOT_FOUND,
            "active_question_not_found",
            "There is no active question right now.",
        )

    @app.exception_handler(QuestionRetrievalError)
    async def question_retrieval_error(
        _request: Request, _error: QuestionRetrievalError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "active_question_unavailable",
            "The active question could not be loaded. Please try again.",
        )

    @app.exception_handler(QuestionListRetrievalError)
    async def question_list_retrieval_error(
        _request: Request, _error: QuestionListRetrievalError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "questions_unavailable",
            "Questions could not be loaded. Please try again.",
        )

    @app.exception_handler(InvalidParticipantTokenError)
    async def invalid_participant_token_error(
        _request: Request, _error: InvalidParticipantTokenError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_401_UNAUTHORIZED,
            "invalid_participant_token",
            "A valid participant token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(ParticipantNotFoundError)
    async def participant_not_found_error(
        _request: Request, _error: ParticipantNotFoundError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_401_UNAUTHORIZED,
            "participant_not_found",
            "The participant token is no longer valid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(QuestionNotFoundError)
    async def question_not_found_error(
        _request: Request, _error: QuestionNotFoundError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_404_NOT_FOUND,
            "question_not_found",
            "The requested question does not exist.",
        )

    @app.exception_handler(QuestionNotActiveError)
    async def question_not_active_error(
        _request: Request, _error: QuestionNotActiveError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_409_CONFLICT,
            "question_not_active",
            "The requested question is not accepting responses.",
        )

    @app.exception_handler(ResponsePersistenceError)
    async def response_persistence_error(
        _request: Request, _error: ResponsePersistenceError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "response_persistence_failed",
            "The response could not be saved. Please try again.",
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_error(
        _request: Request, _error: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "validation_error",
            "The request contains invalid values.",
        )

    @app.exception_handler(UnauthorizedResultsAccessError)
    async def unauthorized_results_access_error(
        _request: Request, _error: UnauthorizedResultsAccessError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_401_UNAUTHORIZED,
            "unauthorized_results_access",
            "A valid organizer export token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(ResultsTokenConfigurationError)
    async def results_token_configuration_error(
        _request: Request, _error: ResultsTokenConfigurationError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "results_export_unavailable",
            "Results export is temporarily unavailable.",
        )

    @app.exception_handler(ResultsExportError)
    async def results_export_error(
        _request: Request, _error: ResultsExportError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "results_export_failed",
            "Results could not be exported. Please try again.",
        )

    @app.exception_handler(UnauthorizedOrganizerAccessError)
    async def unauthorized_organizer_access_error(
        _request: Request, _error: UnauthorizedOrganizerAccessError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_401_UNAUTHORIZED,
            "unauthorized_organizer_access",
            "A valid organizer token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(OrganizerTokenConfigurationError)
    async def organizer_token_configuration_error(
        _request: Request, _error: OrganizerTokenConfigurationError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "organizer_access_unavailable",
            "Organizer access is temporarily unavailable.",
        )

    @app.exception_handler(QuestionPersistenceError)
    async def question_persistence_error(
        _request: Request, _error: QuestionPersistenceError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "question_persistence_failed",
            "The question change could not be saved. Please try again.",
        )


def _error_response(
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )
