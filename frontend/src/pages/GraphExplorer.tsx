import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { forceCenter, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { DEMO_CINS, SEVERITY_PALETTE, api } from "../lib/api";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  kind: "company" | "signal" | "ref";
  fill: string;
  text: string;
}
interface GraphLink {
  source: string;
  target: string;
}

const WIDTH = 880;
const HEIGHT = 540;

export default function GraphExplorer() {
  const { cin: cinParam } = useParams<{ cin?: string }>();
  const [cin, setCin] = useState(cinParam ?? DEMO_CINS.ilfs);
  useEffect(() => { if (cinParam) setCin(cinParam); }, [cinParam]);

  const query = useQuery({
    queryKey: ["provenance", cin],
    queryFn: () => api.provenance(cin),
    enabled: Boolean(cin),
  });

  const { nodes, links } = useMemo(() => {
    if (!query.data) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    const cinNodeId = `cin:${query.data.cin}`;
    const ns: GraphNode[] = [{
      id: cinNodeId,
      label: query.data.cin,
      kind: "company",
      fill: "#0f172a",
      text: "white",
    }];
    const ls: GraphLink[] = [];

    for (const s of query.data.signals) {
      ns.push({
        id: `sig:${s.signal_id}`,
        label: s.signal_type,
        kind: "signal",
        fill: SEVERITY_PALETTE[s.severity],
        text: "white",
      });
      ls.push({ source: cinNodeId, target: `sig:${s.signal_id}` });
    }
    for (const edge of query.data.triggered_by) {
      const refId = `ref:${edge.label ?? "node"}:${JSON.stringify(edge.ref)}`;
      if (!ns.find((n) => n.id === refId)) {
        ns.push({
          id: refId,
          label: `${edge.label ?? "ref"}\n${Object.values(edge.ref).join(" / ")}`,
          kind: "ref",
          fill: "#1e3a8a",
          text: "white",
        });
      }
      ls.push({ source: `sig:${edge.signal_id}`, target: refId });
    }
    return { nodes: ns, links: ls };
  }, [query.data]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  // Tick the simulation each time data changes; render via React state so
  // we don't need to imperatively mutate DOM during refresh.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (nodes.length === 0) return;
    const sim = forceSimulation(nodes)
      .force("link", forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(110).strength(0.8))
      .force("charge", forceManyBody().strength(-280))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2));
    sim.on("tick", () => setTick((t) => t + 1));
    return () => { sim.stop(); };
  }, [nodes, links]);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Graph Explorer</h1>
        <p style={{ color: "#475569", margin: ".25rem 0 0" }}>
          d3-force layout over the /analyse/{"{cin}"}/provenance payload —
          Company → FraudSignal → TRIGGERED_BY targets.
        </p>
      </header>
      <form
        onSubmit={(e) => { e.preventDefault(); }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={cin}
          onChange={(e) => setCin(e.target.value.trim().toUpperCase())}
          style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 4 }}
        />
        {Object.entries(DEMO_CINS).map(([k, v]) => (
          <button
            type="button"
            key={k}
            onClick={() => setCin(v)}
            style={{ padding: "0.4rem 0.6rem", fontSize: ".75rem", background: "#e2e8f0", border: 0, borderRadius: 4, cursor: "pointer" }}
          >{k}</button>
        ))}
      </form>

      {query.isLoading && <p>Loading provenance…</p>}
      {query.error && <p style={{ color: "crimson" }}>{(query.error as Error).message}</p>}
      {query.data && (
        <div style={{ background: "white", borderRadius: 8, padding: 8 }}>
          <p style={{ color: "#64748b", margin: "0 0 0.5rem" }}>
            {query.data.signal_count} signals · {query.data.triggered_by.length} TRIGGERED_BY edges
          </p>
          <svg ref={svgRef} width={WIDTH} height={HEIGHT} style={{ background: "#f8fafc", borderRadius: 6 }} data-tick={tick}>
            {links.map((lnk, i) => {
              const s = nodes.find((n) => n.id === lnk.source) || (typeof lnk.source !== "string" ? (lnk.source as unknown as GraphNode) : undefined);
              const t = nodes.find((n) => n.id === lnk.target) || (typeof lnk.target !== "string" ? (lnk.target as unknown as GraphNode) : undefined);
              if (!s || !t || s.x === undefined || t.x === undefined) return null;
              return (
                <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#94a3b8" strokeWidth={1} />
              );
            })}
            {nodes.map((n) => {
              if (n.x === undefined) return null;
              const r = n.kind === "company" ? 22 : n.kind === "signal" ? 12 : 10;
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                  <circle r={r} fill={n.fill} stroke="white" strokeWidth={1.5} />
                  <title>{n.label}</title>
                  <text textAnchor="middle" y={r + 12} fontSize={10} fill="#0f172a">
                    {n.label.split("\n")[0].slice(0, 26)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
