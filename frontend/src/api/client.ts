import axios, { AxiosError } from "axios";

const TOKEN_KEY = "plateletiq_token";

/**
 * Where the API lives, in order of precedence:
 *
 *   1. VITE_API_BASE_URL, baked in at build time — use this in production.
 *   2. The host that served this page, port 8000. This is what makes LAN
 *      testing work: open the UI at http://192.168.1.42:5173 and it talks to
 *      the API on that same machine, without a separate build per laptop.
 */
function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";
  const port = import.meta.env.VITE_API_PORT || "8000";
  return `http://${host}:${port}/api/v1`;
}

export const API_BASE_URL = resolveBaseUrl();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private browsing — the in-memory session still works for this tab */
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Fires when the server rejects our token, so the app can return to sign-in. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/**
 * An API failure carrying the server's own explanation.
 *
 * The previous build swallowed failures and substituted placeholder data, so a
 * broken backend looked like a working one. Nothing here invents a fallback:
 * callers get a real error and screens say what went wrong.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly detail: string;

  constructor(message: string, status: number | null, detail: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function describe(error: AxiosError): ApiError {
  if (error.response) {
    const body = error.response.data as { detail?: unknown } | undefined;
    let detail = "";

    if (typeof body?.detail === "string") {
      detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
      // FastAPI validation errors arrive as a list of field problems.
      detail = body.detail
        .map((item: { loc?: unknown[]; msg?: string }) =>
          `${(item.loc ?? []).slice(1).join(".")}: ${item.msg ?? ""}`.trim()
        )
        .join("; ");
    } else {
      detail = error.response.statusText || "The server rejected this request.";
    }

    return new ApiError(detail, error.response.status, detail);
  }

  if (error.code === "ECONNABORTED") {
    return new ApiError("The server took too long to respond.", null, "Request timed out.");
  }

  return new ApiError(
    `Cannot reach the API at ${API_BASE_URL}.`,
    null,
    "Check that the backend is running and that this machine can reach it.",
  );
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearStoredToken();
      onUnauthorized?.();
    }
    return Promise.reject(describe(error));
  },
);
