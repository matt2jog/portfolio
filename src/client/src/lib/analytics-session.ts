import { isTrackingAllowed } from "./consent";

const SESSION_TRACKER_KEY = "__portfolio_session_id";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/** Returns a consent-gated identifier that expires with the current browser tab. */
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
