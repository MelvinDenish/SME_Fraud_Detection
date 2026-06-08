import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
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
  RiskBand,
  SEVERITY_PALETTE,
  api,
  downloadReport,
} from "../lib/api";
import NarrativeCard from "../components/NarrativeCard";
import OnboardingHint from "../components/OnboardingHint";
import { DEMO_CASES } from "../lib/demoCases";
import type { TrendingCluster, TrendingFeed } from "../lib/api";

const RECENT_CINS_KEY = "sentinelg.recent.cins";
const RECENT_CINS_MAX = 5;

function readRecentCins(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_CINS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, RECENT_CINS_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecentCin(cin: string) {
  if (!cin) return;
  try {
    const prev = readRecentCins().filter((c) => c !== cin);
    const next = [cin, ...prev].slice(0, RECENT_CINS_MAX);
    localStorage.setItem(RECENT_CINS_KEY, JSON.stringify(next));
  } catch {
    /* localStorage may be disabled — no-op */
  }
}

const HEX = {
  paperDeep: "#ddd0ab",
  ink: "#0e0d0a",
  ink3: "#585045",
  riskCritical: "#7f1d1d",
  riskHigh: "#b45309",
  riskMedium: "#a16207",
} as const;

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  m01_beneish:           "Financial Statement Quality",
  m02_cross_statement:   "Revenue vs. Tax Consistency",
  m03_benford:           "Number Pattern Check",
  m04_graph_patterns:    "Network Connections",
  m05_peer_deviation:    "Industry Benchmark",
  m06_temporal:          "Timeline Red Flags",
  m07_auditor_nlp:       "Auditor Report",
  m08_document_forensics:"Document Integrity",
  m09_nclt_defaulter:    "Legal & Default Records",
  m10_hypergraph_shell:  "Shell Entity Check",
  m11_anomaly:           "Statistical Anomalies",
};

function prettySignalType(raw: string): string {
  return raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyModuleName(raw: string): string {
  return MODULE_DISPLAY_NAMES[raw] ?? raw.replace(/^m\d+_/, "").replace(/_/g, " ");
}

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
    // Reset to 0 each time `value` changes so a rapid CIN switch always
    // counts up from zero rather than from the in-flight position of the
    // prior (still-running) animation. Without this, double-clicking demo
    // chips makes the hero numeral jump to a mid-value and crawl from there.
    mv.set(0);
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
              Score raised — an active court proceeding or wilful defaulter listing
              was found for this company. The risk score is elevated above the
              normal band threshold as a result.
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
        <MetaLine label="Information Quality">
          <span className="num">{data.data_confidence}%</span>
        </MetaLine>
        <MetaLine label="Fraud Likelihood">
          <span className="num">
            {data.p_fraud_calibrated !== null
              ? (data.p_fraud_calibrated * 100).toFixed(1) + "%"
              : "—"}
          </span>
        </MetaLine>
        <MetaLine label="Likelihood Range (90%)">
          <span className="num">
            {interval
              ? `[${(interval[0] * 100).toFixed(1)}%, ${(interval[1] * 100).toFixed(1)}%]`
              : "—"}
          </span>
        </MetaLine>
        <MetaLine label="Check Agreement">
          {data.ensemble_disagreement_flag ? (
            <span style={{ color: "var(--risk-high)", fontWeight: 600 }}>
              Checks disagree
            </span>
          ) : (
            "All checks agree"
          )}
        </MetaLine>
        <MetaLine label="Network Risk Spread">
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
    .map(([key, score]) => ({
      name: MODULE_DISPLAY_NAMES[key] ?? key.replace(/^m\d+_/, "").replace(/_/g, " "),
      score: Number(score.toFixed(2)),
    }))
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
        title="What We Checked"
        meta={`${rows.length} checks · highest score ${max.toFixed(1)}`}
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
        title="Why We're Flagging This"
        meta={
          signals.length === 0
            ? "no warning signs found"
            : `${signals.length} warning sign${signals.length === 1 ? "" : "s"} found`
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
                  {prettyModuleName(s.module_name)}
                </span>
              </div>
              <div style={{ display: "grid", gap: "var(--s-2)" }}>
                <span
                  style={{
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    color: "var(--ink-2)",
                    letterSpacing: 0,
                  }}
                >
                  {prettySignalType(s.signal_type)}
                </span>
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
                <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "center", flexWrap: "wrap" }}>
                  {s.triggered_by.length > 0 && (
                    <details
                      style={{
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
                        <span aria-hidden>▸</span> Source records ·{" "}
                        {s.triggered_by.length} record
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
                  <Link
                    to={`/graph/${data.cin}?signal=${encodeURIComponent(s.signal_id)}`}
                    style={{
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-body)",
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--accent-gold)",
                      textDecoration: "none",
                      borderBottom: "1px solid var(--accent-gold)",
                      paddingBottom: 1,
                    }}
                  >
                    Highlight in graph →
                  </Link>
                </div>
              </div>
            </motion.li>
          ))}
        </ol>
      )}
    </motion.section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Low-data banner — shown when data_confidence is too low for a meaningful
