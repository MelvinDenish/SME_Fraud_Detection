"""Sentinel-G FastAPI entrypoint. PRD §10 Day 1 — Done when /health returns 200 and gds.version() works."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app import __version__
from backend.app.api.analyse import router as analyse_router
from backend.app.api.report import router as report_router
from backend.app.api.upload import router as upload_router
from backend.app.auth.routes import router as auth_router
from backend.app.config import get_settings
from backend.app.deps import get_driver, lifespan
from backend.app.middleware.rate_limit import RateLimitMiddleware


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Sentinel-G API",
        version=__version__,
        description="SME Financial Fraud Detection — HackHazards '26",
        lifespan=lifespan,
    )

    # PRD §10 Day 24 — settings-driven origin list (no wildcards, no
    # automatic localhost-in-prod). `CORS_ALLOWED_ORIGINS` env var picks
    # up the Vercel preview/prod URLs in deployed environments.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Report-Id"],
    )

    # PRD §10 Day 24 — 10 req/min per JWT (per-IP fallback for anonymous
    # requests). Returns 429 with Retry-After on breach.
    app.add_middleware(RateLimitMiddleware, limit_per_min=settings.rate_limit_per_min)

    app.include_router(auth_router)
    app.include_router(analyse_router)
    app.include_router(upload_router)
    app.include_router(report_router)

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__, "env": settings.app_env}

    @app.get("/health/neo4j", tags=["meta"])
    async def neo4j_health() -> dict[str, object]:
        """Verifies the Neo4j driver is up and GDS plugin is loaded (PRD §10 Day 1 acceptance)."""
        driver = get_driver()
        async with driver.session(database=settings.neo4j_database) as session:
            result = await session.run("RETURN 1 AS ok")
            ok_record = await result.single()

            gds_result = await session.run("CALL gds.version() YIELD gdsVersion RETURN gdsVersion")
            gds_record = await gds_result.single()

        return {
            "neo4j_reachable": bool(ok_record and ok_record["ok"] == 1),
            "gds_version": gds_record["gdsVersion"] if gds_record else None,
        }

    return app


app = create_app()
