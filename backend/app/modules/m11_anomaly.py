"""Module 11 — Anomaly Detection (PRD §4.11).

Two unsupervised detectors:
  - Isolation Forest on 20 financial ratio features. Anomaly score < -0.1 -> NOVEL_PATTERN flag.
  - LOF on 7 graph features (PageRank, betweenness, clustering coeff, director count, counterparty age,
    degree, ego-density). n_neighbors=20. sklearn.neighbors.LocalOutlierFactor.

Both catch novel fraud structures the trained ML ensemble has never seen.

TODO Day 11. Acceptance per Day 11.
"""
