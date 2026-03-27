import LogRocket from "logrocket";
import { isTrackingAllowed } from "./consent";

type MaybeUser = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
} | null | undefined;

let initialized = false;
let lastRoute = "";
let lastSearch = "";
let lastIdentity = "";
let currentLogRocketUserId = "";
let ipAttached = false;

const SENSITIVE_ROUTE_PREFIXES = ["/admin", "/auth/google/callback"];

function getAnonymousId() {
  if (typeof window === "undefined") return "";

  const key = "__lr_anon_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const generated = `anon_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

export function initLogRocket() {
  if (initialized || typeof window === "undefined") {
    return;
  }

  // Check consent before initializing LogRocket
  if (!isTrackingAllowed()) {
    return;
  }

  LogRocket.init("ltznbv/portfolio");
  
  console.log("interest logging started");
  
  LogRocket.getSessionURL((url) => {
    (window as any).__logrocketSessionURL = url;
  });

  initialized = true;
}

export function identifyLogRocketUser(user: MaybeUser) {
  if (typeof window === "undefined") return;
  
  // Skip if tracking not allowed
  if (!isTrackingAllowed()) {
    return;
  }
  
  initLogRocket();

  if (user?.id) {
    const identity = `user:${user.id}`;
    if (identity === lastIdentity) return;

    const traits: Record<string, string | number | boolean> = {};
    if (user.email) traits.email = user.email;
    if (user.name) traits.name = user.name;
    if (user.role) traits.role = user.role;

    LogRocket.identify(user.id, traits);
    lastIdentity = identity;
    currentLogRocketUserId = user.id;
    return;
  }

  const anonId = getAnonymousId();
  const identity = `anon:${anonId}`;
  if (identity === lastIdentity) return;

  LogRocket.identify(identity, {
    role: "guest",
  });
  lastIdentity = identity;
  currentLogRocketUserId = identity;
}

function parseQuery(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function trackLogRocketRoute(path: string, search = "") {
  if (typeof window === "undefined") return;

  // Skip if tracking not allowed
  if (!isTrackingAllowed()) {
    return;
  }

  initLogRocket();

  if (!path) return;
  if (SENSITIVE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return;
  }

  const normalizedSearch = search || "";

  if (path === lastRoute && normalizedSearch === lastSearch) return;
  lastRoute = path;
  lastSearch = normalizedSearch;

  const query = parseQuery(normalizedSearch);
  const hasQuery = Object.keys(query).length > 0;
  const queryJson = JSON.stringify(query);

  LogRocket.track("route_change", {
    path,
    query: queryJson,
    rawQuery: normalizedSearch,
    at: new Date().toISOString(),
  });

  if (hasQuery) {
    LogRocket.track("query_params", {
      endpoint: path,
      query: queryJson,
      rawQuery: normalizedSearch,
      at: new Date().toISOString(),
    });
  }
}

export async function attachLogRocketIp() {
  if (typeof window === "undefined" || ipAttached) return;

  // Skip if tracking not allowed
  if (!isTrackingAllowed()) {
    return;
  }

  initLogRocket();

  try {
    const res = await fetch("/api/public/ip", { credentials: "include" });
    if (!res.ok) return;

    const data = await res.json();
    const ip = typeof data?.ip === "string" ? data.ip : "";
    if (!ip) return;

    ipAttached = true;
    (window as any).__logrocketClientIp = ip;

    if (currentLogRocketUserId) {
      LogRocket.identify(currentLogRocketUserId, {
        ip_address: ip,
      });
    }

    LogRocket.track("client_ip", {
      ip,
      at: new Date().toISOString(),
    });
  } catch (_err) {
    // no-op for local/dev telemetry setup
  }
}
