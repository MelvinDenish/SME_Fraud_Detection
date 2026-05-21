import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AnalyseResponse, BAND_PALETTE, api } from "../lib/api";

// Three CINs from the WD / NCLT seed set that map to ITC-style risk:
// each /analyse call lands at CRITICAL via the Day-12 override path so
// the carousel page lights up end-to-end on cold fixtures. The 7-node
// synthetic ring at infra/seeds/itc_carousel/ring.json renders alongside
// in the Graph Explorer; this view shows the SME-side of the carousel.
const CAROUSEL_CINS: { cin: string; role: string; node: string }[] = [
  { cin: "U27109MH2018PTC312456", node: "A", role: "Issuer · PNB WD-flagged" },
  { cin: "U46101MH2017PTC289123", node: "B", role: "Recipient · Canara WD-flagged" },
  { cin: "U46190MH2019PTC295432", node: "C", role: "Conduit · Suit filed" },
];

const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "var(--t-eyebrow)",
  letterSpacing: "0.28em",
  textTransform: "uppercase",
  color: "var(--accent-gold)",
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  background: "var(--paper-elevated)",
  padding: "var(--s-6)",
  borderTop: "1px solid var(--rule)",
  borderBottom: "1px solid var(--rule-soft)",
  boxShadow: "var(--shadow-card)",
};

function CarouselCard({ cin, role, node, data, isLoading, error }: {
  cin: string;
  role: string;
  node: string;
  data?: AnalyseResponse;
  isLoading: boolean;
  error: unknown;
}) {
  const band = data ? BAND_PALETTE[data.risk_band] : null;
  return (
    <article style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-5)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-2)" }}>Node {node}</p>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h3)",
            color: "var(--ink)",
            margin: 0,
            marginBottom: "var(--s-2)",
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}>{role}</h2>
          <code style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-meta)",
            color: "var(--ink-3)",
          }}>{cin}</code>
        </div>
        {band && (
          <span style={{
            background: band.bg, color: band.fg,
            padding: "var(--s-2) var(--s-4)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--t-eyebrow)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}>{data!.risk_band}</span>
        )}
      </div>

      {isLoading && (
        <p style={{ color: "var(--ink-4)", margin: "var(--s-4) 0 0", fontFamily: "var(--font-body)", fontSize: "var(--t-meta)" }}>
          Fanning out signals…
        </p>
      )}
      {error ? (
        <p style={{ color: "var(--risk-critical)", margin: "var(--s-4) 0 0", fontFamily: "var(--font-body)", fontSize: "var(--t-meta)" }}>
          {(error as Error).message}
        </p>
      ) : null}

      {data && (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--s-5)",
            marginTop: "var(--s-5)",
            paddingTop: "var(--s-4)",
            borderTop: "1px solid var(--rule-soft)",
          }}>
            <div>
              <p style={{ ...eyebrow, margin: 0 }}>Score</p>
              <p style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--t-h2)",
                fontWeight: 500,
                color: "var(--ink)",
                margin: "var(--s-1) 0 0",
              }}>{data.fraud_risk_score.toFixed(1)}</p>
            </div>
            <div>
              <p style={{ ...eyebrow, margin: 0 }}>Data conf.</p>
              <p style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-h3)",
                color: "var(--ink)",
                margin: "var(--s-1) 0 0",
              }}>{data.data_confidence}%</p>
            </div>
            <div>
              <p style={{ ...eyebrow, margin: 0 }}>Signals</p>
              <p style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-h3)",
                color: "var(--ink)",
                margin: "var(--s-1) 0 0",
              }}>{data.evidence_chain.length}</p>
            </div>
          </div>
          <Link
            to={`/graph/${cin}`}
            style={{
              display: "inline-block",
              marginTop: "var(--s-5)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--t-eyebrow)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--accent-gold)",
              textDecoration: "none",
              borderBottom: "1px solid var(--accent-gold)",
              paddingBottom: 2,
            }}
          >
            Open in graph explorer →
          </Link>
        </>
      )}
    </article>
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
    <div style={{ display: "grid", gap: "var(--s-6)", maxWidth: 960 }}>
      <header style={{ borderBottom: "1px solid var(--rule)", paddingBottom: "var(--s-5)" }}>
        <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-2)" }}>
          Investigation · GST Input-Tax-Credit Ring
        </p>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-h1)",
          fontWeight: 500,
          color: "var(--ink)",
          margin: 0,
          letterSpacing: "-0.01em",
        }}>
          ITC Carousel
        </h1>
        <div style={{ height: 1, background: "var(--accent-gold)", width: 56, margin: "var(--s-4) 0" }} aria-hidden />
        <p style={{
          color: "var(--ink-2)",
          margin: 0,
          fontFamily: "var(--font-body)",
          fontSize: "var(--t-body)",
          maxWidth: "60ch",
          lineHeight: 1.6,
        }}>
          Synthetic GST input-tax-credit carousel modelled on the 2022 DGGI Delhi
          Zonal Unit ring. Three nodes share addresses + bank branches; Module 10
          (hypergraph shell) and Module 4 (SCC patterns) should flag every member.
        </p>
      </header>
      {CAROUSEL_CINS.map((c, i) => (
        <CarouselCard
          key={c.cin}
          cin={c.cin}
          role={c.role}
          node={c.node}
          data={results[i].data}
          isLoading={results[i].isLoading}
          error={results[i].error}
        />
      ))}
    </div>
  );
}
