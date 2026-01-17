import { http } from "./http";

export async function getResidentTimeline(residentId) {
    const res = await http.get(`/api/residents/${residentId}/timeline/`);
    return res.data;
}