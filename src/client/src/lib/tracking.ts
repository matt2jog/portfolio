import { isTrackingAllowed } from "./consent";

const SESSION_TRACKER_KEY = "__portfolio_session_id";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Returns an analytics identifier scoped to this browser tab. The durable
 * consent cookie is HttpOnly and is never exposed to client JavaScript.
 */
export function getTrackerUuid(): string | null {
  if (typeof window === "undefined" || !isTrackingAllowed()) return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_TRACKER_KEY);
    if (existing) return existing;
    const sessionId = createSessionId();
    window.sessionStorage.setItem(SESSION_TRACKER_KEY, sessionId);
    return sessionId;
  } catch {
    return null;
  }
}

export async function initBrowserTracking(): Promise<void> {
  if (!isTrackingAllowed()) return;
  await fetch("/api/public/tracking/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: "{}",
  }).then(() => undefined).catch(() => undefined);
}

export async function storeTrEn(value: string): Promise<void> {
  if (!isTrackingAllowed()) return;
  await fetch("/api/public/tracking/tr-en", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ trEn: value }),
  }).then(() => undefined).catch(() => undefined);
}
