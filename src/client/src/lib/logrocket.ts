import LogRocket from "logrocket";
import { isTrackingAllowed } from "./consent";
import { getTrackerUuid } from "./analytics-session";

type MaybeUser = {
  id?: string;
  subject?: string;
  name?: string;
  role?: string;
} | null | undefined;

let initialized = false;
let lastRoute = "";
let lastIdentity = "";
let uuidEmitted = false;

const SENSITIVE_ROUTE_PREFIXES = ["/admin", "/auth/callback"];

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
    if (user.subject) traits.subject = user.subject;
    if (user.name) traits.name = user.name;
    if (user.role) traits.role = user.role;

    LogRocket.identify(user.id, traits);
    lastIdentity = identity;
    emitLogRocketUuidEvent();
    return;
  }

  const uuid = getTrackerUuid();
  const anonId = uuid ?? `anon_${Date.now().toString(36)}`;
  const identity = `anon:${anonId}`;
  if (identity === lastIdentity) return;

  LogRocket.identify(identity, { role: "guest" });
  lastIdentity = identity;
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
