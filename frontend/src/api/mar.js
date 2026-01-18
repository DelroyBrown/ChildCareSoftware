import { http } from "./http";

export async function patchMAR(id, payload) {
    return http.patch(`/api/mar/${id}/`, payload);
}