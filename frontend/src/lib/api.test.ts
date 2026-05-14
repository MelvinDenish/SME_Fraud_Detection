import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BAND_PALETTE,
  DEMO_CINS,
  SEVERITY_PALETTE,
  api,
} from "./api";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "ok",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("BAND_PALETTE", () => {
  it("ships every PRD §7.2 band", () => {
    expect(Object.keys(BAND_PALETTE).sort()).toEqual(["CRITICAL", "HIGH", "LOW", "MEDIUM"]);
  });
});

describe("SEVERITY_PALETTE", () => {
  it("ships every Severity level", () => {
    expect(Object.keys(SEVERITY_PALETTE).sort()).toEqual(["CRITICAL", "HIGH", "LOW", "MEDIUM"]);
  });
});

describe("DEMO_CINS", () => {
  it("includes the IL&FS demo anchor", () => {
    expect(DEMO_CINS.ilfs).toBe("U45201MH2005PTC155294");
  });
  it("includes DHFL for the evergreening view", () => {
    expect(DEMO_CINS.dhfl).toBe("L65910MH1984PLC032662");
  });
});

describe("api.analyse", () => {
  it("hits /api/analyse/{cin} and returns the typed payload", async () => {
    const stub = vi.fn().mockResolvedValue(mockJsonResponse(200, {
      cin: DEMO_CINS.ilfs,
      fraud_risk_score: 75,
      risk_band: "CRITICAL",
      data_confidence: 92,
      override_applied: true,
      ensemble_disagreement_flag: true,
      evidence_chain: [],
      module_breakdown: { m01_beneish: 30 },
      skipped_modules: [],
      p_fraud_calibrated: null,
      p_fraud_interval: null,
      propagation_band: "CRITICAL",
      propagation_score: 32,
    }));
    globalThis.fetch = stub as unknown as typeof fetch;
    const got = await api.analyse(DEMO_CINS.ilfs);
    expect(stub.mock.calls[0][0]).toBe(`/api/analyse/${DEMO_CINS.ilfs}`);
    expect(got.risk_band).toBe("CRITICAL");
    expect(got.fraud_risk_score).toBe(75);
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(404, { detail: "missing" })) as unknown as typeof fetch;
    await expect(api.analyse("U00000XX0000PTC000000")).rejects.toThrow(/404/);
  });
});

describe("api.provenance", () => {
  it("hits /api/analyse/{cin}/provenance", async () => {
    const stub = vi.fn().mockResolvedValue(mockJsonResponse(200, {
      cin: DEMO_CINS.ilfs,
      signal_count: 0,
      signals: [],
      triggered_by: [],
    }));
    globalThis.fetch = stub as unknown as typeof fetch;
    const got = await api.provenance(DEMO_CINS.ilfs);
    expect(stub.mock.calls[0][0]).toBe(`/api/analyse/${DEMO_CINS.ilfs}/provenance`);
    expect(got.signal_count).toBe(0);
  });
});

describe("api.uploadBank", () => {
  it("POSTs credits_total as JSON", async () => {
    const stub = vi.fn().mockResolvedValue(mockJsonResponse(200, {
      cin: DEMO_CINS.ilfs, accepted: true, detail: "ok", extra: {},
    }));
    globalThis.fetch = stub as unknown as typeof fetch;
    await api.uploadBank(DEMO_CINS.ilfs, 12345);
    const [path, init] = stub.mock.calls[0];
    expect(path).toBe(`/api/upload/bank/${DEMO_CINS.ilfs}`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ credits_total: 12345 });
  });
});

describe("api.uploadFinancials", () => {
  it("POSTs multipart with the file under 'file'", async () => {
    const stub = vi.fn().mockResolvedValue(mockJsonResponse(200, {
      cin: DEMO_CINS.ilfs, accepted: true, detail: "ok", extra: {},
    }));
    globalThis.fetch = stub as unknown as typeof fetch;
    const file = new File([new Uint8Array([0])], "test.pdf", { type: "application/pdf" });
    await api.uploadFinancials(DEMO_CINS.ilfs, file);
    const [path, init] = stub.mock.calls[0];
    expect(path).toBe(`/api/upload/financials/${DEMO_CINS.ilfs}`);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });
});
