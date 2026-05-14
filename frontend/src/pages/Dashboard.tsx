import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AnalyseResponse,
  BAND_PALETTE,
  DEMO_CINS,
  SEVERITY_PALETTE,
  api,
} from "../lib/api";

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 8,
  padding: "1.25rem 1.5rem",
  boxShadow: "0 1px 2px rgba(15,23,42,.07), 0 1px 3px rgba(15,23,42,.05)",
};

function ScoreCard({ data }: { data: AnalyseResponse }) {
  const band = BAND_PALETTE[data.risk_band];
  return (
    <div style={{ ...cardStyle, borderLeft: `6px solid ${band.bg}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: "2.25rem" }}>{data.fraud_risk_score.toFixed(1)}</h2>
        <span style={{
          background: band.bg, color: band.fg,
          padding: "0.25rem 0.75rem", borderRadius: 999, fontWeight: 600, fontSize: ".85rem",
        }}>{band.label}</span>
      </div>
      <p style={{ marginTop: "0.25rem", color: "#475569" }}>
        fraud_risk_score · band per PRD §7.2
      </p>
      <hr style={{ borderColor: "#e2e8f0" }} />
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: ".25rem 1rem", margin: 0 }}>
        <dt>data_confidence</dt><dd>{data.data_confidence}%</dd>
        <dt>override_applied</dt><dd>{data.override_applied ? "yes (NCLT/WD)" : "no"}</dd>
        <dt>ensemble_disagreement</dt><dd>{data.ensemble_disagreement_flag ? "yes" : "no"}</dd>
        <dt>propagation_band</dt><dd>{data.propagation_band} ({data.propagation_score.toFixed(1)})</dd>
        <dt>p_fraud_calibrated</dt><dd>{data.p_fraud_calibrated ?? "—"}</dd>
        <dt>p_fraud_interval</dt><dd>{data.p_fraud_interval ? `[${data.p_fraud_interval[0]}, ${data.p_fraud_interval[1]}]` : "—"}</dd>
      </dl>
    </div>
  );
}

function ModuleBreakdown({ data }: { data: AnalyseResponse }) {
  const rows = Object.entries(data.module_breakdown).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Per-module Tier-1 contributions</h3>
      {rows.map(([mod, score]) => (
        <div key={mod} style={{ display: "grid", gridTemplateColumns: "200px 1fr 60px", gap: 12, padding: "4px 0", alignItems: "center" }}>
          <code style={{ fontSize: ".85rem" }}>{mod}</code>
          <div style={{ background: "#e2e8f0", borderRadius: 4, overflow: "hidden", height: 10 }}>
            <div style={{ width: `${(score / max) * 100}%`, height: "100%", background: "#0f172a" }} />
          </div>
          <span style={{ textAlign: "right", color: score > 0 ? "#0f172a" : "#94a3b8" }}>{score.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ data }: { data: AnalyseResponse }) {
  if (data.evidence_chain.length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Evidence chain</h3>
        <p style={{ color: "#94a3b8" }}>No FraudSignals fired on this company.</p>
      </div>
    );
  }
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Evidence chain ({data.evidence_chain.length} signals)</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {data.evidence_chain.map((s) => (
          <li key={s.signal_id} style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{
                background: SEVERITY_PALETTE[s.severity], color: "white",
                padding: "1px 8px", borderRadius: 4, fontSize: ".75rem", fontWeight: 600,
              }}>{s.severity}</span>
              <code style={{ fontSize: ".85rem" }}>{s.signal_type}</code>
              <span style={{ color: "#64748b", fontSize: ".85rem" }}>{s.module_name} · +{s.score_contribution.toFixed(1)}</span>
            </div>
            <p style={{ margin: "0.5rem 0 0", color: "#1e293b" }}>{s.evidence_string}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const [cin, setCin] = useState(DEMO_CINS.ilfs);
  const [submitted, setSubmitted] = useState(DEMO_CINS.ilfs);

  const query = useQuery({
    queryKey: ["analyse", submitted],
    queryFn: () => api.analyse(submitted),
    enabled: Boolean(submitted),
  });

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ color: "#475569", margin: ".25rem 0 0" }}>
          Look up a CIN. The /analyse endpoint fans out across Tier-1 modules
          and returns the PRD §7.1 dual-output payload.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); setSubmitted(cin.trim().toUpperCase()); }}
        style={{ ...cardStyle, display: "flex", gap: "0.75rem", alignItems: "center" }}
      >
        <label htmlFor="cin-input" style={{ fontWeight: 600 }}>CIN</label>
        <input
          id="cin-input"
          value={cin}
          onChange={(e) => setCin(e.target.value)}
          placeholder="U45201MH2005PTC155294"
          style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 4 }}
        />
        <button
          type="submit"
          style={{ padding: "0.5rem 1rem", border: 0, background: "#0f172a", color: "white", borderRadius: 4, cursor: "pointer" }}
        >Analyse</button>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(DEMO_CINS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setCin(v); setSubmitted(v); }}
              style={{ padding: "0.4rem 0.6rem", fontSize: ".75rem", background: "#e2e8f0", border: 0, borderRadius: 4, cursor: "pointer" }}
            >{k}</button>
          ))}
        </div>
      </form>

      {query.isLoading && <p>Running 7-module fan-out…</p>}
      {query.error && (
        <div style={{ ...cardStyle, borderLeft: "6px solid #b91c1c" }}>
          <strong>Lookup failed:</strong> {(query.error as Error).message}
        </div>
      )}
      {query.data && (
        <>
          <ScoreCard data={query.data} />
          <ModuleBreakdown data={query.data} />
          <EvidenceList data={query.data} />
          <p style={{ textAlign: "right" }}>
            <Link to={`/graph/${query.data.cin}`}>View evidence graph →</Link>
          </p>
        </>
      )}
    </div>
  );
}
