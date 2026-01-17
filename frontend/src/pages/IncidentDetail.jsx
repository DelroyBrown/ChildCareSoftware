import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { http } from "../api/http";

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
                                            <strong>From:</strong> {c.from ?? "—"} &nbsp;→&nbsp; <strong>To:</strong>{" "}
                                            {c.to ?? "—"}
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

export default function IncidentDetail() {
    const { id } = useParams();

    const [data, setData] = useState(null);
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState("");

    // Audit state
    const [activeTab, setActiveTab] = useState("details");
    const [canSeeAudit, setCanSeeAudit] = useState(false);
    const [auditEvents, setAuditEvents] = useState([]);
    const [auditStatus, setAuditStatus] = useState("idle"); // idle|loading|ready|error
    const [auditError, setAuditError] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setStatus("loading");
            setError("");

            // reset audit per record
            setActiveTab("details");
            setCanSeeAudit(false);
            setAuditEvents([]);
            setAuditStatus("idle");
            setAuditError("");

            try {
                // Incident detail
                const res = await http.get(`/api/incidents/${id}/`);
                if (!cancelled) {
                    setData(res.data);
                    setStatus("ready");
                }
            } catch (err) {
                const msg =
                    err?.response?.data?.detail ||
                    `Failed to load incident (HTTP ${err?.response?.status || "?"}).`;
                if (!cancelled) {
                    setError(msg);
                    setStatus("error");
                }
            }

            // Audit (manager-only). Server decides.
            try {
                if (!cancelled) setAuditStatus("loading");
                const a = await http.get(`/api/incidents/${id}/history-summary/`);
                if (!cancelled) {
                    setCanSeeAudit(true);
                    setAuditEvents(a.data || []);
                    setAuditStatus("ready");
                }
            } catch (err) {
                const code = err?.response?.status;

                // 403 => not a manager => no tab
                if (code === 403) {
                    if (!cancelled) {
                        setCanSeeAudit(false);
                        setAuditStatus("idle");
                    }
                    return;
                }

                // Anything else: if they're a manager we want a useful error.
                if (!cancelled) {
                    setCanSeeAudit(true);
                    setAuditStatus("error");
                    setAuditError(
                        err?.response?.data?.detail ||
                        `Failed to load audit (HTTP ${code || "?"}).`
                    );
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

    return (
        <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
            <Link to="/">← Back</Link>
            <h2 style={{ marginTop: 12 }}>Incident #{id}</h2>

            {status === "loading" && <p>Loading…</p>}
            {status === "error" && <p style={{ color: "crimson" }}>{error}</p>}

            {status === "ready" && data && (
                <>
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
                            }}
                        >
                            <p>
                                <strong>Occurred:</strong> {data.occurred_at}
                            </p>
                            <p>
                                <strong>Category:</strong> {data.category || "—"}
                            </p>
                            <p>
                                <strong>Severity:</strong> {data.severity || "—"}
                            </p>
                            <p>
                                <strong>Description:</strong> {data.description || "—"}
                            </p>
                            <p>
                                <strong>Action taken:</strong> {data.action_taken || "—"}
                            </p>
                            <p>
                                <strong>Follow-up required:</strong>{" "}
                                {data.follow_up_required ? "Yes" : "No"}
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
                            <AuditPanel
                                auditStatus={auditStatus}
                                auditError={auditError}
                                auditEvents={auditEvents}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
