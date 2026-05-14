import { useState } from "react";
import { DEMO_CINS, downloadReport } from "../lib/api";

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 8,
  padding: "1.25rem 1.5rem",
  boxShadow: "0 1px 2px rgba(15,23,42,.07)",
};

const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1rem", border: 0, background: "#0f172a", color: "white",
  borderRadius: 4, cursor: "pointer",
};

interface ReportLog {
  cin: string;
  reportId: string | null;
  generatedAt: string | null;
}

export default function Reports() {
  const [cin, setCin] = useState(DEMO_CINS.ilfs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<ReportLog[]>([]);

  const trigger = async (target: string) => {
    setBusy(true);
    setError(null);
    try {
      const meta = await downloadReport(target);
      setLog((prev) => [{ cin: target, ...meta }, ...prev].slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Reports</h1>
        <p style={{ color: "#475569", margin: ".25rem 0 0" }}>
          Render the PRD §7.1 dual-output as a single-page PDF — UUID +
          UTC timestamp + disclaimer baked in. Auth-required: the backend
          rejects anonymous calls with 401.
        </p>
      </header>

      <div style={cardStyle}>
        <form
          onSubmit={(e) => { e.preventDefault(); trigger(cin.trim().toUpperCase()); }}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <label htmlFor="report-cin" style={{ fontWeight: 600 }}>CIN</label>
          <input
            id="report-cin"
            value={cin}
            onChange={(e) => setCin(e.target.value)}
            style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
          <button type="submit" disabled={busy} style={btnStyle}>
            {busy ? "Rendering…" : "Download PDF"}
          </button>
        </form>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {Object.entries(DEMO_CINS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setCin(v); trigger(v); }}
              disabled={busy}
              style={{ padding: "0.4rem 0.6rem", fontSize: ".75rem", background: "#e2e8f0", border: 0, borderRadius: 4, cursor: "pointer" }}
            >{k}</button>
          ))}
        </div>
        {error && (
          <p style={{ color: "crimson", marginTop: ".75rem" }}>{error}</p>
        )}
      </div>

      {log.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Recently exported</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: ".5rem 0" }}>CIN</th>
                <th>Report ID</th>
                <th>Generated (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row, i) => (
                <tr key={`${row.reportId}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: ".4rem 0" }}><code>{row.cin}</code></td>
                  <td><code style={{ fontSize: ".8rem" }}>{row.reportId ?? "—"}</code></td>
                  <td>{row.generatedAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
