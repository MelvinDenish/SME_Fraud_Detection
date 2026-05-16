import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";
import { DEMO_CINS, SEVERITY_PALETTE, api } from "../lib/api";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  kind: "company" | "signal" | "ref";
  fill: string;
  // Extra metadata surfaced in the inspector panel.
  meta: Record<string, string>;
  // For signal nodes — copied straight from the provenance payload.
  signalType?: string;
  module?: string;
  severity?: string;
  scoreContribution?: number;
  evidenceString?: string;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
}

const WIDTH = 940;
const HEIGHT = 600;

// SVG presentation attributes (`fill`, `stroke`, etc.) don't resolve
// `var(--token)` — only CSS `style` properties do. Mirror the relevant
// tokens here for attribute consumers; keep in sync with tokens.css.
const HEX = {
  paper: "#f3ead2",
  paperDeep: "#ddd0ab",
  ink: "#0e0d0a",
  ink3: "#585045",
  rule: "#1a1a1a",
  ruleSoft: "#c6b890",
  accentGold: "#a07127",
  refBlue: "#1e3a8a",
} as const;

function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className="eyebrow" style={style}>
      {children}
    </span>
  );
}

export default function GraphExplorer() {
  const { cin: cinParam } = useParams<{ cin?: string }>();
  const [cin, setCin] = useState(cinParam ?? DEMO_CINS.ilfs);
  useEffect(() => {
    if (cinParam) setCin(cinParam);
  }, [cinParam]);

  const query = useQuery({
    queryKey: ["provenance", cin],
    queryFn: () => api.provenance(cin),
    enabled: Boolean(cin),
  });

  const { nodes, links } = useMemo(() => {
    if (!query.data) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    const cinNodeId = `cin:${query.data.cin}`;
    const ns: GraphNode[] = [
      {
        id: cinNodeId,
        label: query.data.cin,
        kind: "company",
        fill: HEX.ink,
        meta: {
          CIN: query.data.cin,
          Signals: String(query.data.signal_count),
          References: String(query.data.triggered_by.length),
        },
      },
    ];
    const ls: GraphLink[] = [];

    for (const s of query.data.signals) {
      ns.push({
        id: `sig:${s.signal_id}`,
        label: s.signal_type,
        kind: "signal",
        fill: SEVERITY_PALETTE[s.severity],
        meta: {
          Severity: s.severity,
          Module: s.module_name,
          Type: s.signal_type,
          Contribution: `+${s.score_contribution.toFixed(1)}`,
        },
        signalType: s.signal_type,
        module: s.module_name,
        severity: s.severity,
        scoreContribution: s.score_contribution,
        evidenceString: s.evidence_string,
      });
      ls.push({
        source: cinNodeId,
        target: `sig:${s.signal_id}`,
        label: "HAS_FRAUD_SIGNAL",
      });
    }
    for (const edge of query.data.triggered_by) {
      const refId = `ref:${edge.label ?? "node"}:${JSON.stringify(edge.ref)}`;
      if (!ns.find((n) => n.id === refId)) {
        const refMeta: Record<string, string> = {};
        for (const [k, v] of Object.entries(edge.ref)) {
          refMeta[k] = String(v);
        }
        ns.push({
          id: refId,
          label: `${edge.label ?? "ref"} · ${Object.values(edge.ref).join(" / ")}`,
          kind: "ref",
          fill: HEX.refBlue,
          meta: { Label: edge.label ?? "(unlabelled)", ...refMeta },
        });
      }
      ls.push({
        source: `sig:${edge.signal_id}`,
        target: refId,
        label: "TRIGGERED_BY",
      });
    }
    return { nodes: ns, links: ls };
  }, [query.data]);

  // Simulation + tick-driven render. We keep a ref for the latest node array
  // so the SVG redraw doesn't allocate new objects per tick (smoother on
  // projected screens that prefer steady frame timings).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (nodes.length === 0) return;
    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const t = d.target as unknown;
            return typeof t === "object" && t !== null && (t as GraphNode).kind === "ref"
              ? 80
              : 130;
          })
          .strength(0.85),
      )
      .force("charge", forceManyBody().strength(-340))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force(
        "collide",
        forceCollide<GraphNode>((d) => (d.kind === "company" ? 38 : 22)),
      );
    sim.on("tick", () => setTick((t) => t + 1));
    return () => {
      sim.stop();
    };
  }, [nodes, links]);

  // Zoom-to-fit — derived from the live node positions. We recompute every
  // render rather than memoising on `nodes.length`: x/y are populated by
  // the simulation post-mount and only known after the first tick. The
  // tick-driven re-render rate is bounded by d3's alphaDecay, so the camera
  // settles naturally without jitter at the ~20-node demo scale.
  const xs = nodes.map((n) => n.x).filter((v): v is number => typeof v === "number");
  const ys = nodes.map((n) => n.y).filter((v): v is number => typeof v === "number");
  const viewBox = (() => {
    if (xs.length === 0 || ys.length === 0) return `0 0 ${WIDTH} ${HEIGHT}`;
    const minX = Math.min(...xs) - 60;
    const minY = Math.min(...ys) - 50;
    const maxX = Math.max(...xs) + 60;
    const maxY = Math.max(...ys) + 50;
    const w = Math.max(WIDTH, maxX - minX);
    const h = Math.max(HEIGHT, maxY - minY);
    return `${minX} ${minY} ${w} ${h}`;
  })();
  const vbParts = viewBox.split(" ");

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inspected = useMemo(
    () => nodes.find((n) => n.id === (selectedId ?? hoveredId)) ?? null,
    [nodes, selectedId, hoveredId],
  );

  return (
    <article style={{ display: "grid", gap: "var(--s-5)" }}>
      <header style={{ display: "grid", gap: "var(--s-3)" }}>
        <Eyebrow>Sentinel-G · Provenance Atlas</Eyebrow>
        <h1>The Evidence Graph.</h1>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: "1.15rem",
            color: "var(--ink-3)",
            maxWidth: "62ch",
          }}
        >
          Every FraudSignal traces back through one or more <code>TRIGGERED_BY</code>{" "}
          edges to a specific RelatedPartyTransaction, FinancialStatement, Charge,
          or GSTEntity. Numbers in evidence strings always cite the original
          source row.
        </p>
        <div className="rule-gold" aria-hidden />
      </header>

      <form
        onSubmit={(e) => e.preventDefault()}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "var(--s-3) var(--s-4)",
          padding: "var(--s-5) var(--s-6)",
          background: "var(--paper-elevated)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          <label htmlFor="graph-cin">
            <Eyebrow>Subject CIN</Eyebrow>
          </label>
          <input
            id="graph-cin"
            value={cin}
            onChange={(e) => setCin(e.target.value.trim().toUpperCase())}
            spellCheck={false}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "1.1rem",
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
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--s-2)",
            alignItems: "center",
          }}
        >
          <Eyebrow>Quick subjects</Eyebrow>
          {Object.entries(DEMO_CINS).map(([k, v]) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                setCin(v);
                setSelectedId(null);
              }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                padding: "4px 10px",
                background: cin === v ? "var(--ink)" : "transparent",
                color: cin === v ? "var(--paper)" : "var(--ink-2)",
                border: "1px solid var(--rule-soft)",
                cursor: "pointer",
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </form>

      {query.isLoading && <LoadingCanvas />}
      {query.isError && (
        <p style={{ color: "var(--risk-critical)" }}>
          {(query.error as Error).message}
        </p>
      )}

      {query.data && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: "var(--s-5)",
          }}
        >
          {/* Canvas */}
          <div
            style={{
              background: "var(--paper-elevated)",
              boxShadow: "var(--shadow-card)",
              padding: "var(--s-3)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "var(--s-3) var(--s-4) 0",
              }}
            >
              <Eyebrow>
                {query.data.signal_count} signals ·{" "}
                {query.data.triggered_by.length} TRIGGERED_BY edges
              </Eyebrow>
              <Eyebrow style={{ color: "var(--ink-4)" }}>
                Hover · Click to pin
              </Eyebrow>
            </div>

            <svg
              viewBox={viewBox}
              preserveAspectRatio="xMidYMid meet"
              style={{
                display: "block",
                width: "100%",
                height: HEIGHT,
                background:
                  "radial-gradient(circle at 30% 30%, var(--paper-deep) 0%, var(--paper-elevated) 60%, var(--paper) 100%)",
              }}
              onClick={() => setSelectedId(null)}
            >
              <defs>
                {/* Subtle ink-on-paper drop-shadow. */}
                <filter id="ink-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow
                    dx="0"
                    dy="2"
                    stdDeviation="2.5"
                    floodColor="#0e0d0a"
                    floodOpacity="0.22"
                  />
                </filter>
                {/* Hairline arrowhead for directed edges. */}
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={HEX.ink3} />
                </marker>
                <radialGradient id="company-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#0e0d0a" />
                  <stop offset="100%" stopColor="#3b332a" />
                </radialGradient>
                <pattern
                  id="paper-grain"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="transparent" />
                  <circle cx="1" cy="1" r="0.3" fill="#0e0d0a" opacity="0.06" />
                  <circle cx="4" cy="3" r="0.25" fill="#0e0d0a" opacity="0.06" />
                </pattern>
                {/* Paper grain overlay rect (positioned outside <defs> below). */}
              </defs>

              {/* Subtle grain over the canvas. */}
              <rect
                x={vbParts[0]}
                y={vbParts[1]}
                width={vbParts[2]}
                height={vbParts[3]}
                fill="url(#paper-grain)"
                pointerEvents="none"
              />

              {/* Edges */}
              <g>
                {links.map((lnk, i) => {
                  const s =
                    nodes.find((n) => n.id === lnk.source) ??
                    (typeof lnk.source !== "string"
                      ? (lnk.source as unknown as GraphNode)
                      : undefined);
                  const t =
                    nodes.find((n) => n.id === lnk.target) ??
                    (typeof lnk.target !== "string"
                      ? (lnk.target as unknown as GraphNode)
                      : undefined);
                  if (!s || !t || s.x === undefined || t.x === undefined)
                    return null;
                  const involvesHover =
                    hoveredId !== null &&
                    (hoveredId === s.id || hoveredId === t.id);
                  return (
                    <g key={i}>
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        stroke={involvesHover ? HEX.accentGold : HEX.ink3}
                        strokeWidth={involvesHover ? 1.6 : 0.9}
                        strokeOpacity={involvesHover ? 1 : 0.55}
                        markerEnd="url(#arrow)"
                      />
                    </g>
                  );
                })}
              </g>

              {/* Nodes */}
              <g>
                {nodes.map((n) => {
                  if (n.x === undefined) return null;
                  const isHover = hoveredId === n.id;
                  const isSelected = selectedId === n.id;
                  const baseR =
                    n.kind === "company" ? 26 : n.kind === "signal" ? 14 : 11;
                  const r = isHover || isSelected ? baseR + 4 : baseR;
                  const fillRef =
                    n.kind === "company" ? "url(#company-glow)" : n.fill;
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      onMouseEnter={() => setHoveredId(n.id)}
                      onMouseLeave={() =>
                        setHoveredId((cur) => (cur === n.id ? null : cur))
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(n.id);
                      }}
                      style={{ cursor: "pointer" }}
                      filter={isHover || isSelected ? "url(#ink-shadow)" : undefined}
                    >
                      <circle
                        r={r}
                        fill={fillRef}
                        stroke={isSelected ? HEX.accentGold : HEX.paper}
                        strokeWidth={isSelected ? 2.5 : 1.6}
                        style={{
                          transition:
                            "r var(--d-quick) var(--ease-out), stroke var(--d-quick)",
                        }}
                      />
                      {/* Company glyph — a small bullseye to read at distance. */}
                      {n.kind === "company" && (
                        <circle r={5} fill={HEX.paper} pointerEvents="none" />
                      )}
                      <title>{n.label}</title>
                      {/* Always show full label on hover or for the company node;
                          otherwise just a compact monogram. */}
                      {(isHover || isSelected || n.kind === "company") && (
                        <g pointerEvents="none">
                          <rect
                            x={r + 6}
                            y={-10}
                            width={Math.max(40, n.label.length * 6.5)}
                            height={20}
                            fill={HEX.paper}
                            stroke={HEX.rule}
                            strokeWidth={0.6}
                            rx={0}
                          />
                          <text
                            x={r + 12}
                            y={4}
                            fontFamily='"JetBrains Mono", ui-monospace, monospace'
                            fontSize={11}
                            fill={HEX.ink}
                          >
                            {n.label.slice(0, 38)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Inspector rail */}
          <aside
            style={{
              display: "grid",
              gap: "var(--s-4)",
              alignContent: "start",
            }}
          >
            <Legend />
            <Inspector node={inspected} />
          </aside>
        </section>
      )}
    </article>
  );
}

