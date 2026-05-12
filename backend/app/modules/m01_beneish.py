"""Module 1 — Beneish M-Score (PRD §4.1).

Eight financial ratios. M-Score > -1.78 indicates earnings manipulation.
Requires two consecutive years. Skip (weight -> 0) with single-year data.

TODO Day 8: implement the 8 ratios (DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA)
and the M-Score formula. Acceptance per PRD §10 Day 8: 'IL&FS passes Beneish threshold.'
"""