// score. Without this, a real user searching a TN company that has only
// master-data on file sees a row of zeroed module scores and assumes the
// product is broken. This redirects them to the upload flow instead.

function LowDataBanner({ cin, dataConfidence }: { cin: string; dataConfidence: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--s-5) var(--s-6)",
        borderLeft: "8px solid var(--accent-gold)",
        display: "grid",
        gap: "var(--s-3)",
      }}
    >
      <Eyebrow>Limited Data Available · {dataConfidence}% Complete</Eyebrow>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          color: "var(--ink)",
          margin: 0,
          lineHeight: 1.25,
        }}
      >
        Only public master data on file for this company.
      </h3>
      <p
        style={{
          color: "var(--ink-2)",
          fontSize: "1rem",
          lineHeight: 1.55,
          margin: 0,
          maxWidth: "62ch",
        }}
      >
        We have the registration record (name, NIC code, state, incorporation
        date), but no financial statements, GST returns, or auditor reports
        yet. Most fraud signals require these inputs. Upload the company's
        audited financials (AOC-4) or recent P&amp;L to unlock the full
        analysis.
      </p>
      <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center", marginTop: "var(--s-2)" }}>
        <Link
          to={`/upload?cin=${encodeURIComponent(cin)}`}
          style={{
            padding: "10px 22px",
            background: "var(--ink)",
            color: "var(--paper)",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontSize: "0.78rem",
            textDecoration: "none",
          }}
        >
          Upload financials →
        </Link>
        <span style={{ fontSize: "var(--t-meta)", color: "var(--ink-4)", fontStyle: "italic" }}>
          PDF · ₹0 · processed in seconds
        </span>
      </div>
    </motion.section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Empty-state panels — shown when no CIN is submitted yet. Replaces the
// "blank form" first-impression problem with Quick-start chips + a
// localStorage-backed Recently-analysed list.

