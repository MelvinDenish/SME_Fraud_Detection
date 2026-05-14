"""/upload/* — PRD §10 Day 16.

Three endpoints that fold user-supplied evidence into the per-CIN overlay so
the next /analyse call sees it merged onto the FixtureSource bundle:

  POST /upload/financials/{cin}  — multipart PDF (AOC-4). pdfplumber parses
                                    one RawFinancialStatement + PDFForensics.
  POST /upload/gst/{cin}          — JSON RawGSTEntity row.
  POST /upload/bank/{cin}         — JSON {credits_total: float} bank summary.

The Day-16 contract is intentionally minimal: parse, validate, stash. The
RiskScorer rebuilds its evidence chain from the merged bundle, so we don't
re-score here.
"""

from __future__ import annotations

import logging
import tempfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.app.api.upload_store import get_upload_store
from backend.app.ingest.gst import RawGSTEntity
from backend.app.ingest.sources import FixtureSource
from backend.app.parse.pdf_parser import parse_financial_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["upload"])

_fixture_source = FixtureSource()


class BankCreditsIn(BaseModel):
    """Body for /upload/bank — bank-statement reconstruction summary."""

    model_config = ConfigDict(extra="forbid")
    credits_total: float = Field(ge=0.0)


class UploadAck(BaseModel):
    """Generic response for upload acceptance."""

    cin: str
    accepted: bool
    detail: str
    extra: dict = Field(default_factory=dict)


async def _require_known_cin(cin: str) -> None:
    bundle = await _fixture_source.fetch_bundle(cin)
    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CIN {cin} not registered in source-of-truth — upload after MCA lookup",
        )


@router.post("/financials/{cin}", response_model=UploadAck)
async def upload_financials(cin: str, file: UploadFile = File(...)) -> UploadAck:
    """Accept an AOC-4 PDF and overlay it onto the fixture bundle."""
    await _require_known_cin(cin)
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .pdf uploads accepted for /upload/financials",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty PDF body",
        )
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(raw)
        tmp_path = Path(tmp.name)
    try:
        try:
            statement, forensics = parse_financial_pdf(tmp_path, cin_override=cin)
        except (ValueError, ValidationError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"PDF parse failed: {exc}",
            ) from exc
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not delete temp PDF %s", tmp_path)

    get_upload_store().upsert_financials(cin, statement, forensics)
    return UploadAck(
        cin=cin,
        accepted=True,
        detail=f"AOC-4 FY{statement.year} parsed",
        extra={
            "year": statement.year,
            "revenue": statement.revenue,
            "pdf_creation_software": forensics.pdf_creation_software,
            "pdf_metadata_anomaly": forensics.creation_mod_gap_days is not None
                                    and forensics.creation_mod_gap_days < 3,
        },
    )


@router.post("/gst/{cin}", response_model=UploadAck)
async def upload_gst(cin: str, payload: dict) -> UploadAck:
    """Accept a RawGSTEntity JSON body and overlay it."""
    await _require_known_cin(cin)
    payload = dict(payload)  # tolerate Pydantic-strict callers
    payload.setdefault("cin", cin)
    payload.setdefault("registration_date", date.today().isoformat())
    try:
        entity = RawGSTEntity.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"GST payload validation failed: {exc.errors()}",
        ) from exc
    if entity.cin != cin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payload CIN {entity.cin} does not match path CIN {cin}",
        )
    get_upload_store().upsert_gst(cin, entity)
    return UploadAck(
        cin=cin,
        accepted=True,
        detail=f"GST entity {entity.gstin} overlaid",
        extra={"aggregate_turnover": entity.aggregate_turnover},
    )


@router.post("/bank/{cin}", response_model=UploadAck)
async def upload_bank(cin: str, payload: BankCreditsIn) -> UploadAck:
    """Accept a bank-reconstruction summary {credits_total}."""
    await _require_known_cin(cin)
    get_upload_store().upsert_bank(cin, payload.credits_total)
    return UploadAck(
        cin=cin,
        accepted=True,
        detail="Bank credits total overlaid",
        extra={"credits_total": payload.credits_total},
    )
