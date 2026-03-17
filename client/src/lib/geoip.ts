/**
 * GeoIP detection for regional compliance
 */

export interface GeoIPResponse {
  ip: string;
  country_code?: string;
  country?: string;
}

let cachedGeoIP: GeoIPResponse | null = null;

/**
 * Fetch user's GeoIP information
 */
export async function fetchGeoIP(): Promise<GeoIPResponse | null> {
  if (cachedGeoIP) return cachedGeoIP;

  try {
    const res = await fetch("/api/public/geoip", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as GeoIPResponse;
    cachedGeoIP = data;
    return data;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("Failed to fetch GeoIP:", err);
    }
    return null;
  }
}

/**
 * Get jurisdiction code (best effort)
 */
export async function detectJurisdiction(): Promise<string | null> {
  const geoip = await fetchGeoIP();
  return geoip?.country_code || null;
}
