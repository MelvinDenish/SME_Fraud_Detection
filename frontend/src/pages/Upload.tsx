import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEMO_CINS, UploadAck, UploadPreview, api } from "../lib/api";

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

// PRD §10 Day-21 — show analyst what each upload buys before they submit.
function DcBadge({ current, projected }: { current: number; projected: number }) {
  const delta = projected - current;
  const noBump = delta === 0;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: ".25rem .55rem",
      background: noBump ? "#f1f5f9" : "#dbeafe",
      borderLeft: `3px solid ${noBump ? "#94a3b8" : "#2563eb"}`,
      borderRadius: 4, fontSize: ".82rem",
      marginTop: ".4rem", marginBottom: ".25rem",
    }}>
      <strong>DataConfidence:</strong>
      <span>{current}%</span>
      <span style={{ color: "#64748b" }}>&rarr;</span>
      <span style={{ fontWeight: 600 }}>{projected}%</span>
      <span style={{ color: noBump ? "#64748b" : "#1d4ed8" }}>
        {noBump ? "no change" : `+${delta} pts`}
      </span>
    </div>
  );
}

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

function FinancialsForm({ cin, preview, onUploaded }: {
  cin: string; preview: UploadPreview | undefined; onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.uploadFinancials(cin, file!),
    onSuccess: onUploaded,
  });
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>AOC-4 PDF</h3>
      <p style={{ color: "#475569", marginTop: 0 }}>
        pdfplumber pulls the FS row + forensics into the per-CIN overlay
        (Day-7 hardened parser + Day-11 paren-negative / crore-unit support).
      </p>
      {preview && (
        <DcBadge current={preview.current_data_confidence}
                 projected={preview.if_financials_added} />
      )}
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

function GstForm({ cin, preview, onUploaded }: {
  cin: string; preview: UploadPreview | undefined; onUploaded: () => void;
}) {
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
    onSuccess: onUploaded,
  });
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>GST entity overlay</h3>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Triggers Module 2 #1 (Revenue vs GST Turnover) when the upload
        diverges &gt; 5% from the company's P&amp;L revenue.
      </p>
      {preview && (
        <DcBadge current={preview.current_data_confidence}
                 projected={preview.if_gst_added} />
      )}
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

function BankForm({ cin, preview, onUploaded }: {
  cin: string; preview: UploadPreview | undefined; onUploaded: () => void;
}) {
  const [credits, setCredits] = useState("250000000");
  const mutation = useMutation({
    mutationFn: () => api.uploadBank(cin, Number(credits)),
    onSuccess: onUploaded,
  });
  // PRD §7.1 ladder note: bank only bumps DC once GST is on file. Show the
  // analyst the dependency explicitly so they don't think the endpoint is broken.
  const bankNeedsGst =
    preview !== undefined &&
    preview.if_bank_added === preview.current_data_confidence &&
    !preview.state.has_gst_upload;
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Bank credits total</h3>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Triggers Module 2 #7 (Bank Credits vs Revenue) when the reconstructed
        bank credits diverge &gt; 20% from the company's P&amp;L revenue.
      </p>
      {preview && (
        <DcBadge current={preview.current_data_confidence}
                 projected={preview.if_bank_added} />
      )}
      {bankNeedsGst && (
        <p style={{ color: "#92400e", margin: ".25rem 0 .5rem", fontSize: ".8rem" }}>
          Note: PRD §7.1 ladder requires a GST overlay before bank evidence
          counts toward DC. Submit the bank total anyway — it still feeds
          Module 2 check #7 — but DC won't change until GST is on file.
        </p>
      )}
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

function PreviewCard({ preview }: { preview: UploadPreview | undefined }) {
  if (!preview) return null;
  const { state, current_data_confidence } = preview;
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0, marginBottom: ".5rem" }}>
        Current DataConfidence: <span style={{ color: "#1d4ed8" }}>{current_data_confidence}%</span>
      </h3>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".5rem",
        fontSize: ".85rem", color: "#475569",
      }}>
        <span>Financials on file: <strong style={{ color: "#0f172a" }}>{state.n_financials}</strong></span>
        <span>GST overlay: <strong style={{ color: state.has_gst_upload ? "#15803d" : "#94a3b8" }}>
          {state.has_gst_upload ? "yes" : "—"}
        </strong></span>
        <span>Bank overlay: <strong style={{ color: state.has_bank_upload ? "#15803d" : "#94a3b8" }}>
          {state.has_bank_upload ? "yes" : "—"}
        </strong></span>
      </div>
    </div>
  );
}

export default function UploadPage() {
  const [cin, setCin] = useState(DEMO_CINS.xyzGarments);
  const qc = useQueryClient();
  const previewQuery = useQuery({
    queryKey: ["upload-preview", cin],
    queryFn: () => api.uploadPreview(cin),
    enabled: cin.length > 0,
  });
  const refetchPreview = () => {
    qc.invalidateQueries({ queryKey: ["upload-preview", cin] });
  };
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Upload evidence</h1>
        <p style={{ color: "#475569", margin: ".25rem 0 0" }}>
          Three /upload/* endpoints stash overlays for the next /analyse
          request. The badge on each form shows the DataConfidence bump
          this upload would buy (PRD §7.1 ladder, Day-21 preview).
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
      {previewQuery.error && (
        <div style={{ ...cardStyle, color: "crimson" }}>
          Preview failed: {(previewQuery.error as Error).message}
        </div>
      )}
      <PreviewCard preview={previewQuery.data} />
      <FinancialsForm cin={cin} preview={previewQuery.data} onUploaded={refetchPreview} />
      <GstForm cin={cin} preview={previewQuery.data} onUploaded={refetchPreview} />
      <BankForm cin={cin} preview={previewQuery.data} onUploaded={refetchPreview} />
    </div>
  );
}
