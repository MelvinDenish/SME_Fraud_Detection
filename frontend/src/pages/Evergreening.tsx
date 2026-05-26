import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BAND_PALETTE, DEMO_CINS, api } from "../lib/api";

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
  padding: "var(--s-7) var(--s-6)",
  borderTop: "1px solid var(--rule)",
  borderBottom: "1px solid var(--rule-soft)",
  boxShadow: "var(--shadow-card)",
};

const metaLabel: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "var(--t-eyebrow)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: 0,
  marginBottom: "var(--s-1)",
  fontWeight: 600,
};

export default function Evergreening() {
  const query = useQuery({
    queryKey: ["analyse", DEMO_CINS.dhfl],
    queryFn: () => api.analyse(DEMO_CINS.dhfl),
  });
  const band = query.data ? BAND_PALETTE[query.data.risk_band] : null;

  return (
    <div style={{ display: "grid", gap: "var(--s-6)", maxWidth: 960 }}>
      <header style={{ borderBottom: "1px solid var(--rule)", paddingBottom: "var(--s-5)" }}>
        <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-2)" }}>
          Investigation · Hidden Loan Defaults
        </p>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-h1)",
          fontWeight: 500,
          color: "var(--ink)",
          margin: 0,
          letterSpacing: "-0.01em",
        }}>
          DHFL · CIRP 2019-11-29
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
          DHFL repeatedly rolled over loans that were already in default, disguising
          bad debt as healthy credit. We detected five separate patterns of this
          behaviour — and because DHFL is under active insolvency proceedings, the
          risk score is automatically raised to reflect the legal record.
        </p>
      </header>

      {query.isLoading && (
        <p style={{ color: "var(--ink-4)", fontFamily: "var(--font-body)", fontSize: "var(--t-meta)", margin: 0 }}>
          Resolving DHFL evidence chain…
        </p>
      )}
      {query.error && (
        <article style={{ ...cardStyle, borderLeft: `4px solid var(--risk-critical)` }}>
          <p style={{ ...metaLabel, color: "var(--risk-critical)" }}>Lookup failed</p>
          <p style={{ color: "var(--ink)", margin: 0, fontFamily: "var(--font-body)" }}>
            {(query.error as Error).message}
          </p>
        </article>
      )}

      {query.data && band && (
        <article style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-5)" }}>
            <div>
              <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-2)" }}>Subject CIN</p>
              <code style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-body)",
                color: "var(--ink)",
              }}>{query.data.cin}</code>
            </div>
            <span style={{
              background: band.bg, color: band.fg,
              padding: "var(--s-2) var(--s-4)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--t-eyebrow)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}>{query.data.risk_band}</span>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "var(--s-5)",
            marginTop: "var(--s-6)",
            paddingTop: "var(--s-5)",
            borderTop: "1px solid var(--rule-soft)",
          }}>
            <div>
              <p style={metaLabel}>Fraud risk</p>
              <p style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--t-h2)",
                fontWeight: 500,
                color: "var(--ink)",
                margin: 0,
              }}>{query.data.fraud_risk_score.toFixed(1)}</p>
            </div>
            <div>
              <p style={metaLabel}>Score Raised By</p>
              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--t-h3)",
                color: "var(--ink)",
                margin: 0,
              }}>{query.data.override_applied ? "Court Records" : "—"}</p>
            </div>
            <div>
              <p style={metaLabel}>Info Quality</p>
              <p style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-h3)",
                color: "var(--ink)",
                margin: 0,
              }}>{query.data.data_confidence}%</p>
            </div>
            <div>
              <p style={metaLabel}>Signals</p>
              <p style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-h3)",
                color: "var(--ink)",
                margin: 0,
              }}>{query.data.evidence_chain.length}</p>
            </div>
          </div>

          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h3)",
            fontWeight: 500,
            color: "var(--ink)",
            margin: "var(--s-6) 0 var(--s-4)",
            paddingBottom: "var(--s-3)",
            borderBottom: "1px solid var(--rule-soft)",
          }}>
            Evidence summary
          </h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {query.data.evidence_chain.slice(0, 8).map((s) => (
              <li key={s.signal_id} style={{
                marginBottom: "var(--s-4)",
                paddingLeft: "var(--s-4)",
                borderLeft: "2px solid var(--rule-soft)",
              }}>
                <p style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--t-eyebrow)",
                  color: "var(--accent-gold)",
                  letterSpacing: "0.08em",
                  margin: 0,
                  marginBottom: "var(--s-1)",
                  fontWeight: 600,
                }}>{s.signal_type}</p>
                <p style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--t-meta)",
                  color: "var(--ink-2)",
                  margin: 0,
                  lineHeight: 1.5,
                }}>{s.evidence_string}</p>
              </li>
            ))}
            {query.data.evidence_chain.length > 8 && (
              <li style={{
                color: "var(--ink-4)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--t-meta)",
                marginTop: "var(--s-3)",
              }}>
                … and {query.data.evidence_chain.length - 8} more signals in the chain.
              </li>
            )}
          </ul>
          <Link
            to={`/graph/${query.data.cin}`}
            style={{
              display: "inline-block",
              marginTop: "var(--s-6)",
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
        </article>
      )}
    </div>
  );
}
