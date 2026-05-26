import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEMO_CINS } from "../lib/api";

const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "var(--t-eyebrow)",
  letterSpacing: "0.28em",
  textTransform: "uppercase",
  color: "var(--accent-gold)",
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  background: "var(--paper-elevated)",
  padding: "var(--s-7) var(--s-6)",
  borderTop: "1px solid var(--rule)",
  borderBottom: "1px solid var(--rule-soft)",
  boxShadow: "var(--shadow-card)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--s-4) var(--s-5)",
  border: "1px solid var(--rule-soft)",
  borderRadius: 0,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--t-h3)",
  letterSpacing: "0.04em",
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding: "var(--s-4) var(--s-6)",
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

const chipBtn: React.CSSProperties = {
  padding: "var(--s-3) var(--s-4)",
  background: "var(--paper)",
  color: "var(--ink-2)",
  border: "1px solid var(--rule-soft)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--t-meta)",
  letterSpacing: "0.06em",
  cursor: "pointer",
  borderRadius: 0,
  textAlign: "left",
};

const CIN_REGEX = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

const DEMO_LIBRARY: { key: string; cin: string; tagline: string }[] = [
  { key: "ilfs", cin: DEMO_CINS.ilfs, tagline: "IL&FS · NCLT 2018-10-01 · CRITICAL" },
  { key: "dhfl", cin: DEMO_CINS.dhfl, tagline: "DHFL · CIRP 2019-11-29 · evergreening cluster" },
  { key: "amtek", cin: DEMO_CINS.amtek, tagline: "Amtek Auto · CIRP 2017-07-24 · WD-flagged" },
  { key: "hijAuto", cin: DEMO_CINS.hijAuto, tagline: "HIJ Auto · synthetic shell" },
  { key: "xyzGarments", cin: DEMO_CINS.xyzGarments, tagline: "XYZ Garments · clean control" },
];

export default function Search() {
  const navigate = useNavigate();
  const [cin, setCin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = (target: string) => {
    const cleaned = target.trim().toUpperCase();
    if (!CIN_REGEX.test(cleaned)) {
      setError(`That doesn't look like a valid company ID (CIN). It should be 21 characters starting with L or U — for example: U45201MH2005PTC155294.`);
      return;
    }
    setError(null);
    navigate(`/dashboard?cin=${encodeURIComponent(cleaned)}`);
  };

  return (
    <div style={{ display: "grid", gap: "var(--s-7)", maxWidth: 960 }}>
      <header style={{ borderBottom: "1px solid var(--rule)", paddingBottom: "var(--s-5)" }}>
        <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-2)" }}>
          Sentinel-G · Company Search
        </p>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-h1)",
          fontWeight: 500,
          color: "var(--ink)",
          margin: 0,
          letterSpacing: "-0.01em",
        }}>
          Search a company
        </h1>
        <div style={{ height: 1, background: "var(--accent-gold)", width: 56, margin: "var(--s-4) 0" }} aria-hidden />
        <p style={{
          color: "var(--ink-2)",
          margin: 0,
          fontFamily: "var(--font-body)",
          fontSize: "var(--t-body)",
          maxWidth: "60ch",
          lineHeight: 1.6,
        }}>
          Enter a company's 21-character registration number (CIN) to run a
          full fraud risk check — we analyse financial statements, tax records,
          director networks, court proceedings, and more, then show you exactly
          what we found.
        </p>
      </header>

      <article style={cardStyle}>
        <form
          onSubmit={(e) => { e.preventDefault(); open(cin); }}
          style={{ display: "flex", gap: "var(--s-3)", alignItems: "stretch" }}
        >
          <input
            id="cin-search"
            value={cin}
            onChange={(e) => setCin(e.target.value)}
            placeholder="U45201MH2005PTC155294"
            aria-label="CIN"
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
            style={inputStyle}
          />
          <button type="submit" style={primaryBtn}>Analyse</button>
        </form>
        {error && (
          <p style={{
            color: "var(--risk-critical)",
            marginTop: "var(--s-4)",
            marginBottom: 0,
            paddingLeft: "var(--s-3)",
            borderLeft: "2px solid var(--risk-critical)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--t-meta)",
            lineHeight: 1.5,
          }}>{error}</p>
        )}
      </article>

      <section>
        <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-4)" }}>
          Try these example companies
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--s-3)" }}>
          {DEMO_LIBRARY.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => open(row.cin)}
              style={{ ...chipBtn, padding: "var(--s-4)" }}
            >
              <p style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-meta)",
                color: "var(--ink)",
                margin: 0,
                marginBottom: "var(--s-1)",
                fontWeight: 600,
              }}>{row.cin}</p>
              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--t-eyebrow)",
                letterSpacing: "0.08em",
                color: "var(--ink-3)",
                margin: 0,
              }}>{row.tagline}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
