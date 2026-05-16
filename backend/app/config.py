from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["dev", "staging", "prod"] = "dev"
    log_level: str = "INFO"
    timezone: str = "Asia/Kolkata"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    jwt_secret: str = Field(default="dev-only-not-for-production")
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24
    rate_limit_per_min: int = 10

    # PRD §10 Day 24 — CORS lockdown. Comma-separated origin list; defaults
    # cover the Vite dev server. Production override via CORS_ALLOWED_ORIGINS.
    cors_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "sentinel_dev_pwd"
    neo4j_database: str = "neo4j"

    gemini_api_key: str = "PLACEHOLDER_GEMINI_API_KEY"
    gemini_model: str = "gemini-1.5-flash"

    mca21_api_key: str = "PLACEHOLDER_MCA21_KEY"
    cersai_api_key: str = "PLACEHOLDER_CERSAI_KEY"
    bse_sme_api_key: str = "PLACEHOLDER_BSE_KEY"

    # PRD §10 free-source plan, Phase A — MCA Public Portal scraper.
    # Replaces both paid MCA21 V3 and CERSAI with free Playwright scraping
    # of mca.gov.in. The session-dir holds the captcha-bootstrap cookies;
    # gitignored so they never leak into a commit. See docs/INGEST_MCA_PUBLIC.md.
    mca_public_session_dir: str = "./.mca_session"

    # PRD §10 Day 20 — live source-side polling. asyncio.create_task pattern
    # (PRD §2.1 compliant). Disabled in tests to keep them deterministic.
    scheduler_enabled: bool = True
    scheduler_mca21_refresh_sec: int = 86_400      # 24h
    scheduler_cersai_refresh_sec: int = 86_400     # 24h
    scheduler_nclt_poll_sec: int = 86_400          # 24h
    scheduler_wilful_poll_sec: int = 30 * 86_400   # 30 days (PRD: "Monthly refresh")
    scheduler_shared_attr_sec: int = 3_600         # 1h


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
