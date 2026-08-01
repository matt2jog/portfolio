const FULL_GIT_SHA = /^[0-9a-f]{40}$/;

export function resolveReleaseSha(
  value = process.env.PORTFOLIO_RELEASE_SHA,
): string | null {
  const releaseSha = value?.trim();
  if (!releaseSha) {
    return null;
  }
  if (!FULL_GIT_SHA.test(releaseSha)) {
    throw new Error("PORTFOLIO_RELEASE_SHA must be a full lowercase Git SHA");
  }
  return releaseSha;
}

export function portfolioHealth(releaseSha = resolveReleaseSha()) {
  return { ok: true, service: "portfolio", release_sha: releaseSha } as const;
}
