"""Company data sources.

Protocol:    CompanySource — async fetch_bundle(cin) -> CompanyBundle | None
Implementations:
  FixtureSource    — reads infra/seeds/companies/*.json. Default, works without keys.
  MCA21V3Source    — real MCA21 V3 REST client (needs MCA21_API_KEY). Stub for now.
  CERSAIScraper    — Playwright-based scraper for CERSAI charge data. Stub for now.

PRD §10 Day 7+ uses MCA21V3Source. Days 3–6 use FixtureSource (PRD Day 6 itself
hand-codes IL&FS FY2014-18 from the SFIO report into JSON — same pattern).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol

import httpx
from pydantic import ValidationError

from backend.app.config import get_settings
from backend.app.ingest.schemas import CompanyBundle


SEED_ROOT = Path(__file__).resolve().parents[3] / "infra" / "seeds" / "companies"


class CompanySource(Protocol):
    """Async source for one company's bundle."""

    name: str

    async def fetch_bundle(self, cin: str) -> CompanyBundle | None: ...

    async def list_available_cins(self) -> list[str]: ...


# --- Fixture source ---------------------------------------------------------
class FixtureSource:
    """Reads pre-built CompanyBundle JSONs from infra/seeds/companies/.

    File layout: infra/seeds/companies/<CIN>.json — one bundle per file.
    """

    name = "fixture"

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or SEED_ROOT

    async def fetch_bundle(self, cin: str) -> CompanyBundle | None:
        path = self.root / f"{cin}.json"
        if not path.exists():
            return None
        raw = json.loads(path.read_text(encoding="utf-8"))
        try:
            return CompanyBundle.model_validate(raw)
        except ValidationError:
            # Re-raise — the pipeline will catch and emit a DataQualityError.
            raise

    async def list_available_cins(self) -> list[str]:
        if not self.root.exists():
            return []
        return sorted(p.stem for p in self.root.glob("*.json"))


# --- MCA21 V3 REST stub -----------------------------------------------------
class MCA21V3Source:
    """Real MCA21 V3 REST API client.

    Auth: paid V3 key delivered after registering with MCA. Until the key is
    provisioned, fetch_bundle raises NotImplementedError. The interface (and the
    httpx client wiring) is in place so we can drop the real implementation in
    on Day 7 without churning the pipeline.
    """

    name = "mca21_v3"

    def __init__(self, api_key: str | None = None, base_url: str = "https://api.mca.gov.in/v3") -> None:
        self.api_key = api_key or get_settings().mca21_api_key
        self.base_url = base_url
        self._client: httpx.AsyncClient | None = None

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30.0,
            )
        return self._client

    async def fetch_bundle(self, cin: str) -> CompanyBundle | None:
        if self.api_key.startswith("PLACEHOLDER"):
            raise NotImplementedError(
                "MCA21V3Source needs a real MCA21_API_KEY. Use FixtureSource until "
                "the V3 key is provisioned (PRD §10 Day 7)."
            )
        # TODO Day 7: implement /v3/companies/{cin} + /v3/companies/{cin}/directors
        # + /v3/companies/{cin}/financials/{year} and assemble a CompanyBundle.
        raise NotImplementedError("MCA21V3Source real fetch — Day 7 task")

    async def list_available_cins(self) -> list[str]:
        raise NotImplementedError("MCA21V3Source enumeration — Day 7 task")

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


# --- CERSAI scraper stub ----------------------------------------------------
class CERSAIScraper:
    """Playwright-based CERSAI charge scraper.

    CERSAI's public search portal is captcha-protected and JS-heavy. Playwright
    is the only feasible automation path. Stub for now — wired up on Day 5.
    """

    name = "cersai_playwright"

    async def fetch_charges(self, cin: str) -> list:
        raise NotImplementedError("CERSAIScraper — Day 5 task")
