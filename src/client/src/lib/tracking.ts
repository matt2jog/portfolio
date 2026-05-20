import { isTrackingAllowed, getStoredConsent } from "./consent";

export const TRACKER_COOKIE_NAME = "tr_uuid";

export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Returns the tracker UUID only when consent has been given.
 * localStorage is checked first as a hard break condition.
 */
export function getTrackerUuid(): string | null {
  const consent = getStoredConsent();
  if (!consent) return null;
  if (!isTrackingAllowed()) return null;
  return getCookieValue(TRACKER_COOKIE_NAME);
}

let _ipCache: string | null = null;
let _ipPromise: Promise<string | null> | null = null;

export async function getClientIp(): Promise<string | null> {
  if (_ipCache !== null) return _ipCache;
  if (_ipPromise) return _ipPromise;

  _ipPromise = fetch("/api/public/ip", { credentials: "include" })
    .then((r) => r.json())
    .then((d) => {
      _ipCache = typeof d?.ip === "string" ? d.ip : null;
      return _ipCache;
    })
    .catch(() => null);

  return _ipPromise;
}

/**
 * Notify the backend that this UUID has consented. Stores the UUID+IP
 * association in browser_tracking / browser_tracking_ips.
 * No-ops if tracking is not allowed.
 */
export async function initBrowserTracking(): Promise<void> {
  if (!isTrackingAllowed()) return;

  const uuid = getCookieValue(TRACKER_COOKIE_NAME);
  if (!uuid) return;

  const ip = await getClientIp();

  fetch("/api/public/tracking/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ip ? { "X-Client-IP": ip } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ ip }),
  }).catch(() => {});
}

/**
 * Store the tr_en query-param value in browser_tracking for consented users.
 */
export async function storeTrEn(value: string): Promise<void> {
  if (!isTrackingAllowed()) return;

  const uuid = getCookieValue(TRACKER_COOKIE_NAME);
  if (!uuid) return;

  fetch("/api/public/tracking/tr-en", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ trEn: value }),
  }).catch(() => {});
}
