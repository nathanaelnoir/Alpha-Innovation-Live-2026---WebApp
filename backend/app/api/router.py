from fastapi import APIRouter

from app.api.routes.admin_data import router as admin_data_router
from app.api.routes.health import router as health_router
from app.api.routes.participants import router as participants_router
from app.api.routes.questions import router as questions_router
from app.api.routes.responses import router as responses_router
from app.api.routes.results import router as results_router
from app.api.routes.survey_sessions import router as survey_sessions_router

router = APIRouter()
router.include_router(health_router)
router.include_router(admin_data_router, prefix="/api/v1")
router.include_router(participants_router, prefix="/api/v1")
router.include_router(survey_sessions_router, prefix="/api/v1")
router.include_router(questions_router, prefix="/api/v1")
router.include_router(responses_router, prefix="/api/v1")
router.include_router(results_router, prefix="/api/v1")
