import { useState } from "react";
import { login } from "../api/auth";

export default function Login({ onLogin }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        try {
            await login(username, password);
            onLogin?.();
        } catch (err) {
            const msg =
                err?.response?.data?.detail ||
                "Login failed. Check username/password.";
            setError(msg);
        }
    }

    return (
        <div style={{ maxWidth: 360, margin: "48px auto", padding: 16 }}>
            <h1>Carehome Staff</h1>

            <form onSubmit={handleSubmit}>
                <label>
                    Username
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        style={{ width: "100%", marginTop: 6, marginBottom: 12 }}
                    />
                </label>

                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        style={{ width: "100%", marginTop: 6, marginBottom: 12 }}
                    />
                </label>

                {error && (
                    <div style={{ marginBottom: 12 }}>
                        <strong style={{ color: "crimson" }}>{error}</strong>
                    </div>
                )}

                <button type="submit" style={{ width: "100%" }}>
                    Sign in
                </button>
            </form>
        </div>
    )
}