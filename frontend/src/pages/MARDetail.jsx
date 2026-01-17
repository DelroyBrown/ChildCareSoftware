import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { http } from "../api/http";

export default function MARDetail() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setStatus("loading");
            setError("");
            try {
                const res = await http.get(`/api/mar/${id}/`);
                if (!cancelled) {
                    setData(res.data);
                    setStatus("ready");
                }
            } catch (err) {
                const msg =
                    err?.response?.data?.detail ||
                    `Failed to load MAR (HTTP ${err?.response?.status || "?"}).`;
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
    }, [id]);

    return (
        <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
            <Link to="/">← Back</Link>
            <h2 style={{ marginTop: 12 }}>Medication Administration Record #{id}</h2>

            {status === "loading" && <p>Loading…</p>}
            {status === "error" && <p style={{ color: "crimson" }}>{error}</p>}

            {status === "ready" && data && (
                <div style={{ background: "white", border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
                    <p><strong>Administered:</strong> {data.administered_at}</p>
                    <p><strong>Outcome:</strong> {data.outcome || "—"}</p>
                    <p><strong>Notes:</strong> {data.notes || "—"}</p>
                    <p><strong>Medication:</strong> {data.medication || "—"}</p>
                </div>
            )}
        </div>
    );
}