class ApplicationError(Exception):
    """Base class for expected application failures."""


class InvalidParticipantTokenError(ApplicationError):
    """The participant token is malformed or has an invalid signature."""


class ParticipantTokenConfigurationError(ApplicationError):
    """Participant token signing is not configured securely."""


class ParticipantPersistenceError(ApplicationError):
    """A participant could not be durably stored."""


class ParticipantNotFoundError(ApplicationError):
    """The signed participant no longer exists."""


class ActiveQuestionNotFoundError(ApplicationError):
    """No active question is currently available."""


class QuestionNotFoundError(ApplicationError):
    """The requested question does not exist."""


class QuestionRetrievalError(ApplicationError):
    """The active question could not be safely retrieved."""


class QuestionListRetrievalError(ApplicationError):
    """The organizer question list could not be safely retrieved."""


class QuestionNotActiveError(ApplicationError):
    """The requested question is not active for submissions."""


class ResponsePersistenceError(ApplicationError):
    """A survey response could not be durably stored."""


class UnauthorizedResultsAccessError(ApplicationError):
    """The results export credential is missing or invalid."""


class ResultsTokenConfigurationError(ApplicationError):
    """Results export authentication is not configured securely."""


class ResultsExportError(ApplicationError):
    """Stored survey responses could not be exported."""


class UnauthorizedOrganizerAccessError(ApplicationError):
    """The organizer credential is missing or invalid."""


class OrganizerTokenConfigurationError(ApplicationError):
    """Organizer authentication is not configured securely."""


class QuestionPersistenceError(ApplicationError):
    """A question change could not be durably stored."""


class ActiveSessionNotFoundError(ApplicationError):
    """No survey session is currently open."""


class SurveySessionNotFoundError(ApplicationError):
    """The requested survey session does not exist."""


class EmptySurveySessionError(ApplicationError):
    """A session without questions cannot be opened."""


class SurveySessionNotEditableError(ApplicationError):
    """Questions cannot be added to an open survey session."""


class SurveySessionDeletionConflictError(ApplicationError):
    """An open survey session or one of its questions cannot be deleted."""


class SurveySessionRetrievalError(ApplicationError):
    """Survey session data could not be retrieved."""


class SurveySessionPersistenceError(ApplicationError):
    """A survey session change could not be durably stored."""


class CollectedDataWipeConflictError(ApplicationError):
    """Collected data cannot be wiped while a survey session is open."""


class CollectedDataPersistenceError(ApplicationError):
    """Collected participant data could not be deleted safely."""
