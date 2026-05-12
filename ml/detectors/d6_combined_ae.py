"""D6 — Combined Autoencoder (tabular + graph). PRD §5.1.

Concatenate [20 financial features, 7 graph features] = 27-dim.
Normalize each group to [0,1] independently. Encoder [27 -> 64 -> 32 -> 16], mirrored decoder.
ReLU, BatchNorm, dropout=0.2. Reconstruction error -> [0,1] via 99th percentile normalization.

TODO ML Phase 3-3, 3-4 (Day 12).
"""
