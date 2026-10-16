"""DGGI press release scraper — extracts ITC carousel bust records from
the CBIC public press release archive (free, government-published).

URL: https://www.cbic.gov.in/entities/press-releases

DGGI publishes press releases for major ITC fraud busts with:
  - DGGI zone unit name
  - Sector + period
  - Total fake ITC amount (₹ Cr)
  - Ring size (number of entities)
  - Sometimes named companies; often redacted during active investigation

This scraper:
  1. Fetches the press release index page
  2. Filters releases matching ITC / GST fraud / fake invoice keywords
  3. Parses each release for the structured fields above
  4. Returns a list of `DggiBustRecord` for the seed-refresh job

Designed to be called from a GitHub Actions weekly cron — see
`.github/workflows/refresh-public-data.yml`. The cron writes the
parsed records to `infra/seeds/itc_carousel/dggi_*.json` and opens
a PR with the diff for human review before merge.

Honesty note: the scraper is best-effort. Government sites change
HTML occasionally; a CI alert + manual fix loop covers breakage. The
parser preserves the source URL for every record so any output can be
traced back to the original CBIC publication.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Iterable

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

CBIC_PRESS_RELEASES_INDEX = "https://www.cbic.gov.in/entities/press-releases"
DGGI_ZONE_PATTERN = re.compile(
    r"DGGI\s+(?P<zone>Mumbai|Delhi|Hyderabad|Bangalore|Bengaluru|Ahmedabad|Chennai|Kolkata|Pune|Jaipur|Lucknow|Surat|Chandigarh|Patna|Cochin|Vizag|Visakhapatnam|Bhubaneswar)\s*(?:Zonal\s+Unit|Zone)",
    re.IGNORECASE,
)
AMOUNT_PATTERN = re.compile(
    r"(?:Rs\.?|₹|INR)\s*(?P<amount>[\d,]+(?:\.\d+)?)\s*(?P<unit>cr(?:ore)?s?|lakh|crores?)",
    re.IGNORECASE,
)
RING_SIZE_PATTERN = re.compile(
    r"(?P<count>\d+)\s+(?:firm|firms|companies|entit(?:y|ies)|shell\s+(?:firm|firms))",
    re.IGNORECASE,
)
ITC_KEYWORDS = (
    "fake itc",
    "fraudulent itc",
    "itc fraud",
    "input tax credit fraud",
    "fake invoice",
    "fake invoices",
    "bogus itc",
    "fictitious itc",
    "ghost firms",
    "shell firms",
    "carousel",
)


@dataclass
class DggiBustRecord:
    """One DGGI press-release-derived ITC bust."""
    title: str
    url: str
    published_on: date | None
    dggi_zone: str | None
    sector: str | None
    total_fraud_cr: float | None
    ring_size: int | None
    excerpt: str
    raw_html_hash: str = ""
    keywords_matched: list[str] = field(default_factory=list)

    def to_seed_entry(self) -> dict:
        """Render the record into the schema used by
        `infra/seeds/itc_carousel/*.json`. Company names are intentionally
        left empty — DGGI redacts them during investigation, and we
        respect that. The graph topology is populated by the seed-refresh
        job from the ring_size hint."""
        return {
            "ring_id": f"DGGI-{(self.dggi_zone or 'X').upper()[:3]}-{self.published_on.year if self.published_on else 'X'}-{self.url.rsplit('/', 1)[-1][:8]}",
            "description": self.excerpt[:500],
            "source_url": self.url,
            "source_type": "dggi_press_release",
            "dggi_zone": self.dggi_zone or "unknown",
            "published_on": self.published_on.isoformat() if self.published_on else None,
            "total_fraud_cr": self.total_fraud_cr,
            "ring_size": self.ring_size,
            "sector": self.sector,
            "redaction_status": "names_redacted_by_source",
            "entity_disclosure": (
                "Amount, zone, sector, period and ring topology drawn from public "
                f"DGGI press release dated {self.published_on or 'unknown'}. Company "
                "names redacted by DGGI per active-investigation protocol. Full "
                f"text: {self.url}"
            ),
            "keywords_matched": self.keywords_matched,
            "verified_date": datetime.now(timezone.utc).date().isoformat(),
        }


def _matches_itc_keywords(text: str) -> list[str]:
    lower = text.lower()
    return [k for k in ITC_KEYWORDS if k in lower]


def _parse_amount_to_cr(match: re.Match) -> float | None:
    amount_s = match.group("amount").replace(",", "")
    try:
        amount = float(amount_s)
    except ValueError:
        return None
    unit = match.group("unit").lower()
    if "lakh" in unit:
        return amount / 100.0
    return amount


def _parse_press_release(html: str, url: str) -> DggiBustRecord | None:
    """Parse one CBIC press release page into a DggiBustRecord if it
    matches the ITC-carousel pattern; otherwise return None."""
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.find("h1") or soup.find("title"))
    title_text = (title.get_text(strip=True) if title else "")[:300]

    body = soup.find("article") or soup.find("main") or soup.find("div", class_="content") or soup
    body_text = body.get_text(" ", strip=True)

    keywords = _matches_itc_keywords(title_text + " " + body_text)
    if not keywords:
        return None

    zone_match = DGGI_ZONE_PATTERN.search(title_text + " " + body_text)
    zone = zone_match.group("zone").title() if zone_match else None

    amount_match = AMOUNT_PATTERN.search(body_text)
    amount_cr = _parse_amount_to_cr(amount_match) if amount_match else None

    ring_match = RING_SIZE_PATTERN.search(body_text)
    ring_size = int(ring_match.group("count")) if ring_match else None

    published = None
    # CBIC releases often have a date like "Date: 14-Mar-2024" or "Published: ..."
    for fmt in ("%d-%b-%Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y"):
        date_match = re.search(r"(\d{1,2}[-/\s][A-Za-z]{3,9}[-/\s]\d{4}|\d{4}-\d{2}-\d{2})", body_text[:2000])
        if date_match:
            try:
                published = datetime.strptime(date_match.group(1).replace("/", "-"), fmt).date()
                break
            except ValueError:
                continue

    return DggiBustRecord(
        title=title_text,
        url=url,
        published_on=published,
        dggi_zone=zone,
        sector=None,
        total_fraud_cr=amount_cr,
        ring_size=ring_size,
        excerpt=body_text[:800],
        keywords_matched=keywords,
    )


async def fetch_recent_dggi_busts(
    *,
    max_releases: int = 50,
    timeout_seconds: float = 30.0,
) -> list[DggiBustRecord]:
    """Crawl the CBIC press release archive and return up to
    `max_releases` matching DGGI ITC bust records, newest-first.

    Designed to be called from the weekly refresh CI cron — see
    `.github/workflows/refresh-public-data.yml`.

    NOTE: The CBIC site (cbic.gov.in/entities/press-releases) migrated
    to a JavaScript-rendered SPA in mid-2026 and no longer returns
    meaningful HTML from plain httpx requests. When the index page
    returns a JS-only scaffold we log a warning and return an empty
    list rather than crashing — the CI workflow will still succeed,
    the existing seed files remain unchanged, and the weekly diff
    will show no changes until the scraper is updated with a Playwright
    path or the API endpoint is discovered.

    Alternative scrape paths to explore:
    - PIB (pib.gov.in) RSS feed for CBIC/DGGI press releases
    - Google News RSS: https://news.google.com/rss/search?q=DGGI+ITC+fraud
    """
    headers = {
        "User-Agent": (
            "Sentinel-G/1.0 (Public-Data Refresh; "
            "contact: https://github.com/MelvinDenish/SME_Fraud_Detection)"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }

    # --- Primary: PIB RSS for CBIC/DGGI (JS-free, always available) ----------
    pib_records = await _fetch_pib_rss(headers=headers, max_releases=max_releases, timeout=timeout_seconds)
    if pib_records:
        return pib_records

    # --- Fallback: Direct CBIC index scrape (works when not JS-gated) --------
    try:
        async with httpx.AsyncClient(
            timeout=timeout_seconds, headers=headers, follow_redirects=True
        ) as client:
            index_resp = await client.get(CBIC_PRESS_RELEASES_INDEX)
            index_resp.raise_for_status()
            index_text = index_resp.text

            # Detect JS-only scaffold — if the page has fewer than 500 meaningful
            # text chars it's almost certainly a loading placeholder.
            meaningful = BeautifulSoup(index_text, "html.parser").get_text(strip=True)
            if len(meaningful) < 500:
                logger.warning(
                    "DGGI scraper: CBIC index returned a JS-only page (%d chars) — "
                    "scrape yielded 0 records. Update to Playwright or PIB RSS path.",
                    len(meaningful),
                )
                return []

            soup = BeautifulSoup(index_text, "html.parser")
            links: list[str] = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "press-release" in href and href not in links:
                    full = href if href.startswith("http") else f"https://www.cbic.gov.in{href}"
                    links.append(full)
                if len(links) >= max_releases * 3:
                    break

            records: list[DggiBustRecord] = []
            for url in links[: max_releases * 3]:
                if len(records) >= max_releases:
                    break
                try:
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue
                    rec = _parse_press_release(resp.text, url)
                    if rec is not None:
                        records.append(rec)
                except (httpx.HTTPError, httpx.TimeoutException) as exc:
                    logger.warning("DGGI scrape skipped %s: %s", url, exc)
                    continue
            return records
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.warning("DGGI scraper: index fetch failed (%s) — returning empty list", exc)
        return []


async def _fetch_pib_rss(
    *,
    headers: dict,
    max_releases: int,
    timeout: float,
) -> list[DggiBustRecord]:
    """Parse PIB RSS feed for CBIC/DGGI press releases — no JavaScript needed.

    PIB (Press Information Bureau) syndicates GoI press releases including
    CBIC/DGGI ITC fraud busts at a stable RSS endpoint. This is more robust
    than scraping the CBIC Angular SPA directly.
    """
    PIB_RSS = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3"
    try:
        async with httpx.AsyncClient(
            timeout=timeout, headers=headers, follow_redirects=True
        ) as client:
            resp = await client.get(PIB_RSS)
            if resp.status_code != 200:
                logger.warning("PIB RSS returned %d", resp.status_code)
                return []
            soup = BeautifulSoup(resp.text, "xml")
            items = soup.find_all("item")
            if not items:
                # lxml XML parser may not be installed — fall back to html.parser
                soup = BeautifulSoup(resp.text, "html.parser")
                items = soup.find_all("item")

            records: list[DggiBustRecord] = []
            for item in items[:max_releases * 3]:
                title_tag = item.find("title")
                link_tag = item.find("link")
                desc_tag = item.find("description")
                title_text = title_tag.get_text(strip=True) if title_tag else ""
                link_text = link_tag.get_text(strip=True) if link_tag else ""
                desc_text = desc_tag.get_text(strip=True) if desc_tag else ""
                combined = f"{title_text} {desc_text}"
                keywords = _matches_itc_keywords(combined)
                if not keywords:
                    continue
                # Fetch the full release for richer parsing
                try:
                    full_resp = await client.get(link_text)
                    rec = _parse_press_release(full_resp.text, link_text) if full_resp.status_code == 200 else None
                except (httpx.HTTPError, httpx.TimeoutException):
                    rec = None
                if rec is None:
                    # Build a minimal record from the RSS summary
                    zone_m = DGGI_ZONE_PATTERN.search(combined)
                    amount_m = AMOUNT_PATTERN.search(combined)
                    ring_m = RING_SIZE_PATTERN.search(combined)
                    rec = DggiBustRecord(
                        title=title_text,
                        url=link_text,
                        published_on=None,
                        dggi_zone=zone_m.group("zone").title() if zone_m else None,
                        sector=None,
                        total_fraud_cr=_parse_amount_to_cr(amount_m) if amount_m else None,
                        ring_size=int(ring_m.group("count")) if ring_m else None,
                        excerpt=desc_text[:800],
                        keywords_matched=keywords,
                    )
                records.append(rec)
                if len(records) >= max_releases:
                    break
            logger.info("PIB RSS: fetched %d DGGI ITC records", len(records))
            return records
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.warning("PIB RSS fetch failed (%s)", exc)
        return []


def filter_to_carousel(records: Iterable[DggiBustRecord]) -> list[DggiBustRecord]:
    """Narrow the scraper output to the records that look like genuine
    carousel busts (amount present, ring size > 2)."""
    out: list[DggiBustRecord] = []
    for r in records:
        if r.total_fraud_cr is None or r.total_fraud_cr < 1.0:
            continue
        if r.ring_size is not None and r.ring_size < 3:
            continue
        out.append(r)
    return out
