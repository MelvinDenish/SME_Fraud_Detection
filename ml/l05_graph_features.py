"""L0.5 — Graph Feature Extraction (PRD §5.3).

NetworkX, 7 features per entity:
  PageRank, betweenness, clustering coefficient, director count (degree),
  counterparty incorporation age (median), node degree, ego-network density.

Cached as feature matrix. Prerequisite for D3 (TGN) and D4 (LOF).

TODO ML Phase 1-1 (Day 3). Acceptance: 'Feature matrix built for all 200 pre-cached companies.'
"""
