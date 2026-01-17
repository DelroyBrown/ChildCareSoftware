import { useEffect, useState } from "react";
import { getResidentTimeline } from "../api/timeline";

function formatDate(isoString) {
    // kept it simple for now
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? isoString : d.toLocaleString();
}

function EventCard({ e }) {
    const type = e.event_type;

    const label =
        type === "DAILY_LOG"
            ? "Daily Log"
            : type === "INCIDENT"
                ? "Incident"
                : type === "MEDICATION"
                    ? "Medication"
                    : "Event";

    const when = e.timestamp;

    // Context / badges
    const contextBits = [];
    if (type === "INCIDENT") {
        if (e.category) contextBits.push(e.category);
        if (e.severity) contextBits.push(`Severity: ${e.severity}`);
        if (e.follow_up_required) contextBits.push("Follow-up required");
    }

    if (type === "DAILY_LOG") {
        if (e.mood) contextBits.push(`Mood: ${e.mood}`);
    }

    if (type === "MEDICATION") {
        if (e.outcome) contextBits.push(`Outcome: ${e.outcome}`);
    }

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
            style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 14,
                marginBottom: 14,
                background: "white",
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 16 }}>{label}</strong>
                <span style={{ color: "#555", fontSize: 14 }}>
                    {formatDate(when)}
                </span>
            </div>

            {/* Context line */}
            {contextBits.length > 0 && (
                <div
                    style={{
                        marginTop: 4,
                        color: "#666",
                        fontSize: 13,
                    }}
                >
                    {contextBits.join(" • ")}
                </div>
            )}

            {/* Main narrative */}
            {type === "INCIDENT" && e.description && (
                <p style={{ marginTop: 10 }}>{e.description}</p>
            )}

            {type === "DAILY_LOG" && e.summary && (
                <p style={{ marginTop: 10 }}>{e.summary}</p>
            )}

            {type === "MEDICATION" && e.notes && (
                <p style={{ marginTop: 10 }}>{e.notes}</p>
            )}

            {/* Action / outcome */}
            {type === "INCIDENT" && e.action_taken && (
                <p style={{ marginTop: 8, color: "#444" }}>
                    <strong>Action:</strong> {e.action_taken}
                </p>
            )}

            {/* Footer */}
            {recordedBy && (
                <div
                    style={{
                        marginTop: 12,
                        fontSize: 12,
                        color: "#777",
                    }}
                >
                    Recorded by user #{recordedBy?.username ?? `user #${recordedBy?.id}`}
                </div>
            )}
        </div>
    );
}


export default function ResidentTimeline({ residentId }) {
    const [data, setData] = useState(null);
    const [status, setStatus] = useState("idle");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!residentId) return;

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

            {!residentId && (
                <p style={{ color: "#555" }}>
                    No resident selected yet. (We’ll add a picker next.)
                </p>
            )}

            {status === "loading" && <p>Loading…</p>}
            {status === "error" && <p style={{ color: "crimson" }}>{error}</p>}

            {status === "ready" && (
                <>
                    {/* If your endpoint returns resident metadata, show it */}
                    <div style={{ marginBottom: 16 }}>
                        <strong>{data?.resident_name}</strong>
                        <div style={{ color: "#666", fontSize: 14 }}>ID: {data?.resident_id}</div>
                    </div>


                    {/* Timeline items */}
                    <div>
                        {(Array.isArray(data?.events) ? data.events : []).map((e, idx) => (
                            <EventCard
                                key={`${e.event_type ?? "UNKNOWN"}-${e.id ?? idx}`}
                                e={e}
                            />
                        ))}
                    </div>

                </>
            )}
        </div>
    );
}
