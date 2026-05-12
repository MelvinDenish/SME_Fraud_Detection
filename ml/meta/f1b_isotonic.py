"""F1b — Isotonic Regression Calibration (PRD §5.2).

sklearn.isotonic.IsotonicRegression fit on a separate 15% hold-out (NOT OOF data — prevents leakage).
Converts LightGBM raw scores to calibrated P(fraud) probabilities.
Validate via reliability diagram: P(fraud)=0.8 -> ~80% actual fraud rate.

TODO ML Phase 1-5 (Day 5). Acceptance: reliability diagram correct.
"""
