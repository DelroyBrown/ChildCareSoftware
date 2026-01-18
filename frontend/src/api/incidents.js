import { http } from "./http";

export async function patchIncident(id, payload) {
    return http.patch(`/api/incidents/${id}/`, payload);
}
