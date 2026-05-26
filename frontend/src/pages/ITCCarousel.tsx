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

function CarouselCard({ cin, role, node, data, isLoading, isFetching, failureCount, error }: {
  cin: string;
  role: string;
  node: string;
  data?: AnalyseResponse;
  isLoading: boolean;
  isFetching: boolean;
  failureCount: number;
  error: unknown;
}) {
  // Treat in-flight retries as "still loading" so the card doesn't flash
  // a transient 429 between attempts. Only the terminal failure shows as
  // an error.
  const retrying = isFetching && failureCount > 0 && !data;
  const showLoading = isLoading || retrying;
  const showError = !!error && !showLoading;
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

      {showLoading && (
        <p style={{ color: "var(--ink-4)", margin: "var(--s-4) 0 0", fontFamily: "var(--font-body)", fontSize: "var(--t-meta)" }}>
          {retrying
            ? `Still trying… (attempt ${failureCount + 1} of 4)`
            : "Running analysis…"}
        </p>
      )}
      {showError && (
        <p style={{ color: "var(--risk-critical)", margin: "var(--s-4) 0 0", fontFamily: "var(--font-body)", fontSize: "var(--t-meta)" }}>
          {(error as Error).message}
        </p>
      )}

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
              <p style={{ ...eyebrow, margin: 0 }}>Info Quality</p>
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

// Stream 1.4 — retry policy for the three concurrent /analyse calls.
// day27_rehearsal.json showed nodes B + C hitting 429 because /analyse
// burns 3 budget slots in the global 10/min/IP rate-limit window. With
// the Stream 1.2 prod default of 60/min the contention is gone, but we
// still want a real retry for transient failures (cold boot, brief Fly.io
// VM hand-off, etc.). React Query's exponential backoff: 300 / 900 / 2700ms.
// We only retry on rate-limit and 5xx — auth/404/422 are permanent.
const RETRIABLE_HTTP_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRetriable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // api.ts formats errors as "GET /path -> 429: ..." — fish the status out.
  const match = msg.match(/-> (\d{3})/);
  if (!match) return false;
  return RETRIABLE_HTTP_CODES.has(Number(match[1]));
}

export default function ITCCarousel() {
  const results = useQueries({
    queries: CAROUSEL_CINS.map((c) => ({
      queryKey: ["analyse", c.cin],
      queryFn: () => api.analyse(c.cin),
      retry: (failureCount: number, error: unknown) =>
        failureCount < 3 && isRetriable(error),
      retryDelay: (attempt: number) => Math.min(300 * 3 ** attempt, 2700),
    })),
  });

  return (
    <div style={{ display: "grid", gap: "var(--s-6)", maxWidth: 960 }}>
      <header style={{ borderBottom: "1px solid var(--rule)", paddingBottom: "var(--s-5)" }}>
        <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-2)" }}>
          Investigation · GST Tax Credit Fraud Ring
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
          Three companies appear to be routing fake GST tax credit claims through
          each other in a closed loop — modelled on a real 2022 case. All three
          share registered addresses and bank branches, which our network and
          shell-entity checks have flagged.
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
          isFetching={results[i].isFetching}
          failureCount={results[i].failureCount}
          error={results[i].error}
        />
      ))}
    </div>
  );
}
