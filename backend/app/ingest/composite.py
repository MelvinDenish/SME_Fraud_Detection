"""CompositeSource — chains MCA21 V3 in front of the FixtureSource fallback
(PRD §10 Day 17).

Why a composite:
  - Demo path always works: when MCA21_API_KEY is the .env placeholder the
    composite resolves every CIN via the fixture seeds.
  - Production path "just works": once a real key lands in .env.local, the
    same composite tries MCA21 first and only falls through on 404 / network
    errors / validation failures.
  - Upload overlay (Day 16) lands on the *merged* bundle, not on whichever
    source supplied it — the overlay layer doesn't need to care.

Composition rules:
  1. If MCA21 raises MCA21KeyMissingError (no real key), skip straight to the
     fixture.
  2. If MCA21 returns a CompanyBundle, use it as-is. (No fixture merge — the
     production data is canonical.)
  3. If MCA21 returns None (404 / network error), fall back to the fixture.
  4. If both return None, return None — caller turns it into a 404.

The composite also fold CERSAI charges (when configured) onto the MCA21
bundle, since MCA21's /charges endpoint is incomplete vs CERSAI.
"""

from __future__ import annotations

import logging
from typing import Iterable

from backend.app.ingest.cersai import CERSAIFixtureSource
from backend.app.ingest.opencorporates import (
    OpenCorporatesKeyMissingError,
    OpenCorporatesSource,
)
from backend.app.ingest.schemas import CompanyBundle, RawCharge
from backend.app.ingest.sources import (
    CERSAIScraper,
    CompanySource,
    FixtureSource,
    MCA21KeyMissingError,
    MCA21V3Source,
)

logger = logging.getLogger(__name__)


class CompositeCompanySource:
    """Primary-then-fallback CompanySource."""

    name = "composite"

    def __init__(
        self,
        primary: MCA21V3Source | None = None,
        secondary: OpenCorporatesSource | None = None,
        fallback: CompanySource | None = None,
        cersai: CERSAIScraper | CERSAIFixtureSource | None = None,
    ) -> None:
        self.primary = primary or MCA21V3Source()
        # PRD §10 free-source add-on (Phase A): OpenCorporates as the
        # second-tier primary. Skipped if its key is in placeholder mode.
        self.secondary = secondary or OpenCorporatesSource()
        self.fallback = fallback or FixtureSource()
        self.cersai = cersai or CERSAIFixtureSource()

    async def fetch_bundle(self, cin: str) -> CompanyBundle | None:
        # Tier 1 — paid MCA21 V3 (full bundle + charges).
        primary_bundle: CompanyBundle | None = None
        try:
            primary_bundle = await self.primary.fetch_bundle(cin)
        except MCA21KeyMissingError:
            logger.debug("MCA21 has no real key; trying %s", self.secondary.name)
        except Exception as exc:  # network errors, parse failures, etc.
            logger.warning("MCA21 fetch failed for %s: %s", cin, exc)

        if primary_bundle is not None:
            extras = await self._extra_charges(cin)
            if extras:
                merged = list(primary_bundle.charges)
                seen = {c.charge_id for c in merged}
                for c in extras:
                    if c.charge_id not in seen:
                        merged.append(c)
                        seen.add(c.charge_id)
                primary_bundle = primary_bundle.model_copy(update={"charges": merged})
            return primary_bundle

        # Tier 2 — OpenCorporates (free auth-key, master + directors only).
        secondary_bundle: CompanyBundle | None = None
        try:
            secondary_bundle = await self.secondary.fetch_bundle(cin)
        except OpenCorporatesKeyMissingError:
            logger.debug(
                "OpenCorporates has no real key; falling through to %s",
                self.fallback.name,
            )
        except Exception as exc:
            logger.warning("OpenCorporates fetch failed for %s: %s", cin, exc)

        if secondary_bundle is not None:
            # OpenCorporates doesn't publish charges; the CERSAI tier still
            # gets a chance to layer them on the bundle.
            extras = await self._extra_charges(cin)
            if extras:
                secondary_bundle = secondary_bundle.model_copy(
                    update={"charges": list(extras)},
                )
            return secondary_bundle

        # Tier 3 — FixtureSource (offline demo backbone).
        return await self.fallback.fetch_bundle(cin)

    async def list_available_cins(self) -> list[str]:
        # MCA21 has no enumeration; fall back to fixture's list.
        return await self.fallback.list_available_cins()

    async def _extra_charges(self, cin: str) -> Iterable[RawCharge]:
        if self.cersai is None:
            return []
        try:
            if isinstance(self.cersai, CERSAIFixtureSource):
                return await self.cersai.fetch_for_cin(cin)
            return await self.cersai.fetch_charges(cin)
        except NotImplementedError:
            # Scraper not configured for this run — silently skip.
            return []
        except Exception as exc:
            logger.warning("CERSAI fetch failed for %s: %s", cin, exc)
            return []
