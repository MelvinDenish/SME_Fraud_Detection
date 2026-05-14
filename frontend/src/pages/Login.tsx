import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 8,
  padding: "1.5rem",
  boxShadow: "0 1px 2px rgba(15,23,42,.07)",
  maxWidth: 380,
  margin: "3rem auto",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  marginTop: 4,
  marginBottom: 12,
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem",
  border: 0,
  background: "#0f172a",
  color: "white",
  borderRadius: 4,
  cursor: "pointer",
  fontWeight: 600,
};

export default function Login() {
  const { login, register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("analyst@sentinel-g.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      <h1 style={{ marginTop: 0 }}>{mode === "login" ? "Log in" : "Register"}</h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Sentinel-G analyst console. {mode === "login" ? "No account?" : "Already registered?"}{" "}
        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
          style={{ background: "none", border: 0, color: "#1d4ed8", cursor: "pointer", padding: 0 }}
        >
          {mode === "login" ? "Register instead" : "Log in instead"}
        </button>
      </p>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        style={inputStyle}
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        style={inputStyle}
      />
      {error && (
        <div style={{
          marginBottom: 12, padding: "0.5rem 0.75rem",
          background: "#fee2e2", borderLeft: "4px solid #b91c1c", borderRadius: 4,
        }}>{error}</div>
      )}
      <button type="submit" disabled={submitting} style={btnStyle}>
        {submitting ? "…" : mode === "login" ? "Log in" : "Create account"}
      </button>
    </form>
  );
}
