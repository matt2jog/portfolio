import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getClientIp } from "./tracking";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (res.status === 401) {
      try {
        const loginUrl = (JSON.parse(text) as { login_url?: unknown }).login_url;
        if (typeof loginUrl === "string") {
          const parsed = new URL(loginUrl);
          const safeScheme = parsed.protocol === "https:" || (parsed.protocol === "http:" && parsed.hostname === "localhost");
          if (safeScheme && parsed.pathname === "/auth/google" && parsed.searchParams.has("returnTo")) {
            window.location.assign(parsed.toString());
            throw new Error("Redirecting to sign in");
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === "Redirecting to sign in") throw error;
      }
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

async function buildHeaders(base: Record<string, string> = {}): Promise<Record<string, string>> {
  const ip = await getClientIp();
  return ip ? { ...base, "X-Client-IP": ip } : base;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseHeaders: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  const headers = await buildHeaders(baseHeaders);

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
