import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const cardStyle: React.CSSProperties = {
  background: "var(--paper-elevated)",
  padding: "var(--s-7) var(--s-6) var(--s-6)",
  boxShadow: "var(--shadow-card)",
  maxWidth: 420,
  margin: "var(--s-9) auto var(--s-7)",
  borderTop: "1px solid var(--rule)",
  borderBottom: "1px solid var(--rule-soft)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: "var(--t-eyebrow)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  marginBottom: "var(--s-2)",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--s-3) var(--s-4)",
  border: "1px solid var(--rule-soft)",
  borderRadius: 0,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--t-body)",
  marginBottom: "var(--s-5)",
  outline: "none",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--s-4) var(--s-5)",
  border: 0,
  background: "var(--ink)",
  color: "var(--paper)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--t-eyebrow)",
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  fontWeight: 700,
  cursor: "pointer",
  borderRadius: 0,
};

export default function Login() {
  const { login, register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [mode, setMode] = useState<"login" | "register">("login");
  // Blank by default — backend EmailStr (pydantic email-validator) rejects
  // `.local` / `.test` TLDs as reserved-use, so a prefilled
  // `analyst@sentinel-g.local` made the form unusable out of the box (F1).
  const [email, setEmail] = useState("");
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
      <p style={{
        fontFamily: "var(--font-body)",
        fontSize: "var(--t-eyebrow)",
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: "var(--accent-gold)",
        margin: 0,
        marginBottom: "var(--s-3)",
        fontWeight: 700,
      }}>
        Sentinel-G · Analyst Console
      </p>
      <h1 style={{
        fontFamily: "var(--font-display)",
        fontWeight: 500,
        fontSize: "var(--t-h1)",
        lineHeight: 1.05,
        color: "var(--ink)",
        margin: 0,
        marginBottom: "var(--s-3)",
        letterSpacing: "-0.01em",
      }}>
        {mode === "login" ? "Sign in" : "New account"}
      </h1>
      <div style={{
        height: 1, background: "var(--accent-gold)",
        width: 48, marginBottom: "var(--s-5)",
      }} aria-hidden />
      <p style={{
        color: "var(--ink-3)", margin: 0,
        marginBottom: "var(--s-6)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--t-meta)",
      }}>
        {mode === "login" ? "No account?" : "Already registered?"}{" "}
        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
          style={{
            background: "none", border: 0, padding: 0,
            color: "var(--accent-gold)",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: "var(--t-meta)",
            fontWeight: 600,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {mode === "login" ? "Register instead" : "Sign in instead"}
        </button>
      </p>
      <label htmlFor="email" style={labelStyle}>Email</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@example.com"
        style={inputStyle}
      />
      <label htmlFor="password" style={labelStyle}>Password</label>
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
          marginBottom: "var(--s-5)",
          padding: "var(--s-3) var(--s-4)",
          background: "var(--paper)",
          borderLeft: "3px solid var(--risk-critical)",
          color: "var(--risk-critical)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--t-meta)",
        }}>{error}</div>
      )}
      <button type="submit" disabled={submitting} style={btnStyle}>
        {submitting ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
