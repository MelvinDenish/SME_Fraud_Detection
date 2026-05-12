"""Async Cypher writers for the ingestion pipeline (PRD §3 schema).

All writes are idempotent (MERGE on natural key) so a re-run is safe.
"""

from __future__ import annotations

import logging
from typing import Any

from neo4j import AsyncDriver

from backend.app.config import get_settings
from backend.app.ingest.schemas import (
    CompanyBundle,
    RawCharge,
    RawCompany,
    RawDirector,
    RawFinancialStatement,
)
from backend.app.ingest.validation import DataQualityError

logger = logging.getLogger(__name__)


_UPSERT_COMPANY = """
MERGE (c:Company {cin: $cin})
SET c.name = $name,
    c.gstin = $gstin,
    c.nic_code = $nic_code,
    c.state = $state,
    c.employee_count_reported = $employee_count_reported,
    c.incorporation_date = date($incorporation_date),
    c.registered_address = $registered_address,
    c.contact_phone = $contact_phone,
    c.auditor_din = $auditor_din,
    c.last_ingested_at = datetime()
RETURN c.cin AS cin
"""

_UPSERT_DIRECTOR = """
MERGE (d:Director {din: $din})
ON CREATE SET d.name = $name,
              d.dob = CASE WHEN $dob IS NULL THEN NULL ELSE date($dob) END,
              d.is_disqualified = $is_disqualified,
              d.num_directorships = $num_directorships
ON MATCH  SET d.num_directorships = $num_directorships,
              d.is_disqualified = $is_disqualified
WITH d
MATCH (c:Company {cin: $cin})
MERGE (d)-[r:IS_DIRECTOR_OF {from_date: date($appointment_date)}]->(c)
SET r.designation = $designation,
    r.to_date = CASE WHEN $cessation_date IS NULL THEN NULL ELSE date($cessation_date) END,
    r.is_current = ($cessation_date IS NULL)
RETURN d.din AS din
"""

_UPSERT_FINANCIAL = """
MATCH (c:Company {cin: $cin})
MERGE (f:FinancialStatement {cin: $cin, year: $year})
SET f += $props
MERGE (c)-[:HAS_FINANCIALS {year: $year}]->(f)
RETURN f.year AS year
"""

_UPSERT_CHARGE = """
MATCH (c:Company {cin: $cin})
MERGE (l:LoanDisbursement {loan_id: $charge_id})
SET l.cin = $cin,
    l.lender_name = $lender_name,
    l.amount = $amount,
    l.disbursement_date = date($creation_date),
    l.satisfaction_date = CASE WHEN $satisfaction_date IS NULL THEN NULL ELSE date($satisfaction_date) END,
    l.loan_type = $charge_type,
    l.bank_branch_ifsc = $bank_branch_ifsc
MERGE (c)-[:RECEIVED_LOAN]->(l)
RETURN l.loan_id AS loan_id
"""

_UPSERT_DQE = """
CREATE (e:DataQualityError {
    cin: $cin,
    year: $year,
    error_type: $error_type,
    field: $field,
    expected_value: $expected_value,
    actual_value: $actual_value,
    timestamp: datetime($timestamp)
})
WITH e
OPTIONAL MATCH (c:Company {cin: $cin})
FOREACH (_ IN CASE WHEN c IS NULL THEN [] ELSE [1] END |
    MERGE (c)-[:HAS_DATA_QUALITY_ERROR]->(e)
)
RETURN id(e) AS id
"""

_SET_DATA_CONFIDENCE = """
MATCH (c:Company {cin: $cin})
SET c.data_confidence = $data_confidence,
    c.last_data_confidence_at = datetime()
RETURN c.cin AS cin
"""


async def upsert_company(driver: AsyncDriver, company: RawCompany) -> str:
    settings = get_settings()
    async with driver.session(database=settings.neo4j_database) as session:
        result = await session.run(
            _UPSERT_COMPANY,
            cin=company.cin,
            name=company.name,
            gstin=company.gstin,
            nic_code=company.nic_code,
            state=company.state,
            employee_count_reported=company.employee_count_reported,
            incorporation_date=company.incorporation_date.isoformat(),
            registered_address=company.registered_address,
            contact_phone=company.contact_phone,
            auditor_din=company.auditor_din,
        )
        record = await result.single()
    if record is None:
        raise RuntimeError(f"Failed to upsert Company {company.cin}")
    return record["cin"]


async def upsert_director(driver: AsyncDriver, cin: str, director: RawDirector) -> str:
    settings = get_settings()
    async with driver.session(database=settings.neo4j_database) as session:
        result = await session.run(
            _UPSERT_DIRECTOR,
            din=director.din,
            name=director.name,
            dob=director.dob.isoformat() if director.dob else None,
            is_disqualified=director.is_disqualified,
            num_directorships=director.num_directorships,
            cin=cin,
            designation=director.designation,
            appointment_date=director.appointment_date.isoformat(),
            cessation_date=director.cessation_date.isoformat() if director.cessation_date else None,
        )
        record = await result.single()
    if record is None:
        raise RuntimeError(f"Failed to upsert Director {director.din}")
    return record["din"]


async def upsert_financial(driver: AsyncDriver, financial: RawFinancialStatement) -> int:
    settings = get_settings()
    props: dict[str, Any] = financial.model_dump(exclude={"cin", "year"})
    async with driver.session(database=settings.neo4j_database) as session:
        result = await session.run(
            _UPSERT_FINANCIAL,
            cin=financial.cin,
            year=financial.year,
            props=props,
        )
        record = await result.single()
    if record is None:
        raise RuntimeError(f"Failed to upsert FinancialStatement {financial.cin}/{financial.year}")
    return record["year"]


async def upsert_charge(driver: AsyncDriver, charge: RawCharge) -> str:
    settings = get_settings()
    async with driver.session(database=settings.neo4j_database) as session:
        result = await session.run(
            _UPSERT_CHARGE,
            cin=charge.cin,
            charge_id=charge.charge_id,
            lender_name=charge.lender_name,
            amount=charge.amount,
            creation_date=charge.creation_date.isoformat(),
            satisfaction_date=charge.satisfaction_date.isoformat() if charge.satisfaction_date else None,
            charge_type=charge.charge_type,
            bank_branch_ifsc=charge.bank_branch_ifsc,
        )
        record = await result.single()
    if record is None:
        raise RuntimeError(f"Failed to upsert LoanDisbursement {charge.charge_id}")
    return record["loan_id"]


async def write_data_quality_error(driver: AsyncDriver, dqe: DataQualityError) -> None:
    settings = get_settings()
    async with driver.session(database=settings.neo4j_database) as session:
        await session.run(
            _UPSERT_DQE,
            cin=dqe.cin,
            year=dqe.year,
            error_type=dqe.error_type,
            field=dqe.field,
            expected_value=dqe.expected_value,
            actual_value=dqe.actual_value,
            timestamp=dqe.timestamp.isoformat(),
        )


async def set_data_confidence(driver: AsyncDriver, cin: str, score: int) -> None:
    settings = get_settings()
    async with driver.session(database=settings.neo4j_database) as session:
        await session.run(_SET_DATA_CONFIDENCE, cin=cin, data_confidence=score)


async def write_bundle(driver: AsyncDriver, bundle: CompanyBundle) -> None:
    """Convenience: write company + all related nodes in one call."""
    await upsert_company(driver, bundle.company)
    for d in bundle.directors:
        await upsert_director(driver, bundle.company.cin, d)
    for f in bundle.financials:
        await upsert_financial(driver, f)
    for ch in bundle.charges:
        await upsert_charge(driver, ch)
