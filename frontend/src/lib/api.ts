// Typed client for the Sentinel-G backend (PRD §7.1 payload + Day-16 routes).
// All calls route through Vite's /api proxy onto FastAPI.

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface FraudSignal {
  signal_id: string;
  signal_type: string;
  severity: Severity;
  score_contribution: number;
  evidence_string: string;
  module_name: string;
  triggered_by: Array<Record<string, unknown>>;
}

// PRD §7.1 dual-output payload, plus Day-16 propagation fields.
export interface AnalyseResponse {
  cin: string;
  fraud_risk_score: number;
  risk_band: RiskBand;
  p_fraud_calibrated: number | null;
  p_fraud_interval: [number, number] | null;
  data_confidence: number;
  ensemble_disagreement_flag: boolean;
  evidence_chain: FraudSignal[];
  module_breakdown: Record<string, number>;
  override_applied: boolean;
  skipped_modules: Array<{ module: string; reason: string }>;
  propagation_band: RiskBand;
  propagation_score: number;
}

export interface ProvenanceResponse {
  cin: string;
  signal_count: number;
  signals: Array<{
    signal_id: string;
    signal_type: string;
    severity: Severity;
    module_name: string;
    score_contribution: number;
    evidence_string: string;
  }>;
  triggered_by: Array<{
    signal_id: string;
    label: string | null;
    ref: Record<string, unknown>;
  }>;
}

export interface UploadAck {
  cin: string;
  accepted: boolean;
  detail: string;
  extra: Record<string, unknown>;
}

const API_BASE = "/api";
const TOKEN_KEY = "sentinelg.jwt";

function bearerHeader(): HeadersInit {
  try {
    const tok = localStorage.getItem(TOKEN_KEY);
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch {
    return {};
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: bearerHeader() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearerHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function postFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST", body: form, headers: bearerHeader(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Download a PDF report. Triggers a save-as in the user's browser. */
export async function downloadReport(cin: string): Promise<{ reportId: string | null; generatedAt: string | null }> {
  const res = await fetch(`${API_BASE}/report/${cin}`, { headers: bearerHeader() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /report/${cin} -> ${res.status}: ${text || res.statusText}`);
  }
  const blob = await res.blob();
  const reportId = res.headers.get("x-report-id");
  const generatedAt = res.headers.get("x-report-generated-at");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sentinel-g-${cin}-${reportId?.slice(0, 8) ?? "report"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { reportId, generatedAt };
}

export const api = {
  health: () => getJson<{ status: string; version: string; env: string }>("/health"),
  analyse: (cin: string) => getJson<AnalyseResponse>(`/analyse/${cin}`),
  provenance: (cin: string) => getJson<ProvenanceResponse>(`/analyse/${cin}/provenance`),
  uploadFinancials: (cin: string, file: File) =>
    postFile<UploadAck>(`/upload/financials/${cin}`, file),
  uploadGst: (cin: string, payload: Record<string, unknown>) =>
    postJson<UploadAck>(`/upload/gst/${cin}`, payload),
  uploadBank: (cin: string, creditsTotal: number) =>
    postJson<UploadAck>(`/upload/bank/${cin}`, { credits_total: creditsTotal }),
};

// PRD §7.2 band colour palette — kept here so every page renders the same hue.
export const BAND_PALETTE: Record<RiskBand, { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: "#7f1d1d", fg: "white", label: "CRITICAL" },
  HIGH:     { bg: "#b45309", fg: "white", label: "HIGH" },
  MEDIUM:   { bg: "#a16207", fg: "white", label: "MEDIUM" },
  LOW:      { bg: "#15803d", fg: "white", label: "LOW" },
};

export const SEVERITY_PALETTE: Record<Severity, string> = {
  CRITICAL: "#7f1d1d",
  HIGH: "#b45309",
  MEDIUM: "#a16207",
  LOW: "#15803d",
};

// Demo CIN list — referenced by Dashboard, ITC, Evergreening pages.
export const DEMO_CINS = {
  ilfs: "U45201MH2005PTC155294",
  amtek: "U27101MH2010PTC215432",
  dhfl: "L65910MH1984PLC032662",
  hijAuto: "U29304MH2019PTC287654",
  xyzGarments: "U14101MH2019PTC298765",
};
