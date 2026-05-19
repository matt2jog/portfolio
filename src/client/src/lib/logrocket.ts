import LogRocket from "logrocket";
import { isTrackingAllowed } from "./consent";
import { getTrackerUuid, getClientIp } from "./tracking";

type MaybeUser = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
} | null | undefined;

let initialized = false;
let lastRoute = "";
let lastIdentity = "";
let currentLogRocketUserId = "";
let ipAttached = false;
let uuidEmitted = false;

const SENSITIVE_ROUTE_PREFIXES = ["/admin", "/auth/google/callback"];

declare global {
  interface Window {
    __LOGROCKET_TEST_MODE?: boolean;
    __LOGROCKET_TEST_EVENTS?: Array<{
      event: string;
      payload?: Record<string, unknown>;
    }>;
  }
}

function recordLogRocketTestEvent(event: string, payload?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.__LOGROCKET_TEST_MODE) return;
  window.__LOGROCKET_TEST_EVENTS ??= [];
  window.__LOGROCKET_TEST_EVENTS.push({ event, payload });
}

export function initLogRocket() {
  if (initialized || typeof window === "undefined") return;

  if (!isTrackingAllowed()) {
    recordLogRocketTestEvent("blocked", { reason: "consent" });
    return;
  }

  if (window.__LOGROCKET_TEST_MODE) {
    recordLogRocketTestEvent("init");
    initialized = true;
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
  if (!isTrackingAllowed()) return;

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
    emitLogRocketUuidEvent();
    return;
  }

  const uuid = getTrackerUuid();
  const anonId = uuid ?? `anon_${Date.now().toString(36)}`;
  const identity = `anon:${anonId}`;
  if (identity === lastIdentity) return;

  LogRocket.identify(identity, { role: "guest" });
  lastIdentity = identity;
  currentLogRocketUserId = identity;
  emitLogRocketUuidEvent();
}

export function emitLogRocketUuidEvent() {
  if (typeof window === "undefined") return;
  if (!isTrackingAllowed()) return;
  if (uuidEmitted) return;

  const uuid = getTrackerUuid();
  if (!uuid) return;

  uuidEmitted = true;

  if (window.__LOGROCKET_TEST_MODE) {
    recordLogRocketTestEvent("user_uuid", { uuid });
    return;
  }

  if (initialized) {
    LogRocket.track("user_uuid", { uuid });
  }
}

export function trackLogRocketRoute(path: string) {
  if (typeof window === "undefined") return;
  if (!isTrackingAllowed()) return;

  initLogRocket();

  if (!path) return;
  if (SENSITIVE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
  if (path === lastRoute) return;

  lastRoute = path;

  if (window.__LOGROCKET_TEST_MODE) {
    recordLogRocketTestEvent("route_change", { path });
    return;
  }

  LogRocket.track("route_change", {
    path,
    at: new Date().toISOString(),
  });
}

export async function attachLogRocketIp() {
  if (typeof window === "undefined" || ipAttached) return;
  if (!isTrackingAllowed()) return;

  initLogRocket();

  try {
    const ip = await getClientIp();
    if (!ip) return;

    ipAttached = true;
    (window as any).__logrocketClientIp = ip;

    if (window.__LOGROCKET_TEST_MODE) {
      recordLogRocketTestEvent("client_ip", { ip });
      return;
    }

    if (currentLogRocketUserId) {
      LogRocket.identify(currentLogRocketUserId, { ip_address: ip });
    }
    LogRocket.track("client_ip", { ip, at: new Date().toISOString() });
  } catch {
    // telemetry is non-critical
  }
}
