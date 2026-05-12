"""F1a — LightGBM OOF Meta-learner (PRD §5.2).

Replaces deprecated static formula entirely.
K=5 OOF folds. Each L2 training sample's prediction is always made by a model that never saw that label.
Native LightGBM SHAP retained for internal debugging only — NOT surfaced to users (PRD §6.2).

TODO ML Phase 1-4 (Day 5). Acceptance: 'AUC on held-out test set > static formula AUC.'
"""
