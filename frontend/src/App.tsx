import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import GraphExplorer from "./pages/GraphExplorer";
import ITCCarousel from "./pages/ITCCarousel";
import Evergreening from "./pages/Evergreening";
import UploadPage from "./pages/Upload";

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  padding: "1rem 2rem",
  background: "#0f172a",
  color: "white",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const linkBase: React.CSSProperties = {
  color: "white",
  textDecoration: "none",
  padding: "0.25rem 0.5rem",
  borderRadius: 4,
};

function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return isActive
    ? { ...linkBase, background: "#1e3a8a" }
    : linkBase;
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
      </nav>
      <main style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/graph" element={<GraphExplorer />} />
          <Route path="/graph/:cin" element={<GraphExplorer />} />
          <Route path="/itc" element={<ITCCarousel />} />
          <Route path="/evergreening" element={<Evergreening />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="*" element={<p>Not found</p>} />
        </Routes>
      </main>
    </div>
  );
}
