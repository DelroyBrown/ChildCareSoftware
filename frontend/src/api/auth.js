import axios from "axios";
import { tokenStore } from "./http";

export async function login(username, password) {
    const res = await axios.post("/api/auth/token/", { username, password });
    tokenStore.setTokens(res.data.access, res.data.refresh);
    return res.data;
}

export function logout() {
    tokenStore.clear();
}