"""NCLT proceedings source (PRD §4.9 + §10 Day 5).

NCLT publishes daily cause lists at https://nclt.gov.in. We scrape company-as-
respondent rows and write NCLTProceeding nodes. Module 9 raises CRITICAL (force
score >= 75) when a Company has an admitted CIRP proceeding.

Two implementations:
  NCLTFixtureSource  — reads infra/seeds/nclt/*.json. Default working path.
  NCLTScraper        — BeautifulSoup scraper for the cause-list HTML; Day 7+ task.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator


SEED_ROOT = Path(__file__).resolve().parents[3] / "infra" / "seeds" / "nclt"

_CIN_RE = re.compile(r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$")


class RawNCLTProceeding(BaseModel):
    """One NCLT proceeding. PRD §3 keys: case_number, cin, petition_type, ..."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    case_number: str
    cin: str
    petition_type: Literal["CIRP", "winding_up", "DRT", "other"] = "other"
    filing_date: date
    status: Literal["filed", "admitted", "withdrawn", "disposed", "in_progress"] = "filed"
    amount_claimed: float = Field(default=0.0, ge=0.0)
    bench: str | None = None  # e.g. "NCLT Mumbai"

    @field_validator("cin")
    @classmethod
    def _validate_cin(cls, v: str) -> str:
        if not _CIN_RE.match(v):
            raise ValueError(f"Invalid CIN: {v!r}")
        return v


class NCLTSource(Protocol):
    name: str

    async def fetch_all(self) -> list[RawNCLTProceeding]: ...

    async def fetch_for_cin(self, cin: str) -> list[RawNCLTProceeding]: ...


class NCLTFixtureSource:
    """Reads NCLT proceedings from infra/seeds/nclt/*.json."""

    name = "nclt_fixture"

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or SEED_ROOT

    async def fetch_all(self) -> list[RawNCLTProceeding]:
        if not self.root.exists():
            return []
        proceedings: list[RawNCLTProceeding] = []
        for path in sorted(self.root.glob("*.json")):
            raw = json.loads(path.read_text(encoding="utf-8"))
            for row in raw:
                proceedings.append(RawNCLTProceeding.model_validate(row))
        return proceedings

    async def fetch_for_cin(self, cin: str) -> list[RawNCLTProceeding]:
        return [p for p in await self.fetch_all() if p.cin == cin]


class NCLTScraper:
    """Real NCLT cause-list scraper. Day 7+ task.

    nclt.gov.in publishes daily cause lists as HTML tables (one per bench).
    BeautifulSoup + a small NIC-bench mapping does the job once we have
    credentials. Wired up via the playwright MCP server because the bench
    selection page is partly JS-rendered.
    """

    name = "nclt_scraper"

    async def fetch_all(self) -> list[RawNCLTProceeding]:
        raise NotImplementedError("NCLTScraper — Day 7+ task")

    async def fetch_for_cin(self, cin: str) -> list[RawNCLTProceeding]:
        raise NotImplementedError("NCLTScraper — Day 7+ task")
