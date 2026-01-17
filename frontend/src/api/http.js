import axios from "axios";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

export const tokenStore = {
    getAccess: () => localStorage.getItem(ACCESS_KEY),
    getRefresh: () => localStorage.getItem(REFRESH_KEY),
    setTokens: (access, refresh) => {
        localStorage.setItem(ACCESS_KEY, access);
        if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    },
    clear: () => {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
    },
};

export const http = axios.create({
    baseURL: "/",
    headers: { "Content-Type": "application/json" },
});

// Attach token automatically
http.interceptors.request.use((config) => {
    const token = tokenStore.getAccess();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Refresh if 401
let isRefreshing = false;
let pending = [];

http.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;

        if (error.response?.status !== 401 || original?._retry) {
            throw error;
        }

        original._retry = true;

        const refresh = tokenStore.getRefresh();
        if (!refresh) {
            tokenStore.clear();
            throw error;
        }

        if (isRefreshing) {
            return new Promise((resolve) => {
                pending.push((newToken) => {
                    original.headers.Authorization = `Bearer ${newToken}`;
                    resolve(http(original));
                });
            });
        }

        isRefreshing = true;

        try {
            const r = await axios.post("/api/auth/token/refresh/", { refresh });
            const newAccess = r.data.access;

            tokenStore.setTokens(newAccess);

            pending.forEach((cb) => cb(newAccess));
            pending = [];

            original.headers.Authorization = `Bearer ${newAccess}`;
            return http(original);
        } finally {
            isRefreshing = false;
        }
    }
);