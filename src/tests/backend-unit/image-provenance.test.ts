import assert from "node:assert/strict";
import test from "node:test";
import { assertPortfolioImageProvenance } from "../../scripts/release/image-provenance";

const sha = "a".repeat(40);
const uri = `us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@sha256:${"b".repeat(64)}`;
const inspection = [{
  RepoDigests: [uri],
  Config: {
    Labels: {
      "org.opencontainers.image.title": "portfolio",
      "org.opencontainers.image.source": "https://github.com/matt2jog/portfolio",
      "org.opencontainers.image.revision": sha,
    },
  },
}];

test("image provenance binds the service-owned digest to the current release SHA", () => {
  assert.doesNotThrow(() => assertPortfolioImageProvenance(inspection, uri, sha));
  assert.throws(
    () => assertPortfolioImageProvenance(inspection, uri, "c".repeat(40)),
    /current Portfolio release SHA/i,
  );
  assert.throws(
    () => assertPortfolioImageProvenance(inspection, uri.replace("/portfolio/portfolio@", "/other/portfolio@"), sha),
    /service-owned digest repository/i,
  );
});

test("image provenance rejects a digest alias or foreign source label", () => {
  const wrongDigest = structuredClone(inspection);
  wrongDigest[0].RepoDigests = [`us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@sha256:${"0".repeat(64)}`];
  assert.throws(() => assertPortfolioImageProvenance(wrongDigest, uri, sha), /exact accepted/i);

  const wrongSource = structuredClone(inspection);
  wrongSource[0].Config.Labels["org.opencontainers.image.source"] = "https://github.com/fork/portfolio";
  assert.throws(() => assertPortfolioImageProvenance(wrongSource, uri, sha), /provenance/i);
});
