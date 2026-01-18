import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import Login from "./pages/Login";
import ResidentTimeline from "./pages/ResidentTimeline";

import IncidentDetail from "./pages/IncidentDetail";
import DailyLogDetail from "./pages/DailyLogDetail";
import MARDetail from "./pages/MARDetail";

import { CurrentResidentProvider } from "./context/CurrentResidentContext";
import ResidentSelector from "./components/ResidentSelector";

function Protected({ authed, children }) {
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

function Home() {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1>Carehome Staff</h1>
        <ResidentSelector />
      </div>
      <ResidentTimeline />
    </div>
  );
}

// Wrap ALL protected routes so resident context persists across the whole app
function ProtectedWithResidentProvider({ authed }) {
  return (
    <Protected authed={authed}>
      <CurrentResidentProvider>
        <Outlet />
      </CurrentResidentProvider>
    </Protected>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={() => setAuthed(true)} />} />

        {/* All routes below share CurrentResidentProvider */}
        <Route element={<ProtectedWithResidentProvider authed={authed} />}>
          <Route path="/" element={<Home />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="/daily-logs/:id" element={<DailyLogDetail />} />
          <Route path="/mar/:id" element={<MARDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
