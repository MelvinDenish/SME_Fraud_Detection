"""D5 — Mamba SSM (sequence, supervised). PRD §5.1.

Transaction sequence: (amount, counterparty_type, gst_status, timestamp_delta).
Pad/truncate to max_len=128. 2-layer Mamba, state_dim=64.
Fallback: TCN if CUDA unavailable (kernel=3, 4 layers, 64 filters).

NOTE: mamba-ssm is Linux+CUDA only. Train locally on RTX 3050 or in Colab;
production inference path on Fly.io free uses TCN fallback (CPU-friendly).

TODO ML Phase 3-2 (Day 11).
"""
