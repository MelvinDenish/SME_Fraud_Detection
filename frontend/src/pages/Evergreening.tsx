import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BAND_PALETTE, DEMO_CINS, api } from "../lib/api";

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 8,
  padding: "1.25rem 1.5rem",
  boxShadow: "0 1px 2px rgba(15,23,42,.07)",
};

export default function Evergreening() {
  const query = useQuery({
    queryKey: ["analyse", DEMO_CINS.dhfl],
    queryFn: () => api.analyse(DEMO_CINS.dhfl),
  });

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Bank-Loan Evergreening</h1>
        <p style={{ color: "#475569", margin: ".25rem 0 0" }}>
          DHFL canonical case (CIRP 2019-11-29). PRD §4.4 evergreening
          patterns 13–17 + Module 9 NCLT/WD override should both fire,
          promoting fraud_risk_score ≥ 75 regardless of Tier-1 weighting.
        </p>
      </header>

      {query.isLoading && <p>Loading DHFL analysis…</p>}
      {query.error && (
        <div style={{ ...cardStyle, borderLeft: "6px solid #b91c1c" }}>
          <strong>Lookup failed:</strong> {(query.error as Error).message}
        </div>
      )}
      {query.data && (
        <div style={{ ...cardStyle, borderLeft: `6px solid ${BAND_PALETTE[query.data.risk_band].bg}` }}>
          <h2 style={{ margin: 0 }}>{query.data.cin}</h2>
          <div style={{ display: "flex", gap: "2rem", margin: "0.75rem 0", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: ".85rem" }}>fraud_risk_score</div>
              <div style={{ fontSize: "2rem", fontWeight: 600 }}>{query.data.fraud_risk_score.toFixed(1)}</div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: ".85rem" }}>risk_band</div>
              <div><span style={{
                background: BAND_PALETTE[query.data.risk_band].bg,
                color: BAND_PALETTE[query.data.risk_band].fg,
                padding: "0.25rem 0.75rem", borderRadius: 999, fontWeight: 600,
              }}>{query.data.risk_band}</span></div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: ".85rem" }}>override_applied</div>
              <div style={{ fontSize: "1.25rem" }}>{query.data.override_applied ? "✓ NCLT/WD" : "—"}</div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: ".85rem" }}>data_confidence</div>
              <div style={{ fontSize: "1.25rem" }}>{query.data.data_confidence}%</div>
            </div>
          </div>
          <h3>Evidence summary</h3>
          <ul>
            {query.data.evidence_chain.slice(0, 8).map((s) => (
              <li key={s.signal_id} style={{ marginBottom: ".5rem" }}>
                <code>{s.signal_type}</code> · {s.evidence_string}
              </li>
            ))}
            {query.data.evidence_chain.length > 8 && (
              <li style={{ color: "#64748b" }}>… and {query.data.evidence_chain.length - 8} more</li>
            )}
          </ul>
          <p>
            <Link to={`/graph/${query.data.cin}`}>Open in Graph Explorer →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
