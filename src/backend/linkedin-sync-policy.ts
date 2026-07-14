export function isLinkedinSyncEnabled(value: string | undefined = process.env.LINKEDIN_SYNC_ENABLED): boolean {
  return value === "1";
}
