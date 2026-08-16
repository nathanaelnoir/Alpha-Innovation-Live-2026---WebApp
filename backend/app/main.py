from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.docs import API_DESCRIPTION, OPENAPI_TAGS, SWAGGER_UI_PARAMETERS
from app.api.exception_handlers import register_exception_handlers
from app.api.router import router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.session import create_database_engine, create_session_factory


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    expose_api_docs = app_settings.app_env != "production"
    allowed_origins = [str(app_settings.frontend_origin).rstrip("/")]
    if app_settings.presentation_origin is not None:
        allowed_origins.append(str(app_settings.presentation_origin).rstrip("/"))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        configure_logging(app_settings.log_level)
        engine = create_database_engine(app_settings)
        app.state.session_factory = create_session_factory(engine)
        try:
            yield
        finally:
            await engine.dispose()

    application = FastAPI(
        title="Conference Survey API",
        summary="Pseudonymous two-dimensional audience survey",
        description=API_DESCRIPTION,
        version="0.1.0",
        openapi_tags=OPENAPI_TAGS,
        swagger_ui_parameters=SWAGGER_UI_PARAMETERS,
        openapi_url="/openapi.json" if expose_api_docs else None,
        docs_url="/docs" if expose_api_docs else None,
        redoc_url="/redoc" if expose_api_docs else None,
        lifespan=lifespan,
    )
    application.state.settings = app_settings
    application.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_exception_handlers(application)
    application.include_router(router)
    return application


app = create_app()
