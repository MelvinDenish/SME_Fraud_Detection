"""RBI / CIBIL wilful defaulter list source (PRD §4.9 + §10 Day 5).

RBI publishes the 'Suspect List' and 'List of Wilful Defaulters' quarterly as
PDFs. CIBIL also maintains its own list. We aggregate both into WilfulDefaulter
nodes. Module 9 raises CRITICAL (force score >= 75) on any match.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator


SEED_ROOT = Path(__file__).resolve().parents[3] / "infra" / "seeds" / "wilful_defaulter"

_CIN_RE = re.compile(r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$")
_DIN_RE = re.compile(r"^\d{8}$")


class RawWilfulDefaulter(BaseModel):
    """One wilful defaulter declaration. PRD §3 keys verbatim."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    cin: str
    din: str | None = None  # Promoter DIN, when declared on an individual
    bank_name: str
    amount: float = Field(ge=0.0)
    declared_date: date
    source: str = "RBI"  # RBI | CIBIL | SUIT_FILED

    @field_validator("cin")
    @classmethod
    def _validate_cin(cls, v: str) -> str:
        if not _CIN_RE.match(v):
            raise ValueError(f"Invalid CIN: {v!r}")
        return v

    @field_validator("din")
    @classmethod
    def _validate_din(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not _DIN_RE.match(v):
            raise ValueError(f"Invalid DIN: {v!r}")
        return v


class WilfulDefaulterSource(Protocol):
    name: str

    async def fetch_all(self) -> list[RawWilfulDefaulter]: ...


class WilfulDefaulterFixtureSource:
    """Reads wilful defaulter declarations from infra/seeds/wilful_defaulter/*.json."""

    name = "wilful_fixture"

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or SEED_ROOT

    async def fetch_all(self) -> list[RawWilfulDefaulter]:
        if not self.root.exists():
            return []
        records: list[RawWilfulDefaulter] = []
        for path in sorted(self.root.glob("*.json")):
            raw = json.loads(path.read_text(encoding="utf-8"))
            for row in raw:
                records.append(RawWilfulDefaulter.model_validate(row))
        return records


class RBIWilfulScraper:
    """Real RBI suspect/wilful-defaulter list scraper. Day 7+ task.

    RBI uploads the list as PDFs. We pdfplumber-parse them and dedupe with the
    CIBIL public list. Monthly refresh sufficient.
    """

    name = "rbi_wilful_scraper"

    async def fetch_all(self) -> list[RawWilfulDefaulter]:
        raise NotImplementedError("RBIWilfulScraper — Day 7+ task")