function QuickStartPanel({ onPick }: { onPick: (cin: string, route: string) => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      style={{
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--s-5) var(--s-6)",
        display: "grid",
        gap: "var(--s-4)",
      }}
    >
      <header style={{ display: "grid", gap: "var(--s-2)" }}>
        <Eyebrow>Quick start · verified cases</Eyebrow>
        <p style={{
          margin: 0, fontFamily: "var(--font-display)", fontStyle: "italic",
          fontSize: "1.1rem", color: "var(--ink-2)", maxWidth: "60ch",
        }}>
          Click any of the four real fraud cases below to run a live
          analysis in under 4 seconds. Each is anchored on public-record
          court / regulator data.
        </p>
      </header>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "var(--s-3)",
      }}>
        {DEMO_CASES.map((demo) => {
          const palette = BAND_PALETTE[demo.band];
          return (
            <button
              key={demo.key}
              type="button"
              onClick={() => onPick(demo.cin, demo.route)}
              style={{
                display: "grid", gap: 6,
                padding: "var(--s-3) var(--s-4)",
                background: "var(--paper)",
                border: "1px solid var(--rule-soft)",
                borderLeft: `3px solid ${palette.bg}`,
                cursor: "pointer", textAlign: "left", borderRadius: 0,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 500, color: "var(--ink)" }}>
                  {demo.name}
                </span>
                <span style={{
                  background: palette.bg, color: palette.fg,
                  fontSize: "8px", fontWeight: 700, letterSpacing: "0.16em",
                  textTransform: "uppercase", padding: "2px 6px",
                }}>{palette.label}</span>
              </div>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--t-meta)", color: "var(--ink-3)", lineHeight: 1.35 }}>
                {demo.blurb}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--accent-gold)", letterSpacing: "0.04em" }}>
                {demo.evidence} signals →
              </span>
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}

// Today's findings — top 3 newest shell clusters + a stats banner.
// Fetches /trending on mount; gracefully no-ops if the endpoint is
// missing (older backend deploys), so the page never breaks.
function TodaysFindingsPanel() {
  const [feed, setFeed] = useState<TrendingFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.trending()
      .then((d) => { if (!cancelled) setFeed(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, []);

  if (error || !feed) return null;

  const clusters = feed.newest_shell_clusters.slice(0, 3);
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      style={{
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--s-5) var(--s-6)",
        display: "grid",
        gap: "var(--s-4)",
      }}
    >
      <header style={{ display: "grid", gap: "var(--s-2)" }}>
        <Eyebrow>Today's findings · Shell Atlas (M0)</Eyebrow>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "var(--s-5)",
          fontSize: "var(--t-meta)", color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
        }}>
          <span><strong style={{ color: "var(--ink)" }}>{feed.stats.total_shell_clusters.toLocaleString()}</strong> shell clusters</span>
          <span><strong style={{ color: "var(--ink)" }}>{feed.stats.total_flagged_cins.toLocaleString()}</strong> flagged CINs</span>
          <span><strong style={{ color: "var(--ink)" }}>{feed.stats.rows_in_tn_corpus.toLocaleString()}</strong> rows in TN corpus</span>
        </div>
      </header>
      {clusters.length === 0 ? (
        <p style={{
          fontFamily: "var(--font-display)", fontStyle: "italic",
          color: "var(--ink-3)", margin: 0, fontSize: "1rem",
        }}>
          Atlas is still building on the backend — the first /trending call
          warms the cache, subsequent loads will populate this panel.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {clusters.map((c) => (
            <TrendingClusterRow key={c.cluster_id} c={c} />
          ))}
        </div>
      )}
      <Link
        to="/shells"
        style={{
          fontFamily: "var(--font-body)", fontSize: "var(--t-eyebrow)",
          letterSpacing: "0.18em", textTransform: "uppercase",
          fontWeight: 700, color: "var(--accent-gold)",
          textDecoration: "none", borderBottom: "1px solid var(--accent-gold)",
          paddingBottom: 1, justifySelf: "start",
        }}
      >
        Browse the full Shell Atlas →
      </Link>
    </motion.section>
  );
}

function TrendingClusterRow({ c }: { c: TrendingCluster }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "var(--s-4)",
      alignItems: "center", padding: "var(--s-3) var(--s-4)",
      background: "var(--paper)", borderLeft: "3px solid var(--accent-gold)",
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontWeight: 700,
        fontSize: "1.05rem", color: "var(--ink)",
      }}>{c.size}</span>
      <div style={{ display: "grid", gap: 2 }}>
        <span style={{
          fontFamily: "var(--font-body)", fontWeight: 600, color: "var(--ink-2)",
          fontSize: "var(--t-meta)",
        }}>{c.signal_type.replace(/_/g, " ")}{c.state ? ` · ${c.state}` : ""}</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "var(--t-eyebrow)",
          color: "var(--ink-3)", letterSpacing: "0.02em",
        }}>{c.anchor_value.slice(0, 70)}{c.anchor_value.length > 70 ? "…" : ""}</span>
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "var(--t-meta)",
        color: "var(--ink-4)",
      }}>{c.cluster_id}</span>
    </div>
  );
}

