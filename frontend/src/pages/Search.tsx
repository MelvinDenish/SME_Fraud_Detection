import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CompanySummary } from "../lib/api";

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

export default function Search() {
  const navigate = useNavigate();
  const [cin, setCin] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Real Tamil Nadu companies seeded from the data.gov.in bulk CSV
  // (see scripts/seed_data_gov_in.py). Hidden if the endpoint 404s or
  // returns zero rows — keeps the page useful even before the seed
  // script has been run.
  const [tnCompanies, setTnCompanies] = useState<CompanySummary[] | null>(null);
  const [tnTotal, setTnTotal] = useState<number>(0);
  const [tnLoading, setTnLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    api.companies({ state: "TN", limit: 24 })
      .then((page) => {
        if (cancelled) return;
        setTnCompanies(page.items);
        setTnTotal(page.total);
      })
      .catch(() => { if (!cancelled) setTnCompanies([]); })
      .finally(() => { if (!cancelled) setTnLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

      {(tnLoading || (tnCompanies && tnCompanies.length > 0)) && (
        <section>
          <p style={{ ...eyebrow, margin: 0, marginBottom: "var(--s-2)" }}>
            Tamil Nadu · live MCA registry
          </p>
          <p style={{
            color: "var(--ink-3)",
            margin: 0,
            marginBottom: "var(--s-4)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--t-meta)",
            lineHeight: 1.55,
            maxWidth: "60ch",
          }}>
            Real Tamil Nadu companies loaded from the data.gov.in bulk MCA
            snapshot ({tnTotal.toLocaleString()} in graph; showing
            {" "}{tnCompanies?.length ?? 0} newest registrations). Click any
            row to run the full Sentinel-G analysis.
          </p>
          {tnLoading && (
            <p style={{
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--t-meta)",
              margin: 0,
            }}>Loading...</p>
          )}
          {tnCompanies && tnCompanies.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--s-3)" }}>
              {tnCompanies.map((c) => (
                <button
                  key={c.cin}
                  type="button"
                  onClick={() => open(c.cin)}
                  style={{ ...chipBtn, padding: "var(--s-4)" }}
                >
                  <p style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--t-meta)",
                    color: "var(--ink)",
                    margin: 0,
                    marginBottom: "var(--s-1)",
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}>{c.name ?? c.cin}</p>
                  <p style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--t-eyebrow)",
                    letterSpacing: "0.04em",
                    color: "var(--ink-3)",
                    margin: 0,
                  }}>
                    {c.cin}
                    {c.incorporation_year != null && (
                      <span style={{ marginLeft: "var(--s-2)", color: "var(--accent-gold)" }}>
                        · {c.incorporation_year}
                      </span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
