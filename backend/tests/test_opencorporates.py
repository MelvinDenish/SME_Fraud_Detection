"""Tests for the OpenCorporates free-tier source (Phase A of the
free-source plan).

Mirrors the Day-17 MCA21V3Source test shape: placeholder key raises,
mock-transport happy path parses, 404 returns None, network error
returns None. Plus a composite-chain integration test that confirms
the new second-tier slot works end-to-end.
"""

from __future__ import annotations

import httpx
import pytest

from backend.app.ingest.composite import CompositeCompanySource
from backend.app.ingest.opencorporates import (
    OpenCorporatesKeyMissingError,
    OpenCorporatesSource,
)
from backend.app.ingest.schemas import CompanyBundle
from backend.app.ingest.sources import MCA21V3Source


_OPENCORPORATES_PAYLOAD = {
    "results": {
        "company": {
            "name": "Synthetic Free Source Co Pvt Ltd",
            "company_number": "U99999MH2024PTC900222",
            "jurisdiction_code": "in_mh",
            "incorporation_date": "2024-04-01",
            "company_type": "Private",
            "registered_address_in_full": "Plot 22, MIDC Andheri East, Mumbai",
            "industry_codes": [
                {"code": "27101", "description": "Manufacture of electric motors"},
            ],
            "officers": [
                {
                    "name": "Free Director One",
                    "position": "Director",
                    "start_date": "2024-04-01",
                    "din": "44556677",
                },
                {
                    "name": "Free Director Two",
                    "position": "Managing Director",
                    "start_date": "2024-06-15",
                    "identifier": "88990011",
                },
            ],
        }
    }
}


def _mock_transport(payload: dict | None) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if payload is None:
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json=payload)
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_placeholder_key_raises_key_missing() -> None:
    src = OpenCorporatesSource(api_key="PLACEHOLDER_OPENCORPORATES_KEY")
    with pytest.raises(OpenCorporatesKeyMissingError):
        await src.fetch_bundle("U99999MH2024PTC900222")


@pytest.mark.asyncio
async def test_real_key_returns_parsed_bundle() -> None:
    src = OpenCorporatesSource(
        api_key="REAL_KEY",
        transport=_mock_transport(_OPENCORPORATES_PAYLOAD),
    )
    try:
        bundle = await src.fetch_bundle("U99999MH2024PTC900222")
    finally:
        await src.aclose()
    assert isinstance(bundle, CompanyBundle)
    assert bundle.company.name == "Synthetic Free Source Co Pvt Ltd"
    assert bundle.company.cin == "U99999MH2024PTC900222"
    assert bundle.company.state == "MH"
    assert bundle.company.nic_code == 27101
    assert bundle.company.registered_address.startswith("Plot 22")
    # OpenCorporates does NOT publish financials or charges.
    assert bundle.financials == []
    assert bundle.charges == []
    # Two officers with parseable DINs.
    assert len(bundle.directors) == 2
    dins = {d.din for d in bundle.directors}
    assert dins == {"44556677", "88990011"}


@pytest.mark.asyncio
async def test_unknown_cin_returns_none() -> None:
    src = OpenCorporatesSource(api_key="REAL_KEY", transport=_mock_transport(None))
    try:
        bundle = await src.fetch_bundle("U00000XX0000PTC000000")
    finally:
        await src.aclose()
    assert bundle is None


@pytest.mark.asyncio
async def test_network_error_swallowed_as_none() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("network down")
    src = OpenCorporatesSource(api_key="REAL_KEY", transport=httpx.MockTransport(boom))
    try:
        bundle = await src.fetch_bundle("U99999MH2024PTC900222")
    finally:
        await src.aclose()
    assert bundle is None


@pytest.mark.asyncio
async def test_missing_industry_code_falls_back_to_sentinel_nic() -> None:
    """If OpenCorporates doesn't surface a numeric NIC code, the schema
    still validates because we default to nic_code=1 — the M5 peer-deviation
    module will note the missing-NIC case downstream rather than the
    ingestion failing."""
    payload = {
        "results": {
            "company": {
                "name": "Missing NIC Co",
                "company_number": "U99999MH2024PTC900333",
                "jurisdiction_code": "in_dl",
                "incorporation_date": "2024-04-01",
                "industry_codes": [],
                "officers": [],
            }
        }
    }
    src = OpenCorporatesSource(api_key="REAL_KEY", transport=_mock_transport(payload))
    try:
        bundle = await src.fetch_bundle("U99999MH2024PTC900333")
    finally:
        await src.aclose()
    assert bundle is not None
    assert bundle.company.nic_code == 1
    assert bundle.company.state == "DL"


@pytest.mark.asyncio
async def test_composite_falls_through_to_opencorporates_when_mca21_placeholder() -> None:
    """MCA21 in placeholder mode → composite should reach OpenCorporates
    before FixtureSource. With OpenCorporates serving a parsed bundle,
    that bundle wins over the fixture (which holds different data for
    real demo CINs)."""
    secondary = OpenCorporatesSource(
        api_key="REAL_KEY",
        transport=_mock_transport(_OPENCORPORATES_PAYLOAD),
    )
    composite = CompositeCompanySource(secondary=secondary)
    try:
        bundle = await composite.fetch_bundle("U99999MH2024PTC900222")
    finally:
        await secondary.aclose()
    assert bundle is not None
    assert bundle.company.name == "Synthetic Free Source Co Pvt Ltd"


@pytest.mark.asyncio
async def test_composite_falls_through_past_opencorporates_to_fixture() -> None:
    """Both MCA21 and OpenCorporates in placeholder mode → fixture wins.
    Demo path stays intact regardless of free-tier wiring."""
    composite = CompositeCompanySource()
    bundle = await composite.fetch_bundle("U45201MH2005PTC155294")
    assert bundle is not None
    assert bundle.company.name.startswith("IL&FS")


@pytest.mark.asyncio
async def test_composite_skips_opencorporates_on_404_falls_to_fixture() -> None:
    """OpenCorporates with a real key but 404 should fall through to the
    fixture, not return None."""
    primary = MCA21V3Source(api_key="REAL_KEY", transport=httpx.MockTransport(
        lambda req: httpx.Response(404, json={})
    ))
    secondary = OpenCorporatesSource(api_key="REAL_KEY", transport=_mock_transport(None))
    composite = CompositeCompanySource(primary=primary, secondary=secondary)
    try:
        bundle = await composite.fetch_bundle("U45201MH2005PTC155294")
    finally:
        await primary.aclose()
        await secondary.aclose()
    assert bundle is not None
    assert bundle.company.name.startswith("IL&FS")
