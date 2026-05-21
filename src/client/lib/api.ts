import type { RequestError } from "./types";

export async function request<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    const error = new Error(json.code || "REQUEST_FAILED") as RequestError;
    error.payload = json;
    error.status = response.status;
    throw error;
  }
  return json;
}
