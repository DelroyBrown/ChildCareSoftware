import { http } from "./http";

export async function getResidentTimeline(residentId) {
    const res = await http.get(`/api/residents/${residentId}/timeline/`);
    return res.data;
}

export async function searchResidents(query) {
    if (!query) return [];
    const res = await http.get("/api/residents/lookup/", {
        params: { q: query },
    });
    return res.data;
}