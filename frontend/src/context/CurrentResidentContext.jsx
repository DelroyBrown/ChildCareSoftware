import { createContext, useContext, useMemo, useState, useEffect } from "react";


const CurrentResidentContext = createContext(null);
const STORAGE_KEY = "current_resident_v1";

export function CurrentResidentProvider({ children }) {
    const [resident, setResident] = useState(null);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            // Minimal validation
            if (parsed && typeof parsed.id !== "undefined" && typeof parsed.display_name === "string") {
                setResident(parsed);
            }
        } catch {
            // ignore corrupt storage (for now)
        }
    }, []);

    // Save on change
    useEffect(() => {
        try {
            if (!resident) {
                sessionStorage.removeItem(STORAGE_KEY);
                return;
            }
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(resident));
        } catch {
            // Ignore storage failures (for now)
        }
    }, [resident]);

    const value = useMemo(() => ({ resident, setResident }), [resident]);

    return (
        <CurrentResidentContext.Provider value={value}>
            {children}
        </CurrentResidentContext.Provider>
    );
}

export function useCurrentResident() {
    const ctx = useContext(CurrentResidentContext);
    if (!ctx) {
        throw new Error("useCurrentResident must be used within CurrentResidentProvider");
    }
    return ctx;
}