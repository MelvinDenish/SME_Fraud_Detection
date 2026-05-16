import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  AnalyseResponse,
  BAND_PALETTE,
  DEMO_CINS,
  RiskBand,
  SEVERITY_PALETTE,
  api,
  downloadReport,
} from "../lib/api";

// Editorial spacing & color tokens are global from styles/tokens.css.
// SVG / recharts attribute values can't resolve `var(--token)` — only
// CSS `style` properties can. Mirror the relevant hexes here for chart
// consumers; keep them in sync with tokens.css.
const HEX = {
  paperDeep: "#ddd0ab",
  ink: "#0e0d0a",
  ink3: "#585045",
  riskCritical: "#7f1d1d",
  riskHigh: "#b45309",
  riskMedium: "#a16207",
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Tiny utilities

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

function GoldRule() {
  return <div className="rule-gold" aria-hidden />;
}

function InkRule() {
  return <div className="rule-ink" aria-hidden />;
}

// Animated count-up — drives the hero numeral up from 0 on first render.
function CountUp({
  value,
  duration = 0.7,
  decimals = 1,
}: {
  value: number;
  duration?: number;
  decimals?: number;
}) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v: number) => v.toFixed(decimals));
  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [mv, value, duration]);
  return <motion.span>{rounded}</motion.span>;
}

// ──────────────────────────────────────────────────────────────────────────
// Score plate — the hero. Huge serif numeral on the left, marginalia
// metadata table on the right. The band marker is a vertical ink slab.

function ScorePlate({ data }: { data: AnalyseResponse }) {
  const band = BAND_PALETTE[data.risk_band];
  const interval = data.p_fraud_interval;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)",
        gap: "var(--s-7)",
        padding: "var(--s-6) var(--s-7)",
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        borderTop: "1px solid var(--rule)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      {/* Band slab — vertical ink seal in the margin. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          background: band.bg,
        }}
      />

      <div style={{ display: "grid", gap: "var(--s-3)", alignContent: "start" }}>
        <Eyebrow>Subject · {data.cin}</Eyebrow>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1, 'wght' 380",
            fontSize: "var(--t-hero)",
            lineHeight: 0.92,
            letterSpacing: "-0.03em",
            color: "var(--ink)",
            display: "flex",
            alignItems: "baseline",
            gap: "var(--s-3)",
          }}
        >
          <CountUp value={data.fraud_risk_score} />
          <span
            style={{
              fontSize: "1.1rem",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--ink-3)",
              transform: "translateY(-2.2em)",
              letterSpacing: 0,
            }}
          >
            / 100
          </span>
        </div>
        <BandStamp band={data.risk_band} />
        {data.override_applied && (
          <div
            style={{
              marginTop: "var(--s-3)",
              padding: "var(--s-2) var(--s-3)",
              borderLeft: "3px solid var(--accent-gold)",
              background: "rgba(160, 113, 39, 0.08)",
              color: "var(--ink-2)",
              fontSize: "var(--t-meta)",
              maxWidth: 460,
            }}
          >
            <Eyebrow>Override invoked</Eyebrow>
            <div style={{ marginTop: 4 }}>
              PRD §7.3 floor applied — NCLT proceeding or wilful-defaulter declaration
              forces the score above the threshold for the assigned band.
            </div>
          </div>
        )}
      </div>

      <aside
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: "var(--s-3)",
          columnGap: "var(--s-4)",
          alignContent: "start",
          fontSize: "var(--t-meta)",
          color: "var(--ink-2)",
          paddingLeft: "var(--s-5)",
          borderLeft: "1px solid var(--rule-soft)",
        }}
      >
        <MetaLine label="Data confidence">
          <span className="num">{data.data_confidence}%</span>
        </MetaLine>
        <MetaLine label="Probability (calibrated)">
          <span className="num">
            {data.p_fraud_calibrated !== null
              ? (data.p_fraud_calibrated * 100).toFixed(1) + "%"
              : "—"}
          </span>
        </MetaLine>
        <MetaLine label="Conformal interval (α=0.10)">
          <span className="num">
            {interval
              ? `[${(interval[0] * 100).toFixed(1)}, ${(interval[1] * 100).toFixed(1)}]`
              : "—"}
          </span>
        </MetaLine>
        <MetaLine label="Ensemble disagreement">
          {data.ensemble_disagreement_flag ? (
            <span style={{ color: "var(--risk-high)", fontWeight: 600 }}>
              Diverged &gt; 30 pts
            </span>
          ) : (
            "Concordant"
          )}
        </MetaLine>
        <MetaLine label="Belief propagation">
          <span className="num">{data.propagation_score.toFixed(1)}</span>
          <BandStamp band={data.propagation_band} compact />
        </MetaLine>
      </aside>
    </motion.section>
  );
}

function MetaLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--t-eyebrow)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-4)",
          fontWeight: 600,
          whiteSpace: "nowrap",
          alignSelf: "center",
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "1rem",
          color: "var(--ink)",
        }}
      >
        {children}
      </dd>
    </>
  );
}

function BandStamp({
  band,
  compact = false,
}: {
  band: RiskBand;
  compact?: boolean;
}) {
  const palette = BAND_PALETTE[band];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: palette.bg,
        color: palette.fg,
        fontFamily: "var(--font-body)",
        fontWeight: 700,
        letterSpacing: compact ? "0.14em" : "0.22em",
        textTransform: "uppercase",
        fontSize: compact ? "0.65rem" : "0.78rem",
        padding: compact ? "2px 8px" : "4px 14px",
        border: "1px solid rgba(0,0,0,0.18)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: compact ? 5 : 6,
          height: compact ? 5 : 6,
          background: palette.fg,
          borderRadius: 0,
          display: "inline-block",
        }}
      />
      {palette.label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Module breakdown — recharts horizontal bar chart, editorial palette.

function ModuleBreakdown({ data }: { data: AnalyseResponse }) {
  const rows = Object.entries(data.module_breakdown)
    .map(([name, score]) => ({ name, score: Number(score.toFixed(2)) }))
    .sort((a, b) => b.score - a.score);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.score));

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.5 }}
    >
      <SectionHeader
        kicker="II ·"
        title="Per-module contributions"
        meta={`${rows.length} modules · max ${max.toFixed(1)} pts`}
      />
      <div
        style={{
          background: "var(--paper-elevated)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--s-5) var(--s-6) var(--s-3)",
        }}
      >
        <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 30)}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
            barCategoryGap={6}
          >
            <XAxis
              type="number"
              domain={[0, Math.ceil(max + 0.5)]}
              axisLine={{ stroke: "#1a1a1a", strokeWidth: 1 }}
              tickLine={false}
              tick={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fill: "#585045",
              }}
            />
            <YAxis
              dataKey="name"
              type="category"
              width={180}
              axisLine={false}
              tickLine={false}
              tick={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fill: "#0e0d0a",
              }}
            />
            <Bar
              dataKey="score"
              isAnimationActive
              animationDuration={650}
              animationEasing="ease-out"
            >
              {rows.map((r, i) => (
                <Cell
                  key={r.name}
                  fill={fillForScore(r.score, max)}
                  stroke="#0e0d0a"
                  strokeWidth={i === 0 ? 1 : 0.4}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  );
}

function fillForScore(score: number, max: number): string {
  if (score === 0) return HEX.paperDeep;
  const ratio = score / max;
  if (ratio > 0.7) return HEX.riskCritical;
  if (ratio > 0.4) return HEX.riskHigh;
  if (ratio > 0.15) return HEX.riskMedium;
  return HEX.ink3;
}

// ──────────────────────────────────────────────────────────────────────────
// Evidence chain — editorial signal cards with drop-cap on the first.

function EvidenceChain({ data }: { data: AnalyseResponse }) {
  const signals = data.evidence_chain;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.25, duration: 0.5 }}
    >
      <SectionHeader
        kicker="III ·"
        title="Evidence chain"
        meta={
          signals.length === 0
            ? "no signals fired"
            : `${signals.length} FraudSignals with TRIGGERED_BY provenance`
        }
      />
      {signals.length === 0 ? (
        <EmptyEvidence />
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            background: "var(--paper-elevated)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {signals.map((s, idx) => (
            <motion.li
              key={s.signal_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.3 + idx * 0.055,
                duration: 0.45,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: "var(--s-5)",
                padding: "var(--s-5) var(--s-6)",
                borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)",
              }}
            >
              <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
                <span
                  style={{
                    display: "inline-block",
                    background: SEVERITY_PALETTE[s.severity],
                    color: "white",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    padding: "3px 8px",
                    textTransform: "uppercase",
                    width: "fit-content",
                  }}
                >
                  {s.severity}
                </span>
                <span
                  className="num"
                  style={{
                    fontSize: "1.6rem",
                    fontWeight: 500,
                    color: "var(--ink)",
                  }}
                >
                  +{s.score_contribution.toFixed(1)}
                </span>
                <span className="eyebrow" style={{ color: "var(--ink-4)" }}>
                  {s.module_name.replace(/^m\d+_/, "M· ")}
                </span>
              </div>
              <div style={{ display: "grid", gap: "var(--s-2)" }}>
                <code
                  style={{
                    fontSize: "0.86rem",
                    color: "var(--ink-3)",
                    letterSpacing: 0,
                  }}
                >
                  {s.signal_type}
                </code>
                <p
                  className={idx === 0 ? "dropcap" : undefined}
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "1.05rem",
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
                  {s.evidence_string}
                </p>
                {s.triggered_by.length > 0 && (
                  <details
                    style={{
                      marginTop: 4,
                      fontSize: "var(--t-meta)",
                      color: "var(--ink-3)",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        listStyle: "none",
                        display: "inline-flex",
                        gap: 6,
                        color: "var(--accent-gold)",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                      }}
                    >
                      <span aria-hidden>▸</span> TRIGGERED_BY ·{" "}
                      {s.triggered_by.length} reference
                      {s.triggered_by.length === 1 ? "" : "s"}
                    </summary>
                    <ul
                      style={{
                        listStyle: "none",
                        padding: "8px 0 0 12px",
                        margin: 0,
                        borderLeft: "1px solid var(--rule-soft)",
                      }}
                    >
                      {s.triggered_by.map((ref, i) => (
                        <li
                          key={i}
                          className="mono"
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--ink-3)",
                            padding: "2px 0 2px 10px",
                          }}
                        >
                          {Object.entries(ref)
                            .map(([k, v]) => `${k}=${String(v)}`)
                            .join(" · ")}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      )}
    </motion.section>
  );
}

