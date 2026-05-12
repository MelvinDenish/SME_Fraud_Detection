"""Shared async dependencies: Neo4j driver lifecycle, request context."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from neo4j import AsyncDriver, AsyncGraphDatabase

from backend.app.config import get_settings


_driver: AsyncDriver | None = None


async def _connect_neo4j() -> AsyncDriver:
    settings = get_settings()
    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
        max_connection_pool_size=50,
    )
    await driver.verify_connectivity()
    return driver


def get_driver() -> AsyncDriver:
    if _driver is None:
        raise RuntimeError("Neo4j driver not initialised. Call inside an async lifespan.")
    return _driver


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan — open Neo4j driver on startup, close on shutdown."""
    global _driver
    _driver = await _connect_neo4j()
    try:
        yield
    finally:
        if _driver is not None:
            await _driver.close()
            _driver = None