function RecentlyAnalysedPanel({ cins, onPick }: { cins: string[]; onPick: (cin: string) => void }) {
  if (cins.length === 0) return null;
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      style={{
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--s-4) var(--s-6)",
        display: "grid", gap: "var(--s-3)",
      }}
    >
      <Eyebrow>Recently analysed by you</Eyebrow>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
        {cins.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: "0.78rem",
              padding: "6px 12px",
              background: "var(--paper)",
              border: "1px solid var(--rule-soft)",
              cursor: "pointer", letterSpacing: "0.02em",
              color: "var(--ink-2)", borderRadius: 0,
            }}
          >
            {c}
          </button>
        ))}
      </div>
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
      <Eyebrow>All Clear</Eyebrow>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.5rem",
          color: "var(--ink-2)",
        }}
      >
        No warning signs found for this company.
      </p>
      <p style={{ color: "var(--ink-3)", fontSize: "var(--t-meta)" }}>
        All checks passed — our full analysis found no suspicious patterns across financial statements, tax records, network connections, or legal proceedings.
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
      <Eyebrow>Running full analysis…</Eyebrow>
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
        Checking financial statements, tax records, company network, court
        proceedings, document authenticity, and more — this usually takes a
        few seconds.
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
        Analysis could not be completed.
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
  // CIN comes from the URL query string (set when the user submits the
  // /search form or clicks a row in /companies). No demo fallback —
  // arriving here without ?cin= renders the Quick-start panel + the
  // user's localStorage-backed recently-analysed history.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCin = (searchParams.get("cin") || "").toUpperCase();
  const [submitted, setSubmitted] = useState(initialCin);
  const [recentCins, setRecentCins] = useState<string[]>(() => readRecentCins());

  // Re-sync when the URL ?cin= changes (e.g. Search → Dashboard during the
  // same session without a full reload).
  useEffect(() => {
    const fromUrl = searchParams.get("cin");
    if (fromUrl) setSubmitted(fromUrl.toUpperCase());
  }, [searchParams]);

  const query = useQuery({
    queryKey: ["analyse", submitted],
    queryFn: () => api.analyse(submitted),
    enabled: Boolean(submitted),
  });

  // When analysis succeeds, pin the CIN to the recently-analysed history.
  useEffect(() => {
    if (query.isSuccess && submitted && submitted.length === 21) {
      pushRecentCin(submitted);
      setRecentCins(readRecentCins());
    }
  }, [query.isSuccess, submitted]);

  // Quick-start chip clicks: navigate via the demo's preferred route OR
  // submit a CIN inline. The latter keeps the user on /dashboard without
  // a full page transition.
  const handleQuickStart = (cin: string, route: string) => {
    // If the demo case routes to a CIN-based dashboard, drive via the URL
    // so back/forward works correctly. Otherwise navigate to its custom
    // page (e.g. /evergreening for DHFL, /itc for the carousel).
    if (route.startsWith("/dashboard")) {
      setSearchParams({ cin });
      setSubmitted(cin);
    } else {
      window.location.assign(route);
    }
  };
  const handleRecentPick = (cin: string) => {
    setSearchParams({ cin });
    setSubmitted(cin);
  };

  return (
    <article style={{ display: "grid", gap: "var(--s-5)" }}>
      <OnboardingHint />
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
          We run over a dozen independent checks — financial statements, tax
          records, director networks, court proceedings, and more — then show
          you exactly what we found and why it matters.
        </p>
        <GoldRule />
      </header>

      <QueryBar
        initial={submitted}
        onSubmit={(cin) => cin && setSubmitted(cin)}
      />

      {/* Empty state — Quick-start verified cases + Recently analysed.
          Shown when no CIN is active. Disappears the moment a query is
          in-flight or has resolved. */}
      {!submitted && !query.isLoading && (
        <>
          <QuickStartPanel onPick={handleQuickStart} />
          <TodaysFindingsPanel />
          <RecentlyAnalysedPanel cins={recentCins} onPick={handleRecentPick} />
        </>
      )}

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
            title="Risk Verdict"
          />
          <ScorePlate data={query.data} />
          {query.data.data_confidence < 45 && (
            <LowDataBanner
              cin={query.data.cin}
              dataConfidence={query.data.data_confidence}
            />
          )}
          <NarrativeCard cin={submitted} />
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
