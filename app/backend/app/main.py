import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.metrics import setup_metrics
from app.routers import health, tasks


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    # Interactive docs expose the full API surface, so they are off in production.
    app = FastAPI(
        title="TaskBoard API",
        version="0.1.0",
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )

    # No origins configured means no CORS headers at all. The frontend is served
    # from the same origin as /api, so cross-origin access is opt-in.
    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Content-Type"],
        )

    app.include_router(health.router, prefix="/api")
    app.include_router(tasks.router, prefix="/api")
    setup_metrics(app)
    return app


app = create_app()
