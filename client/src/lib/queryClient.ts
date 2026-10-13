import { QueryClient } from "@tanstack/react-query";
import { auth } from "./firebase";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Raw fetch with the Firebase ID token attached. Throws ApiError on non-2xx. */
export async function apiFetch(method: string, url: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = await authHeaders();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    let code: string | undefined;
    try {
      const data = await res.json();
      message = data.error || message;
      code = data.code;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(message, res.status, code);
  }
  return res;
}

export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(method, url, body);
  return res.json() as Promise<T>;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => api("GET", queryKey.join("/")),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: { retry: false },
  },
});
