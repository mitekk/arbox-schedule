import { apiFetch } from "../client";
import type { BoxesResponse, BoxLocationsResponse } from "../types/boxes";

export function getBoxes(token: string): Promise<BoxesResponse> {
  return apiFetch<BoxesResponse>("/api/v2/boxes", token);
}

export function getBoxLocations(token: string): Promise<BoxLocationsResponse> {
  return apiFetch<BoxLocationsResponse>("/api/v2/boxes/locations", token);
}