function EmptyEvidence() {
  return (
    <div
      style={{
        padding: "var(--s-7) var(--s-6)",
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gap: "var(--s-3)",
        textAlign: "center",
      }}
    >
      <Eyebrow>Clean subject</Eyebrow>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.5rem",
          color: "var(--ink-2)",
        }}
      >
        No FraudSignals fired against this subject.
      </p>
      <p style={{ color: "var(--ink-3)", fontSize: "var(--t-meta)" }}>
        The Tier-1 fan-out completed; no rule, anomaly, or graph-pattern detector flagged this CIN.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Section header — repeated editorial unit.

function SectionHeader({
  kicker,
  title,
  meta,
}: {
  kicker: string;
  title: string;
  meta?: string;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "var(--s-5)",
        margin: "var(--s-7) 0 var(--s-3)",
      }}
    >
      <h2 style={{ display: "flex", gap: "var(--s-3)", alignItems: "baseline" }}>
        <span
          style={{
            color: "var(--accent-gold)",
            fontFamily: "var(--font-mono)",
            fontSize: "1rem",
            fontWeight: 500,
            letterSpacing: 0,
          }}
        >
          {kicker}
        </span>
        {title}
      </h2>
      {meta && (
        <span
          className="eyebrow"
          style={{ color: "var(--ink-4)", whiteSpace: "nowrap" }}
        >
          {meta}
        </span>
      )}
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Query bar — editorial lookup affordance with chip shortcuts.

