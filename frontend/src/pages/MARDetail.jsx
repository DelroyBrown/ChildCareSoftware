import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { http } from "../api/http";
import { patchMAR } from "../api/mar";
import EditIntentGate from "../components/EditIntentGate";

function formatDT(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
}

function AuditPanel({ auditStatus, auditError, auditEvents }) {
    if (auditStatus === "loading") return <p>Loading audit…</p>;
    if (auditStatus === "error") return <p style={{ color: "crimson" }}>{auditError}</p>;
    if (!auditEvents?.length) return <p>No history found.</p>;

    return (
        <div style={{ display: "grid", gap: 12 }}>
            {auditEvents.map((e) => (
                <div
                    key={e.id}
                    style={{
                        background: "white",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        padding: 12,
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                            <div style={{ fontWeight: 700 }}>
                                {e.actor?.username || "Unknown user"} — {e.event}
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.8 }}>{formatDT(e.at)}</div>
                        </div>
                        <div style={{ fontSize: 13, textAlign: "right" }}>
                            <div>
                                <strong>Reason:</strong> {e.reason?.type || "—"}
                            </div>
                            <div style={{ opacity: 0.85 }}>{e.reason?.detail || "—"}</div>
                        </div>
                    </div>

                    <div style={{ marginTop: 10 }}>{e.summary}</div>

                    {!!e.changes?.length && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Changes</div>
                            <div style={{ display: "grid", gap: 6 }}>
                                {e.changes.map((c, idx) => (
                                    <div
                                        key={`${e.id}-${idx}`}
                                        style={{
                                            border: "1px solid #eee",
                                            borderRadius: 8,
                                            padding: 8,
                                            background: "#fafafa",
                                        }}
                                    >
                                        <div style={{ fontWeight: 600 }}>{c.field}</div>
                                        <div style={{ fontSize: 13, opacity: 0.9 }}>
                                            <strong>From:</strong> {c.from ?? "—"} → <strong>To:</strong> {c.to ?? "—"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export default function MARDetail() {
    const { id } = useParams();

    const [data, setData] = useState(null);
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState("");

    // Audit state
    const [activeTab, setActiveTab] = useState("details");
    const [canSeeAudit, setCanSeeAudit] = useState(false);
    const [auditEvents, setAuditEvents] = useState([]);
    const [auditStatus, setAuditStatus] = useState("idle");
    const [auditError, setAuditError] = useState("");

    // Edit
    const [editing, setEditing] = useState(false);
    const [intent, setIntent] = useState(null);
    const [draftNotes, setDraftNotes] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setStatus("loading");
            setError("");

            setActiveTab("details");
            setCanSeeAudit(false);
            setAuditEvents([]);
            setAuditStatus("idle");
            setAuditError("");

            setEditing(false);
            setIntent(null);

            try {
                const res = await http.get(`/api/mar/${id}/`);
                if (!cancelled) {
                    setData(res.data);
                    setDraftNotes(res.data.notes || "");
                    setStatus("ready");
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err?.response?.data?.detail || `Failed to load MAR (HTTP ${err?.response?.status || "?"}).`
                    );
                    setStatus("error");
                }
            }

            // Audit (manager-only)
            try {
                if (!cancelled) setAuditStatus("loading");
                const a = await http.get(`/api/mar/${id}/history-summary/`);
                if (!cancelled) {
                    setCanSeeAudit(true);
                    setAuditEvents(a.data || []);
                    setAuditStatus("ready");
                }
            } catch (err) {
                const code = err?.response?.status;

                if (code === 403) {
                    if (!cancelled) {
                        setCanSeeAudit(false);
                        setAuditStatus("idle");
                    }
                    return;
                }

                if (!cancelled) {
                    setCanSeeAudit(true);
                    setAuditStatus("error");
                    setAuditError(err?.response?.data?.detail || `Failed to load audit (HTTP ${code || "?"}).`);
                }
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [id]);

    const TabButton = ({ id: tabId, children }) => (
        <button
            onClick={() => setActiveTab(tabId)}
            style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: activeTab === tabId ? "#111" : "white",
                color: activeTab === tabId ? "white" : "#111",
                cursor: "pointer",
            }}
            type="button"
        >
            {children}
        </button>
    );

    // NEW: “last amended” summary (uses newest history event)
    const lastAudit = Array.isArray(auditEvents) && auditEvents.length ? auditEvents[0] : null;

    return (
        <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
            <Link to="/">← Back</Link>
            <h2 style={{ marginTop: 12 }}>Medication Administration Record #{id}</h2>

            {status === "loading" && <p>Loading…</p>}
            {status === "error" && <p style={{ color: "crimson" }}>{error}</p>}

            {status === "ready" && data && (
                <>
                    {/* NEW: last amended line (manager-only, derived from auditEvents) */}
                    {canSeeAudit && lastAudit && (
                        <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
                            Last amended by <strong>{lastAudit.actor?.username || "Unknown user"}</strong> on{" "}
                            <strong>{formatDT(lastAudit.at)}</strong>
                            {lastAudit.reason?.type ? (
                                <>
                                    {" "}
                                    (<strong>{lastAudit.reason.type}</strong>)
                                </>
                            ) : null}
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                        <TabButton id="details">Details</TabButton>
                        {canSeeAudit && <TabButton id="audit">Audit</TabButton>}
                    </div>

                    {activeTab === "details" && (
                        <div
                            style={{
                                background: "white",
                                border: "1px solid #ddd",
                                borderRadius: 10,
                                padding: 14,
                                display: "grid",
                                gap: 8,
                            }}
                        >
                            <p>
                                <strong>Administered:</strong> {data.administered_at}
                            </p>
                            <p>
                                <strong>Outcome:</strong> {data.outcome || "—"}
                            </p>

                            {!editing && (
                                <>
                                    <p>
                                        <strong>Notes:</strong> {data.notes || "—"}
                                    </p>
                                    <button type="button" onClick={() => setEditing(true)}>
                                        Edit notes
                                    </button>
                                </>
                            )}

                            {editing && !intent && (
                                <EditIntentGate onCancel={() => setEditing(false)} onConfirm={(i) => setIntent(i)} />
                            )}

                            {editing && intent && (
                                <>
                                    <textarea rows={4} value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const res = await patchMAR(id, {
                                                        notes: draftNotes,
                                                        ...intent,
                                                    });
                                                    setData(res.data);
                                                    setEditing(false);
                                                    setIntent(null);

                                                    // NEW: refresh audit header immediately after save (manager-only)
                                                    try {
                                                        const a = await http.get(`/api/mar/${id}/history-summary/`);
                                                        setAuditEvents(a.data || []);
                                                    } catch { }
                                                } catch (err) {
                                                    alert(err?.response?.data?.detail || "Update rejected by server.");
                                                }
                                            }}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditing(false);
                                                setIntent(null);
                                                setDraftNotes(data.notes || "");
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}

                            <p>
                                <strong>Medication:</strong> {data.medication || "—"}
                            </p>
                        </div>
                    )}

                    {activeTab === "audit" && canSeeAudit && (
                        <div
                            style={{
                                background: "white",
                                border: "1px solid #ddd",
                                borderRadius: 10,
                                padding: 14,
                            }}
                        >
                            <AuditPanel auditStatus={auditStatus} auditError={auditError} auditEvents={auditEvents} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
