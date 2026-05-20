export const WELCOME_SLUG_MAX_LENGTH = 63;

// slug must be lowercase alphanumeric with single hyphens between segments, no leading/trailing hyphens
const SLUG_RE = /^[a-z0-9](-?[a-z0-9])*$/;

export function isValidWelcomeSlug(slug: unknown): slug is string {
  if (typeof slug !== "string") return false;
  if (slug.length < 1 || slug.length > WELCOME_SLUG_MAX_LENGTH) return false;
  return SLUG_RE.test(slug);
}
