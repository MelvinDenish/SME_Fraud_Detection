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

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "sentinel_dev_pwd"
    neo4j_database: str = "neo4j"

    gemini_api_key: str = "PLACEHOLDER_GEMINI_API_KEY"
    gemini_model: str = "gemini-1.5-flash"

    mca21_api_key: str = "PLACEHOLDER_MCA21_KEY"
    cersai_api_key: str = "PLACEHOLDER_CERSAI_KEY"
    bse_sme_api_key: str = "PLACEHOLDER_BSE_KEY"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