function QueryBar({
  initial,
  onSubmit,
}: {
  initial: string;
  onSubmit: (cin: string) => void;
}) {
  const [cin, setCin] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(cin.trim().toUpperCase());
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "var(--s-3) var(--s-4)",
        alignItems: "end",
        padding: "var(--s-5) var(--s-6)",
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "grid", gap: "var(--s-2)" }}>
        <label htmlFor="cin-input">
          <Eyebrow>Subject CIN</Eyebrow>
        </label>
        <input
          id="cin-input"
          value={cin}
          onChange={(e) => setCin(e.target.value)}
          placeholder="U45201MH2005PTC155294"
          spellCheck={false}
          autoCapitalize="characters"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "1.15rem",
            letterSpacing: 0,
            padding: "var(--s-3) 0",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--rule)",
            color: "var(--ink)",
            width: "100%",
            outline: "none",
          }}
        />
      </div>
      <button
        type="submit"
        style={{
          alignSelf: "end",
          padding: "12px 28px",
          background: "var(--ink)",
          color: "var(--paper)",
          border: "none",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontSize: "0.78rem",
          cursor: "pointer",
        }}
      >
        Analyse
      </button>
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--s-2)",
          alignItems: "center",
        }}
      >
        <Eyebrow>Demo subjects</Eyebrow>
        {Object.entries(DEMO_CINS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setCin(v);
              onSubmit(v);
            }}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              padding: "4px 10px",
              background: "transparent",
              color: "var(--ink-2)",
              border: "1px solid var(--rule-soft)",
              cursor: "pointer",
              letterSpacing: 0,
              transition: "background var(--d-quick) var(--ease-out)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--paper-deep)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {k}
          </button>
        ))}
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Loading / error plates — never bare text.

