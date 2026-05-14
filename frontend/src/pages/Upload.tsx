import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DEMO_CINS, UploadAck, api } from "../lib/api";

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

function AckBanner({ ack }: { ack: UploadAck | undefined }) {
  if (!ack) return null;
  return (
    <div style={{
      marginTop: ".75rem",
      padding: ".5rem .75rem",
      background: ack.accepted ? "#dcfce7" : "#fee2e2",
      borderLeft: `4px solid ${ack.accepted ? "#15803d" : "#b91c1c"}`,
      borderRadius: 4,
    }}>
      <strong>{ack.accepted ? "Accepted" : "Rejected"}</strong> · {ack.detail}
      {Object.keys(ack.extra).length > 0 && (
        <pre style={{ margin: ".5rem 0 0", fontSize: ".8rem" }}>
          {JSON.stringify(ack.extra, null, 2)}
        </pre>
      )}
    </div>
  );
}

function FinancialsForm({ cin }: { cin: string }) {
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.uploadFinancials(cin, file!),
  });
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>AOC-4 PDF</h3>
      <p style={{ color: "#475569", marginTop: 0 }}>
        pdfplumber pulls the FS row + forensics into the per-CIN overlay
        (Day-7 hardened parser + Day-11 paren-negative / crore-unit support).
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); if (file) mutation.mutate(); }}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={!file || mutation.isPending} style={btnStyle}>
          {mutation.isPending ? "Uploading…" : "Upload"}
        </button>
      </form>
      {mutation.error && (
        <p style={{ color: "crimson", marginTop: ".5rem" }}>{(mutation.error as Error).message}</p>
      )}
      <AckBanner ack={mutation.data} />
    </div>
  );
}

function GstForm({ cin }: { cin: string }) {
  const [gstin, setGstin] = useState("27AAACX1234A1Z5");
  const [pan, setPan] = useState("AAACX1234A");
  const [turnover, setTurnover] = useState("100000");
  const mutation = useMutation({
    mutationFn: () => api.uploadGst(cin, {
      gstin, pan,
      cin,
      registration_date: "2019-04-01",
      is_cancelled: false,
      taxpayer_type: "regular",
      aggregate_turnover: Number(turnover),
      tax_paid_ytd: 0,
    }),
  });
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>GST entity overlay</h3>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Triggers Module 2 #1 (Revenue vs GST Turnover) when the upload
        diverges &gt; 5% from the company's P&amp;L revenue.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: 8, alignItems: "center" }}
      >
        <label>GSTIN</label>
        <input value={gstin} onChange={(e) => setGstin(e.target.value)} style={{ padding: "0.4rem" }} />
        <label>PAN</label>
        <input value={pan} onChange={(e) => setPan(e.target.value)} style={{ padding: "0.4rem" }} />
        <label>Aggregate turnover (₹)</label>
        <input value={turnover} onChange={(e) => setTurnover(e.target.value)} style={{ padding: "0.4rem" }} />
        <span />
        <button type="submit" disabled={mutation.isPending} style={btnStyle}>
          {mutation.isPending ? "Submitting…" : "Submit GST overlay"}
        </button>
      </form>
      {mutation.error && (
        <p style={{ color: "crimson", marginTop: ".5rem" }}>{(mutation.error as Error).message}</p>
      )}
      <AckBanner ack={mutation.data} />
    </div>
  );
}

function BankForm({ cin }: { cin: string }) {
  const [credits, setCredits] = useState("250000000");
  const mutation = useMutation({
    mutationFn: () => api.uploadBank(cin, Number(credits)),
  });
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Bank credits total</h3>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Triggers Module 2 #7 (Bank Credits vs Revenue) when the reconstructed
        bank credits diverge &gt; 20% from the company's P&amp;L revenue.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input value={credits} onChange={(e) => setCredits(e.target.value)} style={{ padding: "0.4rem", flex: 1 }} />
        <button type="submit" disabled={mutation.isPending} style={btnStyle}>
          {mutation.isPending ? "Submitting…" : "Submit bank total"}
        </button>
      </form>
      {mutation.error && (
        <p style={{ color: "crimson", marginTop: ".5rem" }}>{(mutation.error as Error).message}</p>
      )}
      <AckBanner ack={mutation.data} />
    </div>
  );
}

export default function UploadPage() {
  const [cin, setCin] = useState(DEMO_CINS.xyzGarments);
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Upload evidence</h1>
        <p style={{ color: "#475569", margin: ".25rem 0 0" }}>
          Three /upload/* endpoints stash overlays for the next /analyse
          request. Useful when an MCA filing is incomplete and the analyst
          wants to add bank/GST evidence by hand.
        </p>
      </header>
      <div style={cardStyle}>
        <label htmlFor="upload-cin" style={{ fontWeight: 600 }}>Target CIN</label>
        <input
          id="upload-cin"
          value={cin}
          onChange={(e) => setCin(e.target.value.trim().toUpperCase())}
          style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 4, marginTop: 4 }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {Object.entries(DEMO_CINS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCin(v)}
              style={{ padding: "0.35rem 0.6rem", fontSize: ".75rem", background: "#e2e8f0", border: 0, borderRadius: 4, cursor: "pointer" }}
            >{k}</button>
          ))}
        </div>
      </div>
      <FinancialsForm cin={cin} />
      <GstForm cin={cin} />
      <BankForm cin={cin} />
    </div>
  );
}
