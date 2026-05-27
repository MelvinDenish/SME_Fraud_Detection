"""/companies — directory of `:Company` nodes already in Neo4j.

Backs the frontend Search page's "recently loaded" panel. Returns CIN +
name + state + registration year, sorted newest-first. Optionally filters
by state (e.g. `?state=TN`) and pages via `?limit=` / `?offset=`.

This endpoint is intentionally **read-only over Neo4j** — it does NOT
trigger live MCA Public Portal scrapes. The Search page uses it to show
the analyst what's already loaded; clicking a row routes to /analyse
which does the live work.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from neo4j import AsyncDriver
from pydantic import BaseModel, Field

from backend.app.auth.deps import get_current_user
from backend.app.config import get_settings
from backend.app.deps import get_driver

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanySummary(BaseModel):
    cin: str
    name: str | None = None
    state: str | None = None
    incorporation_year: int | None = None


class CompaniesPage(BaseModel):
    total: int = Field(..., description="Total `:Company` rows matching the filter")
    items: list[CompanySummary]


_LIST_CYPHER = """
MATCH (c:Company)
WHERE ($state IS NULL OR c.state = $state)
  AND c.incorporation_date IS NOT NULL
RETURN c.cin AS cin,
       c.name AS name,
       c.state AS state,
       c.incorporation_date AS incorporation_date
ORDER BY c.incorporation_date DESC, c.cin ASC
SKIP $offset
LIMIT $limit
"""

_COUNT_CYPHER = """
MATCH (c:Company)
WHERE $state IS NULL OR c.state = $state
RETURN count(c) AS total
"""


@router.get("", response_model=CompaniesPage)
async def list_companies(
    _user: Annotated[dict, Depends(get_current_user)],
    state: Annotated[str | None, Query(description="2-letter state code (e.g. TN)")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CompaniesPage:
    """Paginated directory of companies known to Neo4j."""
    driver: AsyncDriver = get_driver()
    settings = get_settings()
    async with driver.session(database=settings.neo4j_database) as session:
        count_res = await session.run(_COUNT_CYPHER, state=state)
        count_row = await count_res.single()
        total = int(count_row["total"]) if count_row else 0

        list_res = await session.run(
            _LIST_CYPHER, state=state, offset=offset, limit=limit,
        )
        items: list[CompanySummary] = []
        async for row in list_res:
            inc = row["incorporation_date"]
            year: int | None
            if inc is None:
                year = None
            elif hasattr(inc, "year"):  # neo4j.time.Date
                year = int(inc.year)
            else:
                year = None
            items.append(CompanySummary(
                cin=row["cin"],
                name=row.get("name"),
                state=row.get("state"),
                incorporation_year=year,
            ))
    return CompaniesPage(total=total, items=items)
