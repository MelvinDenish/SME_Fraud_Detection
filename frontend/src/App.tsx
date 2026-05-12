import { useQuery } from "@tanstack/react-query";

interface HealthResponse {
  status: string;
  version: string;
  env: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export default function App() {
  const { data, isLoading, error } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>Sentinel-G</h1>
      <p>SME Financial Fraud Detection · HackHazards '26</p>
      <hr />
      <h2>Backend health</h2>
      {isLoading && <p>Checking…</p>}
      {error && <p style={{ color: "crimson" }}>{(error as Error).message}</p>}
      {data && (
        <pre style={{ background: "#f4f4f4", padding: "1rem", borderRadius: 8 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}
