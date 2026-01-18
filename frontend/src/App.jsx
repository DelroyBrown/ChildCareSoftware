import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

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

        {/* Shared selector (used once, powers many pages) */}
        <ResidentSelector />
      </div>

      <ResidentTimeline />
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={() => setAuthed(true)} />} />

        <Route
          path="/"
          element={
            <Protected authed={authed}>
              <CurrentResidentProvider>
                <Home />
              </CurrentResidentProvider>
            </Protected>
          }
        />

        <Route
          path="/incidents/:id"
          element={
            <Protected authed={authed}>
              <IncidentDetail />
            </Protected>
          }
        />

        <Route
          path="/daily-logs/:id"
          element={
            <Protected authed={authed}>
              <DailyLogDetail />
            </Protected>
          }
        />

        <Route
          path="/mar/:id"
          element={
            <Protected authed={authed}>
              <MARDetail />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