function Legend() {
  const items = [
    {
      label: "Company",
      sub: "the subject under review",
      swatch: <span style={dotStyle("var(--ink)", 14)} />,
    },
    {
      label: "Fraud signal",
      sub: "severity-coloured · M1–M11",
      swatch: (
        <span style={{ display: "inline-flex", gap: 3 }}>
          <span style={dotStyle("var(--risk-low)", 9)} />
          <span style={dotStyle("var(--risk-medium)", 9)} />
          <span style={dotStyle("var(--risk-high)", 9)} />
          <span style={dotStyle("var(--risk-critical)", 9)} />
        </span>
      ),
    },
    {
      label: "Reference row",
      sub: "TRIGGERED_BY target",
      swatch: <span style={dotStyle("#1e3a8a", 9)} />,
    },
  ];
  return (
    <section
      style={{
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--s-4) var(--s-5)",
        display: "grid",
        gap: "var(--s-3)",
      }}
    >
      <Eyebrow>Legend</Eyebrow>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--s-3)" }}>
        {items.map((it) => (
          <li
            key={it.label}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "var(--s-3)",
              alignItems: "center",
            }}
          >
            <span aria-hidden style={{ display: "inline-flex" }}>
              {it.swatch}
            </span>
            <span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.05rem",
                  color: "var(--ink)",
                }}
              >
                {it.label}
              </span>
              <br />
              <span style={{ fontSize: "0.78rem", color: "var(--ink-3)" }}>
                {it.sub}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function dotStyle(color: string, size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    background: color,
    borderRadius: 999,
    display: "inline-block",
  };
}

