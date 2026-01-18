import { useEffect, useState } from "react";
import { searchResidents } from "../api/timeline";
import { useCurrentResident } from "../context/CurrentResidentContext";


export default function ResidentSelector() {
    const { resident, setResident } = useCurrentResident();
    const [query, setQuery] = useState(resident?.display_name || "");
    const [matches, setMatches] = useState([]);

    useEffect(() => {
        setQuery(resident?.display_name || "");
    }, [resident?.id]);

    useEffect(() => {
        let cancelled = false;

        async function runSearch() {
            const q = query.trim();
            if (!q) {
                setMatches([]);
                return;
            }

            try {
                const results = await searchResidents(q);
                if (!cancelled) setMatches(results);
            } catch {
                if (!cancelled) setMatches([]);
            }
        }

        runSearch();
        return () => {
            cancelled = true;
        };
    }, [query]);

    function clearSelection() {
        setQuery("");
        setMatches([]);
        setResident(null);
    }

    return (
        <div style={{ marginBottom: 16 }}>
            <input
                placeholder="Search resident name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #ccc",
                }}
            />

            {(query || resident) && (
                <button
                    type="button"
                    onClick={clearSelection}
                    style={{
                        padding: "0 14px",
                        borderRadius: 8,
                        border: "1px sold #ccc",
                        background: "white",
                        cursor: "pointer",
                    }}
                >
                    Clear
                </button>
            )}

            {matches.length > 0 && (
                <div
                    style={{
                        border: "1px solid #ddd",
                        borderRadius: 8,
                        background: "white",
                        marginTop: 8,
                        overflow: "hidden",
                    }}
                >
                    {matches.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                                setResident({ id: r.id, display_name: r.display_name });
                                setMatches([]);
                                setQuery(r.display_name);
                            }}
                            style={{
                                display: "block",
                                width: "100%",
                                padding: 10,
                                border: "none",
                                textAlign: "left",
                                background: "white",
                                cursor: "pointer",
                            }}
                        >
                            {r.display_name}
                        </button>
                    ))}
                </div>
            )}

            {resident && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
                    Selected: <strong>{resident.display_name}</strong>
                </div>
            )}
        </div>
    );
}