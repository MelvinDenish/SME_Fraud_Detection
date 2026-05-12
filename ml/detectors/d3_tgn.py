"""D3 — Temporal Graph Network (PRD §5.1, replaces static GCN).

torch_geometric.nn.models.TGNMemory + GraphAttentionEmbedding.
2-layer, memory_dim=64, embedding_dim=64. Edge pruning: drop weight < 0.05.
Inductive inference via mean-aggregation fallback for unseen entities.

TODO ML Phase 2-1 (Day 7). Acceptance: 'TGN trains without error on transaction graph.'
"""
