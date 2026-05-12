"""Demo seed loader (PRD §10 Day 6 + Definition of Done).

Repopulates Neo4j from a static JSON in <60 seconds:
  - IL&FS FY2014-18 (hand-coded from SFIO report)
  - DHFL evergreening graph
  - 7-node synthetic ITC carousel ring (clearly labeled SYNTHETIC DATA)

Run: `python scripts/seed_neo4j.py`

TODO Day 6: implement IL&FS + DHFL + ITC seed. Acceptance: 'IL&FS loads clean <60s. DHFL evergreening graph visible. ITC 7-node ring renders.'
"""

import asyncio


async def main() -> None:
    raise NotImplementedError("Day 6 task — see PRD §10 Day 6 acceptance criteria")


if __name__ == "__main__":
    asyncio.run(main())
