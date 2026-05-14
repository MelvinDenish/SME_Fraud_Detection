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

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  padding: "1rem 2rem",
  background: "#0f172a",
  color: "white",
  position: "sticky",
  top: 0,
  zIndex: 10,
  alignItems: "center",
};

const linkBase: React.CSSProperties = {
  color: "white",
  textDecoration: "none",
  padding: "0.25rem 0.5rem",
  borderRadius: 4,
};

function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return isActive ? { ...linkBase, background: "#1e3a8a" } : linkBase;
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
    <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".85rem" }}>
      <span style={{ color: "#cbd5e1" }}>{user?.email ?? "…"}</span>
      <button
        onClick={logout}
        style={{ padding: "0.3rem 0.6rem", background: "#334155", color: "white", border: 0, borderRadius: 4, cursor: "pointer" }}
      >Log out</button>
    </span>
  );
}

export default function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <nav style={navStyle}>
        <strong style={{ marginRight: "auto" }}>Sentinel-G</strong>
        <NavLink to="/dashboard" style={navLinkStyle}>Dashboard</NavLink>
        <NavLink to="/graph" style={navLinkStyle}>Graph Explorer</NavLink>
        <NavLink to="/itc" style={navLinkStyle}>ITC Carousel</NavLink>
        <NavLink to="/evergreening" style={navLinkStyle}>Evergreening</NavLink>
        <NavLink to="/upload" style={navLinkStyle}>Upload</NavLink>
        <NavLink to="/reports" style={navLinkStyle}>Reports</NavLink>
        <AuthControls />
      </nav>
      <main style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/graph" element={<ProtectedRoute><GraphExplorer /></ProtectedRoute>} />
          <Route path="/graph/:cin" element={<ProtectedRoute><GraphExplorer /></ProtectedRoute>} />
          <Route path="/itc" element={<ProtectedRoute><ITCCarousel /></ProtectedRoute>} />
          <Route path="/evergreening" element={<ProtectedRoute><Evergreening /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="*" element={<p>Not found</p>} />
        </Routes>
      </main>
    </div>
  );
}
