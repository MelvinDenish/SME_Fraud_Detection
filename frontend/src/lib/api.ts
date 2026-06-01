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

export interface NarrativeResponse {
  cin: string;
  summary: string;
  model: string;
  generated_at: string;
  cached: boolean;
  evidence_hash: string;
  allowed_numbers?: string[];
}

export interface UploadAck {
  cin: string;
  accepted: boolean;
  detail: string;
  extra: Record<string, unknown>;
}

// PRD §10 + Phase-C data.gov.in bulk — a paginated row from /companies.
// Used by Search.tsx to render the "recently loaded" panel of real
// MCA-registered companies seeded from the data.gov.in CSV.
export type DataQuality = "complete" | "partial" | "master_only";

export interface CompanySummary {
  cin: string;
  name: string | null;
  state: string | null;
  incorporation_year: number | null;
  data_quality: DataQuality;
  n_financials: number;
  n_directors: number;
}

export interface CompaniesPage {
  total: number;
  items: CompanySummary[];
}

// PRD §10 Day-21 — DC improvement preview before submission.
export interface UploadPreview {
  cin: string;
  current_data_confidence: number;
  state: {
    n_financials: number;
    has_gst_upload: boolean;
    has_bank_upload: boolean;
  };
  if_financials_added: number;
  if_gst_added: number;
  if_bank_added: number;
}

// Dev: defaults to "/api" so Vite's proxy in vite.config.ts handles routing
// to localhost:8000 with the /api prefix stripped. Production builds set
// VITE_API_BASE to the absolute backend URL (e.g. https://sentinel-g.duckdns.org)
// — Day-28 Oracle deploy. The resulting fetch call hits the FastAPI route
// directly, no proxy involved.
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  "/api";
const TOKEN_KEY = "sentinelg.jwt";

function bearerHeader(): HeadersInit {
  try {
    const tok = localStorage.getItem(TOKEN_KEY);
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch {
    return {};
  }
}

/** Typed error so callers can branch on HTTP status (401 → redirect to login,
 * 403 → show denied, 429 → retry, etc.). Extends Error so existing
 * `(err as Error).message` callers keep working unchanged. */
export class HttpError extends Error {
  constructor(public status: number, public method: string, public path: string, public detail: string) {
    super(`${method} ${path} -> ${status}: ${detail}`);
    this.name = "HttpError";
  }
}

async function _throwHttp(method: string, path: string, res: Response): Promise<never> {
  const text = await res.text().catch(() => "");
  throw new HttpError(res.status, method, path, text || res.statusText);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: bearerHeader() });
  if (!res.ok) await _throwHttp("GET", path, res);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearerHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) await _throwHttp("POST", path, res);
  return (await res.json()) as T;
}

async function postFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST", body: form, headers: bearerHeader(),
  });
  if (!res.ok) await _throwHttp("POST", path, res);
  return (await res.json()) as T;
}

/** Download a PDF report. Triggers a save-as in the user's browser. */
export async function downloadReport(cin: string): Promise<{ reportId: string | null; generatedAt: string | null }> {
  const res = await fetch(`${API_BASE}/report/${cin}`, { headers: bearerHeader() });
  if (!res.ok) await _throwHttp("GET", `/report/${cin}`, res);
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

// Public data-lineage inventory — backs the /sources page judges hit
// without logging in. Every fraud signal traces to one of these rows.
export type SourceStatus = "live" | "stale" | "missing" | "external";
export type SourceType =
  | "government_bulk"
  | "government_scraper"
  | "court_record"
  | "industry_benchmark";

export interface SourceInventoryItem {
  id: string;
  name: string;
  url: string;
  source_type: SourceType | string;
  license: string;
  description: string;
  last_refreshed: string | null;
  record_count: number | null;
  status: SourceStatus | string;
}

export interface SourceInventory {
  generated_at: string;
  sources: SourceInventoryItem[];
  total_sources: number;
  total_records: number;
}

export const api = {
  health: () => getJson<{ status: string; version: string; env: string }>("/health"),
  analyse: (cin: string) => getJson<AnalyseResponse>(`/analyse/${cin}`),
  provenance: (cin: string) => getJson<ProvenanceResponse>(`/analyse/${cin}/provenance`),
  narrative: (cin: string) => getJson<NarrativeResponse>(`/narrative/${cin}`),
  uploadFinancials: (cin: string, file: File) =>
    postFile<UploadAck>(`/upload/financials/${cin}`, file),
  uploadGst: (cin: string, payload: Record<string, unknown>) =>
    postJson<UploadAck>(`/upload/gst/${cin}`, payload),
  uploadBank: (cin: string, creditsTotal: number) =>
    postJson<UploadAck>(`/upload/bank/${cin}`, { credits_total: creditsTotal }),
  uploadPreview: (cin: string) => getJson<UploadPreview>(`/upload/${cin}/preview`),
  companies: (opts: { state?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.state) params.set("state", opts.state);
    if (opts.limit != null) params.set("limit", String(opts.limit));
    if (opts.offset != null) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return getJson<CompaniesPage>(`/companies${qs ? "?" + qs : ""}`);
  },
  sources: () => getJson<SourceInventory>("/sources"),
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

