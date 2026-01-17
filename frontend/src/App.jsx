import { useState } from 'react';
import ResidentTimeline from './pages/ResidentTimeline';
import Login from './pages/Login';

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [residentId, setResidentId] = useState("");

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1>Carehome Staff</h1>

        <label style={{ display: "block", margin: "12px 0" }}>
          Resident ID (temporary)
          <input
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            placeholder="e.g. 1"
            style={{ marginLeft: 10 }}
          />
        </label>
      </div>

      <ResidentTimeline residentId={residentId} />
    </div>
  );
}