function LoadingPlate() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: "var(--s-7) var(--s-6)",
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gap: "var(--s-4)",
      }}
    >
      <Eyebrow>Fan-out in progress</Eyebrow>
      <div
        style={{
          height: 88,
          background:
            "linear-gradient(90deg, var(--paper-deep) 0%, var(--paper-elevated) 50%, var(--paper-deep) 100%)",
          backgroundSize: "200% 100%",
          animation: "skeleton 1.4s var(--ease-in-out) infinite",
          width: "60%",
        }}
      />
      <div
        style={{
          height: 14,
          background:
            "linear-gradient(90deg, var(--paper-deep) 0%, var(--paper-elevated) 50%, var(--paper-deep) 100%)",
          backgroundSize: "200% 100%",
          animation: "skeleton 1.4s var(--ease-in-out) infinite 0.1s",
          width: "85%",
        }}
      />
      <div
        style={{
          height: 14,
          background:
            "linear-gradient(90deg, var(--paper-deep) 0%, var(--paper-elevated) 50%, var(--paper-deep) 100%)",
          backgroundSize: "200% 100%",
          animation: "skeleton 1.4s var(--ease-in-out) infinite 0.2s",
          width: "72%",
        }}
      />
      <p
        style={{
          marginTop: "var(--s-3)",
          color: "var(--ink-3)",
          fontSize: "var(--t-meta)",
          fontStyle: "italic",
        }}
      >
        Running 11 Tier-1 modules in parallel via <code>asyncio.gather</code> — M1
        Beneish, M2 cross-statement, M3 Benford, M4 graph patterns, M5 peer,
        M6 temporal, M7 auditor NLP, M8 forensics, M9 NCLT, M10 hypergraph,
        M11 anomaly. The pipeline returns the PRD §7.1 dual-output payload
        once every module reports.
      </p>
      <style>{`@keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </motion.section>
  );
}

function ErrorPlate({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <section
      style={{
        padding: "var(--s-6) var(--s-6)",
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        borderLeft: "8px solid var(--risk-critical)",
        display: "grid",
        gap: "var(--s-3)",
      }}
    >
      <Eyebrow>Lookup failed</Eyebrow>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.6rem",
          color: "var(--ink)",
        }}
      >
        The fan-out could not complete.
      </h3>
      <code
        style={{
          fontSize: "0.85rem",
          color: "var(--ink-3)",
          padding: "var(--s-3)",
          background: "var(--paper-deep)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {error.message}
      </code>
      <div>
        <button
          onClick={onRetry}
          style={{
            padding: "8px 18px",
            background: "var(--ink)",
            color: "var(--paper)",
            border: "none",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontSize: "0.72rem",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// PDF export — kept compact, lives in the actions rail.

function PdfExportButton({ cin }: { cin: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
      <button
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await downloadReport(cin);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        style={{
          padding: "12px 24px",
          background: "var(--accent-gold)",
          color: "var(--ink)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontSize: "0.78rem",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Rendering PDF…" : "Export the dossier"}
      </button>
      {error && (
        <span style={{ color: "var(--risk-critical)", fontSize: "0.8rem" }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Page

export default function Dashboard() {
  const [submitted, setSubmitted] = useState(DEMO_CINS.ilfs);

  const query = useQuery({
    queryKey: ["analyse", submitted],
    queryFn: () => api.analyse(submitted),
    enabled: Boolean(submitted),
  });

  return (
    <article style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Masthead */}
      <header style={{ display: "grid", gap: "var(--s-3)" }}>
        <Eyebrow>Sentinel-G · Investigation Desk · Vol. 1</Eyebrow>
        <h1>The Analysis Dossier.</h1>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: "1.2rem",
            color: "var(--ink-3)",
            maxWidth: "62ch",
          }}
        >
          Eleven Tier-1 modules fan out across the company's master record,
          financial statements, related-party graph, NCLT proceedings, and
          wilful-defaulter declarations. The dual-output PRD §7.1 payload is
          rendered below — calibrated probability, conformal interval, and
          full evidence-chain provenance.
        </p>
        <GoldRule />
      </header>

      <QueryBar
        initial={submitted}
        onSubmit={(cin) => cin && setSubmitted(cin)}
      />

      {query.isLoading && <LoadingPlate />}
      {query.isError && (
        <ErrorPlate
          error={query.error as Error}
          onRetry={() => query.refetch()}
        />
      )}
      {query.data && (
        <>
          <SectionHeader
            kicker="I ·"
            title="Risk verdict"
            meta="PRD §7.1 dual-output payload"
          />
          <ScorePlate data={query.data} />
          <ModuleBreakdown data={query.data} />
          <EvidenceChain data={query.data} />

          {query.data.skipped_modules.length > 0 && (
            <section style={{ display: "grid", gap: "var(--s-2)" }}>
              <Eyebrow>Skipped modules</Eyebrow>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gap: 4,
                }}
              >
                {query.data.skipped_modules.map((sm) => (
                  <li
                    key={sm.module}
                    className="mono"
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--ink-3)",
                      paddingLeft: "var(--s-3)",
                      borderLeft: "1px solid var(--rule-soft)",
                    }}
                  >
                    {sm.module} — {sm.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <InkRule />
          <footer
            style={{
              display: "flex",
              gap: "var(--s-5)",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--s-5) 0 var(--s-7)",
            }}
          >
            <Link
              to={`/graph/${query.data.cin}`}
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: "1.15rem",
                color: "var(--ink)",
                textDecoration: "underline",
                textDecorationColor: "var(--accent-gold)",
                textUnderlineOffset: 4,
                textDecorationThickness: 1.5,
              }}
            >
              Continue to the evidence graph →
            </Link>
            <PdfExportButton cin={query.data.cin} />
          </footer>
        </>
      )}
    </article>
  );
}
