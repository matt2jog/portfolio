/**
 * Consent management utilities for GDPR/PIPEDA compliance
 */

export type ConsentChoice = "accept_all" | "reject_all" | "custom";
export type ConsentCategory = "essential" | "analytics";

export interface ConsentRecord {
  timestamp: string;
  jurisdiction_detected: string | null;
  policy_version: string;
  categories_accepted: ConsentCategory[];
  user_action: ConsentChoice;
}

const CONSENT_STORAGE_KEY = "__consent_record";
const CONSENT_EXPIRY_MS = 12 * 30 * 24 * 60 * 60 * 1000; // 12 months

/**
 * Strict-consent jurisdictions that require opt-in before tracking
 */
const STRICT_JURISDICTIONS = ["DE", "FR", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "GB", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH", "NO", "IS", "CA"];

export function isGlobalOptOutEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const nav = window.navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };

  const dntSignals = [
    nav.doNotTrack,
    (window as Window & { doNotTrack?: string }).doNotTrack,
    nav.msDoNotTrack,
  ];
  const dntEnabled = dntSignals.some((signal) => signal === "1" || signal === "yes");

  return dntEnabled || nav.globalPrivacyControl === true;
}

/**
 * Get stored consent record from localStorage
 */
export function getStoredConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return null;
    const record = JSON.parse(stored) as ConsentRecord;
    // Check if expired
    const age = Date.now() - new Date(record.timestamp).getTime();
    if (age > CONSENT_EXPIRY_MS) {
      return null; // Expired
    }
    return record;
  } catch {
    return null;
  }
}

/**
 * Store consent choice to localStorage
 */
export function storeConsent(record: ConsentRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch (e) {
  }
}

/**
 * Clear consent record (called on policy version bump)
 */
export function clearConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch (e) {
  }
}

/**
 * Check if tracking is allowed based on stored consent
 */
export function isTrackingAllowed(): boolean {
  if (isGlobalOptOutEnabled()) {
    return false;
  }

  const consent = getStoredConsent();
  if (!consent) {
    return false;
  }
  
  // If in strict jurisdiction and not explicitly accepted, no tracking
  if (consent.jurisdiction_detected && STRICT_JURISDICTIONS.includes(consent.jurisdiction_detected)) {
    if (consent.user_action === "reject_all") {
      return false;
    }
    if (consent.user_action === "accept_all") {
      return true;
    }
    if (consent.user_action === "custom") {
      const allowed = consent.categories_accepted.includes("analytics");
      return allowed;
    }
    return false;
  }
  
  // In non-strict regions, default to true unless explicitly rejected
  if (consent.user_action === "reject_all") {
    return false;
  }
  return true;
}

/**
 * Check if consent banner should be shown
 */
export function shouldShowConsentBanner(): boolean {
  const consent = getStoredConsent();
  return !consent;
}

/**
 * Get categories to accept based on choice
 */
export function getCategoriesForChoice(choice: ConsentChoice): ConsentCategory[] {
  switch (choice) {
    case "accept_all":
      return ["essential", "analytics"];
    case "reject_all":
      return ["essential"]; // Only essential, never tracking
    case "custom":
      return []; // Will be set by user via Manage Preferences
    default:
      return ["essential"];
  }
}
