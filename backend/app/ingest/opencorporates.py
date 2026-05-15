"""OpenCorporates API client (free public substitute for MCA21 V3).

PRD §10 add-on: replace placeholder paid MCA21/CERSAI keys with publicly-
accessible alternatives. OpenCorporates is the simplest of the three
candidates (Phase A of the free-source plan) — a real REST API, no
captcha, free auth-key tier @ 1000 req/day.

Endpoint shape (api.opencorporates.com/v0.4):
  GET /companies/in/<CIN>?api_token=<key>
    -> {"results": {"company": {...}}}

Returned bundle is *partial* — OpenCorporates does NOT publish:
  - financial statements (revenue, pat, balance-sheet rows)
  - registered charges (CERSAI / Index-of-Charges data)
So `bundle.financials == []` and `bundle.charges == []`. The scorer
(backend/app/scorer.py) already tolerates this — M1/M2/M5/M6/M7 abstain
when financials are absent, and M9 reads charges from the CERSAI tier
separately in the composite chain.

Auth-key absence is signalled distinctly via OpenCorporatesKeyMissingError
so the CompositeCompanySource (Day-17 fall-through pattern) knows to skip
this tier without raising.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import httpx
from pydantic import ValidationError

from backend.app.config import get_settings
from backend.app.ingest.schemas import (
    CompanyBundle,
    RawCompany,
    RawDirector,
)

logger = logging.getLogger(__name__)


class OpenCorporatesKeyMissingError(RuntimeError):
    """Raised by OpenCorporatesSource when no real API key is configured.
    Callers (CompositeCompanySource) treat this as 'fall through to the
    next tier', not a bug."""


class OpenCorporatesSource:
    """Real OpenCorporates API client (free auth-key tier).

    Free signup at https://opencorporates.com/users/sign_up generates the
    api_token used here. Free tier: 1000 req/day. The token is read from
    `settings.opencorporates_api_key` (env var OPENCORPORATES_API_KEY).
    """

    name = "opencorporates"

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = "https://api.opencorporates.com/v0.4",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key or get_settings().opencorporates_api_key
        self.base_url = base_url
        self._transport = transport
        self._client: httpx.AsyncClient | None = None

    def _has_real_key(self) -> bool:
        return bool(self.api_key) and not self.api_key.startswith("PLACEHOLDER")

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=30.0,
                transport=self._transport,
            )
        return self._client

    async def _get_json(self, path: str) -> Any | None:
        client = await self._ensure_client()
        try:
            resp = await client.get(path, params={"api_token": self.api_key})
        except httpx.HTTPError as exc:
            logger.warning("OpenCorporates GET %s failed: %s", path, exc)
            return None
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            logger.warning(
                "OpenCorporates GET %s -> HTTP %d: %s",
                path, resp.status_code, resp.text[:200],
            )
            return None
        try:
            return resp.json()
        except ValueError:
            logger.warning("OpenCorporates GET %s returned non-JSON body", path)
            return None

    async def fetch_bundle(self, cin: str) -> CompanyBundle | None:
        if not self._has_real_key():
            raise OpenCorporatesKeyMissingError(
                "OpenCorporatesSource has no real OPENCORPORATES_API_KEY — "
                "caller should fall through."
            )
        payload = await self._get_json(f"/companies/in/{cin}")
        if payload is None:
            return None
        try:
            company_json = payload["results"]["company"]
        except (KeyError, TypeError) as exc:
            logger.warning("OpenCorporates payload for %s missing results.company: %s", cin, exc)
            return None
        try:
            company = self._parse_company(company_json, cin)
            directors = self._parse_directors(company_json.get("officers") or [])
        except (ValueError, ValidationError) as exc:
            logger.warning("OpenCorporates payload for %s failed validation: %s", cin, exc)
            return None
        return CompanyBundle(
            company=company,
            directors=directors,
            financials=[],   # OpenCorporates does not publish AOC-4 financials
            charges=[],      # OpenCorporates does not publish registered charges
        )

    async def list_available_cins(self) -> list[str]:
        # OpenCorporates has search endpoints but no bulk "list all India CINs".
        # Composite asks FixtureSource for batch enumeration instead.
        return []

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # --- Parsers. Tolerant of OpenCorporates's optional-field quirks. -----
    @staticmethod
    def _parse_company(row: dict, cin: str) -> RawCompany:
        # jurisdiction_code: 'in_mh' / 'in_dl' / 'in_ka' — split + uppercase.
        jurisdiction = (row.get("jurisdiction_code") or "in_mh").lower()
        state = jurisdiction.split("_", 1)[-1].upper()[:2] or "MH"

        # industry_codes is a list of {code, description, code_scheme_id}.
        # We need an int 1-99999 (the NIC code). First numeric code wins.
        nic_code = _first_numeric_industry_code(row.get("industry_codes") or [])
        if nic_code is None:
            # OpenCorporates rarely populates NIC for India; default to a
            # sentinel NIC that schemas.py accepts (1) so the bundle still
            # validates. The scorer's M5 peer-deviation will note the
            # missing-NIC case via benchmark match failure.
            nic_code = 1

        # Address may be in `registered_address_in_full` or `registered_address`.
        addr = (
            row.get("registered_address_in_full")
            or _flatten_address(row.get("registered_address"))
        )

        return RawCompany(
            cin=row.get("company_number", cin),
            name=row["name"],
            incorporation_date=_parse_iso_date(row["incorporation_date"]),
            nic_code=nic_code,
            state=state,
            gstin=None,                  # OpenCorporates does not publish GSTIN
            employee_count_reported=None,
            registered_address=addr,
            contact_phone=None,
            auditor_din=None,
        )

    @staticmethod
    def _parse_directors(officers: list[dict]) -> list[RawDirector]:
        out: list[RawDirector] = []
        for o in officers:
            # OpenCorporates 'officers' may not have a DIN — synthesise from
            # the OpenCorporates officer ID if real DIN absent. Format the
            # synthetic DIN to fit schemas.py's 8-digit constraint.
            din_raw = o.get("din") or o.get("identifier") or o.get("id")
            din = _coerce_din(din_raw)
            if din is None:
                continue
            try:
                out.append(RawDirector(
                    din=din,
                    name=o["name"],
                    designation=(o.get("position") or "director").lower(),
                    appointment_date=_parse_iso_date(
                        o.get("start_date") or "1970-01-01"
                    ),
                    cessation_date=(
                        _parse_iso_date(o["end_date"]) if o.get("end_date") else None
                    ),
                    is_disqualified=False,    # not surfaced by OpenCorporates
                    num_directorships=1,      # not surfaced; conservative default
                ))
            except (ValueError, ValidationError) as exc:
                logger.warning("OpenCorporates officer row dropped: %s", exc)
        return out


def _first_numeric_industry_code(codes: list[dict]) -> int | None:
    for c in codes:
        raw = c.get("code")
        if raw is None:
            continue
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if not digits:
            continue
        try:
            n = int(digits[:5])   # NIC is 5-digit; clip overflow gracefully
            if 1 <= n <= 99999:
                return n
        except ValueError:
            continue
    return None


def _flatten_address(addr: Any) -> str | None:
    if addr is None:
        return None
    if isinstance(addr, str):
        return addr
    if isinstance(addr, dict):
        parts = [str(v) for v in addr.values() if v]
        return ", ".join(parts) if parts else None
    return None


def _coerce_din(value: Any) -> str | None:
    if value is None:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if not digits:
        return None
    # Pad / truncate to 8 digits (schemas.py DIN regex).
    return digits[-8:].zfill(8)


def _parse_iso_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])
