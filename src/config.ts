const configured = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");

export const apiBaseUrl = import.meta.env.DEV ? "http://127.0.0.1:8787" : configured ?? "";
export const wsBaseUrl = apiBaseUrl.replace(/^http/, "ws");
