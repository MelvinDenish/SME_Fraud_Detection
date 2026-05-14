import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AnalyseResponse, BAND_PALETTE, api } from "../lib/api";

// The fixture set ships three synthetic ITC-carousel nodes (PRD §10 Day 6).
// They share addresses and bank branches so the M10 hypergraph fires.
const CAROUSEL_CINS: { cin: string; role: string }[] = [
  { cin: "U74999DL2012PTC230001", role: "Node A — Issuer" },
  { cin: "U74999DL2012PTC230002", role: "Node B — Recipient" },
  { cin: "U74999DL2012PTC230003", role: "Missing Trader C" },
];

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 8,
  padding: "1.25rem",
  boxShadow: "0 1px 2px rgba(15,23,42,.07)",
};

function CarouselCard({ cin, role, data, isLoading, error }: {
  cin: string;
  role: string;
  data?: AnalyseResponse;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <strong>{role}</strong>
          <div style={{ color: "#64748b", fontSize: ".85rem" }}>{cin}</div>
        </div>
        {data && (
          <span style={{
            background: BAND_PALETTE[data.risk_band].bg,
            color: BAND_PALETTE[data.risk_band].fg,
            padding: "0.25rem 0.75rem", borderRadius: 999, fontSize: ".8rem", fontWeight: 600,
          }}>{data.risk_band}</span>
        )}
      </div>
      {isLoading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
      {error ? <p style={{ color: "crimson" }}>{(error as Error).message}</p> : null}
      {data && (
        <>
          <p style={{ margin: "0.5rem 0", color: "#475569" }}>
            score <strong>{data.fraud_risk_score.toFixed(1)}</strong> ·
            DC {data.data_confidence}% ·
            {data.evidence_chain.length} signals
          </p>
          <Link to={`/graph/${cin}`} style={{ fontSize: ".9rem" }}>Open in Graph Explorer →</Link>
        </>
      )}
    </div>
  );
}

export default function ITCCarousel() {
  const results = useQueries({
    queries: CAROUSEL_CINS.map((c) => ({
      queryKey: ["analyse", c.cin],
      queryFn: () => api.analyse(c.cin),
      retry: 0,
    })),
  });

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>ITC Carousel</h1>
        <p style={{ color: "#475569", margin: ".25rem 0 0" }}>
          Synthetic GST input-tax-credit carousel modelled on the 2022 DGGI
          Delhi Zonal Unit ring. Three nodes share addresses + bank branches;
          Module 10 hypergraph + Module 4 SCC patterns should flag every
          member.
        </p>
      </header>
      {CAROUSEL_CINS.map((c, i) => (
        <CarouselCard
          key={c.cin}
          cin={c.cin}
          role={c.role}
          data={results[i].data}
          isLoading={results[i].isLoading}
          error={results[i].error}
        />
      ))}
    </div>
  );
}
