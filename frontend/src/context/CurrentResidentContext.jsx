import { createContext, useContext, useMemo, useState } from "react";


const CurrentResidentContext = createContext(null);

export function CurrentResidentProvider({ children }) {
    const [resident, setResident] = useState(null);
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