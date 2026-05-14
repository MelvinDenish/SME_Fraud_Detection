"""In-memory overlay store for the Day-16 upload endpoints (PRD §10).

The three /upload/* endpoints don't write to Neo4j directly. Instead, they
park the parsed payload in a per-CIN overlay so that the next /analyse call
sees the upload merged onto the FixtureSource bundle. Day-17 wires the same
overlay onto the live MCA21/CERSAI bundle.

Why process-local memory rather than the Neo4j cache:
  - Upload is a synchronous user gesture in the React UI; a re-analyse should
    reflect it within ms, not depend on a Cypher round-trip.
  - PRD §2.1 forbids Redis/Upstash. Neo4j node properties are fine for
    persistence, but for the demo session a singleton dict is correct.

Each overlay carries:
  - extra_financials  : pdfplumber-parsed RawFinancialStatement rows + the
                        forensic side-payload (Module 8 cares).
  - gst_payload        : a parsed RawGSTEntity to feed Module 2 check #1.
  - bank_credits_total : a single rupee figure to feed Module 2 check #7.
  - has_gst_upload / has_bank_upload : forwarded to data_confidence.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.app.ingest.gst import RawGSTEntity
from backend.app.ingest.schemas import CompanyBundle, RawFinancialStatement
from backend.app.parse.pdf_parser import PDFForensics


@dataclass
class CompanyUploadOverlay:
    """Whatever the user has uploaded for a single CIN. All optional."""

    extra_financials: list[RawFinancialStatement] = field(default_factory=list)
    forensics: list[PDFForensics] = field(default_factory=list)
    gst_entity: RawGSTEntity | None = None
    bank_credits_total: float | None = None
    has_gst_upload: bool = False
    has_bank_upload: bool = False

    def merge_into(self, bundle: CompanyBundle) -> CompanyBundle:
        """Return a new CompanyBundle with the overlay rows folded in.

        FinancialStatement rows for an existing (cin, year) are *replaced* by
        the upload — uploads are authoritative over fixtures by design.
        """
        existing_keys = {(f.cin, f.year) for f in self.extra_financials}
        merged_fs = [f for f in bundle.financials if (f.cin, f.year) not in existing_keys]
        merged_fs.extend(self.extra_financials)
        return bundle.model_copy(update={
            "financials": sorted(merged_fs, key=lambda f: f.year),
            "has_gst_upload": bundle.has_gst_upload or self.has_gst_upload,
            "has_bank_upload": bundle.has_bank_upload or self.has_bank_upload,
        })


class UploadStore:
    """Process-singleton map of CIN -> CompanyUploadOverlay.

    Thread-safety: FastAPI uses a single asyncio loop per worker, so a plain
    dict is fine. Multi-worker Gunicorn would need a shared store — out of
    scope until Day 23 deploy hardening.
    """

    def __init__(self) -> None:
        self._overlays: dict[str, CompanyUploadOverlay] = {}

    def get(self, cin: str) -> CompanyUploadOverlay:
        return self._overlays.get(cin) or CompanyUploadOverlay()

    def upsert_financials(
        self,
        cin: str,
        statement: RawFinancialStatement,
        forensics: PDFForensics,
    ) -> CompanyUploadOverlay:
        overlay = self._overlays.setdefault(cin, CompanyUploadOverlay())
        overlay.extra_financials = [
            f for f in overlay.extra_financials if f.year != statement.year
        ] + [statement]
        overlay.forensics.append(forensics)
        return overlay

    def upsert_gst(self, cin: str, entity: RawGSTEntity) -> CompanyUploadOverlay:
        overlay = self._overlays.setdefault(cin, CompanyUploadOverlay())
        overlay.gst_entity = entity
        overlay.has_gst_upload = True
        return overlay

    def upsert_bank(self, cin: str, total_credits: float) -> CompanyUploadOverlay:
        overlay = self._overlays.setdefault(cin, CompanyUploadOverlay())
        overlay.bank_credits_total = total_credits
        overlay.has_bank_upload = True
        return overlay

    def reset(self) -> None:
        self._overlays.clear()


_UPLOAD_STORE = UploadStore()


def get_upload_store() -> UploadStore:
    """FastAPI dependency-style accessor — kept so tests can swap in a fresh store."""
    return _UPLOAD_STORE
