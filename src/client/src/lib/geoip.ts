/**
 * Explicit location-privacy hint for the consent UX.
 */

export interface GeoIPResponse {
  country_code: null;
  status: "unknown";
}

let cachedGeoIP: GeoIPResponse | null = null;

/**
 * Confirm that the application does not infer visitor location.
 */
export async function fetchGeoIP(): Promise<GeoIPResponse | null> {
  if (cachedGeoIP) return cachedGeoIP;

  try {
    const res = await fetch("/api/public/geoip", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<GeoIPResponse>;
    if (data.status !== "unknown" || data.country_code !== null) return null;
    cachedGeoIP = { country_code: null, status: "unknown" };
    return cachedGeoIP;
  } catch {
    if (import.meta.env?.DEV) {
      console.warn("GeoIP lookup unavailable");
    }
    return null;
  }
}

/**
 * The application deliberately has no authoritative jurisdiction code.
 */
export async function detectJurisdiction(): Promise<string | null> {
  const geoip = await fetchGeoIP();
  return geoip?.country_code ?? null;
}
