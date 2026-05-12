"""Module 4 — Neo4j Graph Pattern Detection (PRD §4.4).

17 patterns total:
  P1–P7  Core SME (Circular Trading SCC, Related Party Director Overlap, Disqualified Director Active,
         Spider Web, Multi-Hop Related Party Chain, Revenue Concentration, Entity Resolution WCC)
  P8–P12 ITC Carousel (Ring, Missing Trader, Cancelled GSTIN, New GSTIN High ITC, Multi-Hop ITC + Director)
  P13–P17 Evergreening (Round-Trip Repayment, Serial Short-Term Charge, Shell Conduit, NPA Vintage Mismatch,
          Multi-Entity Exposure Concentration)

All run as Cypher queries. All write FraudSignal nodes with TRIGGERED_BY edges on match.

TODO Day 9: implement all 17. Acceptance per PRD §10 Day 9.
"""
