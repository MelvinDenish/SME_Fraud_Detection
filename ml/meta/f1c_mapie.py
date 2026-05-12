"""F1c — Conformal Prediction (PRD §5.2).

MapieClassifier wraps the calibrated predictor.
Output: P(fraud) + [P_low, P_high] at alpha=0.10. Guarantees 90% empirical coverage.

TODO ML Phase 1-6 (Day 5). Acceptance: conformal intervals produced for all test samples.
"""
