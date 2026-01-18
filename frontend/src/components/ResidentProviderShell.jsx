import { Outlet } from "react-router-dom";
import { CurrentResidentProvider } from "../context/CurrentResidentContext";


export default function ResidentProviderShell() {
    return (
        <CurrentResidentProvider>
            <Outlet />
        </CurrentResidentProvider>
    );
}
