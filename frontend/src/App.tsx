import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import GraphExplorer from "./pages/GraphExplorer";
import ITCCarousel from "./pages/ITCCarousel";
import Evergreening from "./pages/Evergreening";
import UploadPage from "./pages/Upload";
import Reports from "./pages/Reports";
import Login from "./pages/Login";
import Search from "./pages/Search";
import Sources from "./pages/Sources";

// Editorial masthead — dark ink band sitting over the parchment canvas.
// Type tokens cascade from styles/tokens.css; no font override here.

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--s-4)",
  padding: "var(--s-4) var(--s-7)",
  background: "var(--ink)",
  color: "var(--paper)",
  position: "sticky",
  top: 0,
  zIndex: 10,
  alignItems: "center",
  borderBottom: "1px solid var(--accent-gold)",
};

const linkBase: React.CSSProperties = {
  color: "var(--paper)",
  textDecoration: "none",
  padding: "6px 10px",
  fontFamily: "var(--font-body)",
  fontSize: "0.78rem",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  fontWeight: 600,
  // F7: don't mix the `borderBottom` shorthand with a `borderBottomColor`
  // longhand override in the active variant — React warns and the colour
  // sometimes wins, sometimes doesn't. Split into longhand triplet here.
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  borderBottomColor: "transparent",
  transition: "border-color var(--d-quick) var(--ease-out), color var(--d-quick)",
};

function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return isActive
    ? { ...linkBase, borderBottomColor: "var(--accent-gold)", color: "var(--accent-gold-soft)" }
    : linkBase;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function AuthControls() {
  const { user, isAuthenticated, logout } = useAuth();
  if (!isAuthenticated) {
    return <NavLink to="/login" style={navLinkStyle}>Log in</NavLink>;
  }
  return (
    <span
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        fontSize: "0.78rem",
      }}
    >
      <span
        style={{
          color: "var(--paper-deep)",
          fontFamily: "var(--font-mono)",
          letterSpacing: 0,
          textTransform: "none",
        }}
      >
        {user?.email ?? "…"}
      </span>
      <button
        onClick={logout}
        style={{
          padding: "5px 12px",
          background: "transparent",
          color: "var(--paper)",
          border: "1px solid var(--paper-deep)",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontSize: "0.7rem",
          cursor: "pointer",
        }}
      >
        Log out
      </button>
    </span>
  );
}

function Masthead() {
  return (
    <NavLink
      to="/dashboard"
      style={{
        marginRight: "auto",
        textDecoration: "none",
        display: "flex",
        alignItems: "baseline",
        gap: "var(--s-3)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 500,
          fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
          fontSize: "1.5rem",
          color: "var(--paper)",
          letterSpacing: "-0.02em",
        }}
      >
        Sentinel<span style={{ color: "var(--accent-gold)" }}>·</span>G
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.65rem",
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color: "var(--paper-deep)",
        }}
      >
        Forensic Desk
      </span>
    </NavLink>
  );
}

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <nav style={navStyle}>
        <Masthead />
        <NavLink to="/search" style={navLinkStyle}>Search</NavLink>
        <NavLink to="/dashboard" style={navLinkStyle}>Dossier</NavLink>
        <NavLink to="/graph" style={navLinkStyle}>Graph</NavLink>
        <NavLink to="/itc" style={navLinkStyle}>ITC Ring</NavLink>
        <NavLink to="/evergreening" style={navLinkStyle}>Evergreening</NavLink>
        <NavLink to="/upload" style={navLinkStyle}>Upload</NavLink>
        <NavLink to="/reports" style={navLinkStyle}>Reports</NavLink>
        <NavLink to="/sources" style={navLinkStyle}>Sources</NavLink>
        <AuthControls />
      </nav>
      <main
        style={{
          padding: "var(--s-7) var(--s-6) var(--s-9)",
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/graph" element={<ProtectedRoute><GraphExplorer /></ProtectedRoute>} />
          <Route path="/graph/:cin" element={<ProtectedRoute><GraphExplorer /></ProtectedRoute>} />
          <Route path="/itc" element={<ProtectedRoute><ITCCarousel /></ProtectedRoute>} />
          <Route path="/evergreening" element={<ProtectedRoute><Evergreening /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          {/* /sources is intentionally public — judges and auditors can verify the data
              lineage without an account. */}
          <Route path="/sources" element={<Sources />} />
          <Route path="*" element={<p>Not found</p>} />
        </Routes>
      </main>
    </div>
  );
}