function Inspector({ node }: { node: GraphNode | null }) {
  return (
    <section
      style={{
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--s-5)",
        minHeight: 200,
        display: "grid",
        gap: "var(--s-3)",
        alignContent: "start",
      }}
    >
      <Eyebrow>Inspector</Eyebrow>
      <AnimatePresence mode="wait">
        {node === null ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: "1rem",
            }}
          >
            Hover any node to surface its provenance metadata. Click to pin
            the inspection while you scan the rest of the graph.
          </motion.p>
        ) : (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: "grid", gap: "var(--s-3)" }}
          >
            <h3
              style={{
                fontSize: "1.4rem",
                color: "var(--ink)",
                wordBreak: "break-word",
              }}
            >
              {node.label}
            </h3>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                rowGap: 6,
                columnGap: "var(--s-3)",
                margin: 0,
                fontSize: "0.85rem",
              }}
            >
              {Object.entries(node.meta).map(([k, v]) => (
                <FragmentRow key={k} label={k} value={v} />
              ))}
            </dl>
            {node.evidenceString && (
              <>
                <div className="rule-gold" aria-hidden />
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    color: "var(--ink)",
                    lineHeight: 1.5,
                  }}
                >
                  {node.evidenceString}
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.68rem",
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
          fontFamily: "var(--font-mono)",
          color: "var(--ink-2)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </dd>
    </>
  );
}

function LoadingCanvas() {
  return (
    <div
      style={{
        background: "var(--paper-elevated)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--s-6) var(--s-6)",
        display: "grid",
        gap: "var(--s-4)",
        minHeight: 380,
      }}
    >
      <Eyebrow>Resolving provenance</Eyebrow>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          color: "var(--ink-3)",
          fontSize: "1.1rem",
        }}
      >
        Walking <code>Company → FraudSignal → TRIGGERED_BY</code> via Cypher.
      </p>
    </div>
  );
}
