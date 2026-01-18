import { useEffect, useState } from "react";
import { getResidentTimeline } from "../api/timeline";
import { useNavigate } from "react-router-dom";
import { useCurrentResident } from "../context/CurrentResidentContext";

function formatDate(isoString) {
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? isoString : d.toLocaleString();
}

function EventCard({ e, onOpen }) {
    const type = e.event_type;

    const label =
        type === "DAILY_LOG"
            ? "Daily Log"
            : type === "INCIDENT"
                ? "Incident"
                : type === "MEDICATION"
                    ? "Medication"
                    : "Event";

    const contextBits = [];
    if (type === "INCIDENT") {
        if (e.category) contextBits.push(e.category);
        if (e.severity) contextBits.push(`Severity: ${e.severity}`);
        if (e.follow_up_required) contextBits.push("Follow-up required");
    }

    if (type === "DAILY_LOG" && e.mood) contextBits.push(`Mood: ${e.mood}`);
    if (type === "MEDICATION" && e.outcome) contextBits.push(`Outcome: ${e.outcome}`);

    const recordedBy =
        type === "DAILY_LOG"
            ? e.author
            : type === "INCIDENT"
                ? e.reported_by
                : type === "MEDICATION"
                    ? e.administered_by
                    : null;

    return (
        <div
            onClick={onOpen}
            style={{
                cursor: "pointer",
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 14,
                marginBottom: 14,
                background: "white",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{label}</strong>
                <span style={{ color: "#555", fontSize: 14 }}>{formatDate(e.timestamp)}</span>
            </div>

            {contextBits.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                    {contextBits.join(" • ")}
                </div>
            )}

            {e.description && <p style={{ marginTop: 10 }}>{e.description}</p>}
            {e.summary && <p style={{ marginTop: 10 }}>{e.summary}</p>}
            {e.notes && <p style={{ marginTop: 10 }}>{e.notes}</p>}

            {recordedBy && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#777" }}>
                    Recorded by {recordedBy?.username ?? `user #${recordedBy?.id}`}
                </div>
            )}
        </div>
    );
}

export default function ResidentTimeline() {
    const { resident } = useCurrentResident();
    const residentId = resident?.id;

    const [data, setData] = useState(null);
    const [status, setStatus] = useState("idle");
    const [error, setError] = useState("");

    const navigate = useNavigate();

    useEffect(() => {
        if (!residentId) {
            setData(null);
            setStatus("idle");
            setError("");
            return;
        }

        let cancelled = false;

        async function load() {
            setStatus("loading");
            setError("");
            try {
                const payload = await getResidentTimeline(residentId);
                if (!cancelled) {
                    setData(payload);
                    setStatus("ready");
                }
            } catch (err) {
                const msg =
                    err?.response?.data?.detail ||
                    `Failed to load timeline (HTTP ${err?.response?.status || "?"}).`;
                if (!cancelled) {
                    setError(msg);
                    setStatus("error");
                }
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [residentId]);

    return (
        <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
            <h2>Resident timeline</h2>

            {!residentId && <p style={{ color: "#555" }}>Select a resident to view their timeline.</p>}

            {status === "loading" && <p>Loading…</p>}
            {status === "error" && <p style={{ color: "crimson" }}>{error}</p>}

            {status === "ready" && (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <strong>{data?.resident_name ?? resident?.display_name}</strong>
                    </div>

                    {(Array.isArray(data?.events) ? data.events : []).map((e, idx) => (
                        <EventCard
                            key={`${e.event_type}-${e.id ?? idx}`}
                            e={e}
                            onOpen={() => {
                                if (!e.id) return;
                                if (e.event_type === "INCIDENT") navigate(`/incidents/${e.id}`);
                                if (e.event_type === "DAILY_LOG") navigate(`/daily-logs/${e.id}`);
                                if (e.event_type === "MEDICATION") navigate(`/mar/${e.id}`);
                            }}
                        />
                    ))}
                </>
            )}
        </div>
    );
}
