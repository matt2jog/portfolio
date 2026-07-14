import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("all third-party workflow actions are pinned and legacy delivery identities are absent", () => {
  const workflowDir = path.join(root, ".github", "workflows");
  const workflows = readdirSync(workflowDir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => read(path.join(".github", "workflows", file)))
    .join("\n");

  const actionRefs = [...workflows.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  for (const ref of actionRefs) {
    if (ref.startsWith("./")) continue;
    assert.match(ref, /@[0-9a-f]{40}$/, `action is not pinned to a full commit SHA: ${ref}`);
  }

  assert.doesNotMatch(workflows, /pull_request_target/);
  assert.doesNotMatch(workflows, /cloud-run-source-deploy/);
  assert.doesNotMatch(workflows, /github-actions-provider/);
  assert.doesNotMatch(workflows, /github-deployer@/);
  assert.doesNotMatch(workflows, /601853536613-compute@/);
  assert.doesNotMatch(workflows, /gcloud\s+builds\s+submit/i);
  assert.doesNotMatch(workflows, /versions\s+(?:list|access)\s+latest/i);
  assert.doesNotMatch(workflows, /versions\s+access\s+latest/i);
});

test("production startup has no direct Infisical client or token fallback", () => {
  const packageJson = read("package.json");
  const bootstrap = read("src/backend/bootstrap.ts");

  assert.doesNotMatch(packageJson, /@infisical\/sdk/);
  assert.equal(existsSync(path.join(root, "src", "backend", "infisical.ts")), false);
  assert.match(bootstrap, /loadRuntimeEnvironment/);
  assert.doesNotMatch(bootstrap, /infisical|INFISICAL_/i);
});

test("production startup never warms a paid LinkedIn provider", () => {
  const entrypoint = read("src/backend/index.ts");

  assert.doesNotMatch(entrypoint, /warmLinkedinActivityCache/);
});

test("production sources contain no fabricated content or schema-push shortcut", () => {
  const about = read("src/client/src/pages/About.tsx");
  const admin = read("src/client/src/pages/Admin.tsx");
  const github = read("src/backend/github.ts");
  const portfolio = read("src/client/src/pages/Portfolio.tsx");
  const routes = read("src/backend/routes.ts");
  const businessCard = read("src/client/src/components/BusinessCard.tsx");
  const businessCard3d = read("src/client/src/components/BusinessCard3D.tsx");
  const footer = read("src/client/src/components/Footer.tsx");
  const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
  const localEnvironment = read(".env.example");

  assert.doesNotMatch(about, /mockExperiences|Tech Corp|Design Studio|Startup Inc/);
  assert.doesNotMatch(admin, /isLocalProductionPreview|window\.location\.hostname/);
  assert.doesNotMatch(github, /mock-event-2024-test/);
  assert.doesNotMatch(portfolio, /Lorem Ipsum|Lorem ipsum|example\.com/);
  assert.doesNotMatch(routes, /matthew@2jog\.dev|Matthew Tujague|7326393889|\(732\) 639-3889|example\.com/);
  for (const source of [businessCard, businessCard3d, footer]) {
    assert.doesNotMatch(
      source,
      /info\?\.[\s\S]{0,100}\|\|\s*["'](?:Matthew Tujague|Software Engineer|NJ-NY-PA|matthew@2jog\.dev|https:\/\/2jog\.dev|https:\/\/github\.com\/binimal101|\(732\) 639-3889|7326393889)/,
    );
  }
  assert.match(routes, /buildPublicPersonalInformationResponse\(row\)/);
  assert.match(routes, /buildChatOwnerContext\(personalInfo\)/);
  assert.doesNotMatch(routes, /project\/portfolio owner is Matthew Tujague|ownerName = personalInfo\?\./);
  assert.equal(existsSync(path.join(root, ".claude", "settings.local.json")), false);
  assert.equal(existsSync(path.join(root, "src", "scripts", "seed-experiences.ts")), false);
  assert.equal(existsSync(path.join(root, "src", "scripts", "seed-personal-info.ts")), false);
  assert.equal(existsSync(path.join(root, "src", "scripts", "init-personal-info.ts")), false);
  const schema = read("src/shared/schema.ts");
  const migration = read("src/migrations/0012_remove_personal_information_defaults.sql");
  assert.doesNotMatch(schema, /personalInformation[\s\S]+\.default\("(?:Matthew Tujague|Software Engineer|NJ-NY-PA|matthew@2jog\.dev|\+17326393889|\(732\) 639-3889)"\)/);
  for (const column of ["name", "title", "location", "short_bio", "email", "phone", "phone_formatted", "linkedin_url", "github_url", "devpost_url", "portfolio_url"]) {
    assert.match(migration, new RegExp(`ALTER COLUMN \\"?${column}\\"? DROP DEFAULT`, "i"));
  }
  assert.equal(packageJson.scripts?.["db:push"], undefined);
  assert.doesNotMatch(
    localEnvironment,
    /ALLOWED_ADMIN_(?:EMAIL|SUB)|APIFY_TOKEN|KAFKA_SASL_PASSWORD|LEGAL_AUDIT_WRITE_ROLE_PASSWORD/,
  );
});

test("production mutation helpers are gated to Portfolio main GitHub Actions", () => {
  const guard = read("src/scripts/production-execution-guard.ts");
  assert.match(guard, /NODE_ENV/);
  assert.match(guard, /GITHUB_ACTIONS/);
  assert.match(guard, /matt2jog\/portfolio/);
  assert.match(guard, /refs\/heads\/main/);

  for (const relativePath of [
    "src/scripts/embed_skills.ts",
    "src/scripts/cluster_anchors.ts",
    "src/scripts/update_skill_groups.ts",
    "src/scripts/migrate.ts",
    "src/scripts/legal/record-versions.ts",
    "src/scripts/legal/record-versions-from-bundle.ts",
    "src/scripts/release/run-migrations-from-bundle.ts",
    "src/scripts/release/run-deployment-command.ts",
    "src/scripts/release/cloudflare-routes.ts",
    "drizzle.config.ts",
  ]) {
    assert.match(read(relativePath), /assertProductionMutationAllowed/);
  }

  for (const relativePath of [
    ".github/scripts/deploy-cloud-run.sh",
    ".github/scripts/deploy-portfolio-edge.sh",
  ]) {
    assert.match(read(relativePath), /GITHUB_REPOSITORY.*matt2jog\/portfolio/);
    assert.match(read(relativePath), /GITHUB_REF.*refs\/heads\/main/);
  }
});

test("the repository carries the typed Portfolio secret contract", () => {
  const schema = JSON.parse(read("config/secret-schema.prod.json")) as {
    bundles: { runtime: { fields: Record<string, unknown> }; deployment: { fields: Record<string, unknown> } };
  };

  assert.ok(schema.bundles.runtime.fields.EDGE_ORIGIN_TOKEN);
  assert.ok(schema.bundles.runtime.fields.EDGE_ORIGIN_PREVIOUS_TOKEN);
  assert.ok(schema.bundles.deployment.fields.EDGE_ORIGIN_TOKEN);
  assert.ok(schema.bundles.deployment.fields.EDGE_ORIGIN_PREVIOUS_TOKEN);
  assert.ok(schema.bundles.runtime.fields.SUPABASE_CA_CERT);
  assert.ok(schema.bundles.deployment.fields.SUPABASE_CA_CERT);
  for (const forbidden of [
    "APIFY_TOKEN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "KAFKA_BOOTSTRAP_SERVERS",
    "KAFKA_CA_CERT",
    "KAFKA_SASL_PASSWORD",
    "KAFKA_SASL_USERNAME",
  ]) {
    assert.equal(schema.bundles.runtime.fields[forbidden], undefined, forbidden);
  }
});

test("production container is reproducible, unprivileged, and excludes local build state", () => {
  const dockerfile = read("Dockerfile");
  const dockerignore = read(".dockerignore");
  const migrationRunner = read("src/scripts/release/run-migrations-from-bundle.ts");

  assert.match(dockerfile, /^FROM node:22-bookworm-slim@sha256:[0-9a-f]{64} AS build/m);
  assert.match(
    dockerfile,
    /^FROM gcr\.io\/distroless\/nodejs22-debian13:nonroot@sha256:[0-9a-f]{64} AS runtime/m,
  );
  assert.match(dockerfile, /^USER nonroot$/m);
  assert.match(dockerfile, /^CMD \["dist\/index\.cjs"\]$/m);
  assert.doesNotMatch(migrationRunner, /"node", "dist\/migrate\.cjs"/);
  for (const ignored of [".git", ".env", "coverage", "dist", "node_modules", "test-results"]) {
    assert.match(dockerignore, new RegExp(`^${ignored.replace(".", "\\.")}$`, "m"));
  }
});

test("fork-safe pull request CI exercises coverage, integration, UI, build, and the exact image", () => {
  const workflow = read(".github/workflows/ci.yml");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /contents:\s*read/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.match(workflow, /npm run test:coverage/);
  assert.match(workflow, /npm run test:backend-integration/);
  assert.match(workflow, /npm run test:ui/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /docker build[^\n]+portfolio-ci:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /image-ref:\s*portfolio-ci:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /scanners:\s*['"]?secret/);
  assert.match(workflow, /severity:\s*['"]?CRITICAL/);
});

test("main delivery uses repository-bound WIF, a dedicated registry, digest pinning, and causal rollback", () => {
  const workflow = read(".github/workflows/deploy.yml");
  const release = read(".github/scripts/deploy-cloud-run.sh");

  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /personal-brand-github\/providers\/portfolio-main/);
  assert.match(workflow, /portfolio-deploy@personal-brand-501801\.iam\.gserviceaccount\.com/);
  assert.match(workflow, /us-east4-docker\.pkg\.dev\/personal-brand-501801\/portfolio\/portfolio/);
  assert.match(workflow, /IMAGE_URI:\s*\$\{\{ env\.IMAGE_REPOSITORY \}\}:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /docker push/);
  assert.match(workflow, /@\$\{IMAGE_DIGEST\}/);
  assert.match(workflow, /run-migrations-from-bundle\.ts/);
  assert.match(workflow, /run-deployment-command\.ts[^\n]+deploy-cloud-run\.sh/);
  assert.match(workflow, /steps\.image\.outputs\.uri/);
  assert.ok(workflow.indexOf("Trivy") < workflow.indexOf("docker push"), "the image must be scanned before push");
  assert.match(workflow, /RUNTIME_BUNDLE_VERSION:\s*\$\{\{ vars\.PORTFOLIO_RUNTIME_BUNDLE_VERSION \}\}/);
  assert.match(workflow, /DEPLOYMENT_BUNDLE_VERSION:\s*\$\{\{ vars\.PORTFOLIO_DEPLOYMENT_BUNDLE_VERSION \}\}/);
  assert.match(workflow, /secrets versions describe "\$RUNTIME_BUNDLE_VERSION"/);
  assert.match(workflow, /secrets versions access "\$DEPLOYMENT_BUNDLE_VERSION"/);
  assert.doesNotMatch(workflow, /secrets versions list/);
  assert.doesNotMatch(workflow, /secrets versions access latest/);
  assert.ok(
    workflow.indexOf("Validate exact secret bundle versions") < workflow.indexOf("Build immutable merge-SHA image"),
    "bundle versions must be pinned and validated before the production image is built",
  );

  assert.match(release, /--no-traffic/);
  assert.match(release, /candidate_tag="candidate-/);
  assert.match(release, /--tag="\$\{candidate_tag\}"/);
  assert.match(release, /https:\/\/2jog\.dev/);
  assert.match(release, /status\.url/);
  assert.match(release, /--to-revisions/);
  assert.match(release, /OBSERVATION_SECONDS:-600/);
  assert.match(release, /current_revision.*candidate_revision/s);
  assert.match(release, /rollback_url/s);
  assert.match(release, /imageDigest.*IMAGE_DIGEST/s);
  assert.match(release, /gcloud beta run services update "\$SERVICE_NAME"/);
  assert.match(release, /--min=0/);
  assert.match(release, /--max=1/);
  assert.match(release, /--cpu-throttling/);
  assert.match(release, /GCP_PROJECT_NUMBER/);
  assert.match(
    release,
    /--allow-unauthenticated/,
    "Cloudflare reaches the application-level origin-token gate without a Google IAM token",
  );
  assert.match(release, /X-2jog-Origin-Token/);
  assert.match(release, /EDGE_ORIGIN_PREVIOUS_TOKEN/);
  assert.match(release, /smoke_raw_denial/);
  const releaseMain = release.slice(release.indexOf('initial_service_json='));
  assert.ok(
    releaseMain.indexOf('--to-revisions "${candidate_revision}=100"')
      < releaseMain.indexOf('deploy-portfolio-edge.sh deploy'),
    "the candidate must accept the prior edge credential before the Worker rotates to the new credential",
  );
  assert.match(release, /rollback_coordinated_release/);
  const coordinatedRollback = release.slice(
    release.indexOf("rollback_coordinated_release()"),
    release.indexOf("initial_service_json="),
  );
  assert.ok(
    coordinatedRollback.indexOf("restore_previous_edge") < coordinatedRollback.indexOf("rollback_if_causal"),
    "rollback must restore the previous Worker while the candidate still accepts its credential",
  );
  assert.match(
    release,
    /current_revision.*previous_revision[\s\S]+Production origin still runs the previous revision/,
    "an edge-only cutover must remain recoverable when Cloud Run promotion never completed",
  );
  assert.doesNotMatch(release, /rollback_coordinated_release\s*\|\|\s*true/);
  assert.doesNotMatch(release, /deploy-portfolio-edge\.sh rollback\s*\|\|\s*true/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /portfolio-edge-rollback-state\.json/);
});

test("coordinated delivery proves origin compatibility and raw-alias denial before edge promotion", () => {
  const release = read(".github/scripts/deploy-cloud-run.sh");
  const candidateTagFunction = release.slice(
    release.indexOf("smoke_candidate_tag()"),
    release.indexOf("smoke_candidate()"),
  );
  const candidateTagCall = release.indexOf("\nsmoke_candidate_tag\n");
  const originPromotion = release.indexOf('--to-revisions "${candidate_revision}=100"');
  const edgePromotion = release.indexOf("deploy-portfolio-edge.sh deploy");

  assert.match(
    candidateTagFunction,
    /smoke_previous_origin_url "\$candidate_url"/,
    "a candidate with a previous credential must be tested before it can receive traffic",
  );
  assert.ok(candidateTagCall > 0 && candidateTagCall < originPromotion);
  assert.ok(originPromotion < edgePromotion, "origin promotion must precede edge promotion");

  const postOriginPreflight = release.slice(originPromotion, edgePromotion);
  assert.match(
    postOriginPreflight,
    /smoke_candidate/,
    "raw aliases must be checked while the candidate is live and before the edge rotates",
  );
  assert.match(
    release,
    /for url in "\$\{raw_service_urls\[@\]\}"; do[\s\S]+smoke_raw_denial "\$url"/,
    "every raw Cloud Run alias must have an unauthenticated denial check",
  );
});

test("edge delivery fails closed after snapshotting when Cloudflare state introspection is unavailable", () => {
  const edgeRelease = read(".github/scripts/deploy-portfolio-edge.sh");
  const snapshotIndex = edgeRelease.indexOf('ROUTE_TOOL" snapshot');
  const stateIndex = edgeRelease.indexOf("route_snapshot: $route_snapshot[0]");
  const priorVersionIndex = edgeRelease.indexOf('prior_version="$(worker_version)"');

  assert.ok(snapshotIndex >= 0, "the route snapshot must be taken");
  assert.ok(stateIndex > snapshotIndex, "the snapshot must be persisted into rollback state");
  assert.ok(priorVersionIndex > stateIndex, "prior-version introspection must happen after the snapshot is durable");
  assert.doesNotMatch(edgeRelease, /\|\| true/, "Cloudflare introspection errors must not be converted into empty state");
  assert.match(
    edgeRelease,
    /prior_version=.*worker_version.*prior_version_status[\s\S]+prior_version_status.*!= 0[\s\S]+restore_after_failed_deploy/,
  );
  assert.match(
    edgeRelease,
    /10007/,
    "the first split must distinguish an absent portfolio-edge Worker from an introspection failure",
  );
  assert.match(
    edgeRelease,
    /prior_version=""[\s\S]+prior_routes_owned_by_worker=false/,
    "the first split must preserve the legacy route snapshot without inventing a prior target version",
  );
  assert.match(
    edgeRelease,
    /wrangler deploy[\s\S]+failed_deploy_version=.*worker_version[\s\S]+candidate_version.*failed_deploy_version[\s\S]+restore_after_failed_deploy/,
    "a partially successful Wrangler deploy must record the observed version before restoring routes",
  );
  assert.match(edgeRelease, /route_ownership=.*jq -e/);
});

test("Portfolio owns a tested, observable Cloudflare front door", () => {
  const packageJson = read("infra/cloudflare/portfolio-edge/package.json");
  const wrangler = read("infra/cloudflare/portfolio-edge/wrangler.jsonc");
  const worker = read("infra/cloudflare/portfolio-edge/src/index.ts");
  const edgeAuth = read("infra/cloudflare/portfolio-edge/src/auth.ts");
  const edgeProxy = read("infra/cloudflare/portfolio-edge/src/proxy.ts");
  const workflow = read(".github/workflows/deploy.yml");
  const edgeRelease = read(".github/scripts/deploy-portfolio-edge.sh");
  const backend = read("src/backend/index.ts");

  assert.match(packageJson, /"test"\s*:/);
  assert.match(packageJson, /"check"\s*:/);
  assert.match(packageJson, /@cloudflare\/vitest-pool-workers/);
  assert.match(wrangler, /"name"\s*:\s*"portfolio-edge"/);
  assert.match(wrangler, /"compatibility_date"\s*:\s*"2026-07-13"/);
  assert.match(wrangler, /"observability"\s*:/);
  assert.match(wrangler, /"required"\s*:\s*\["ORIGIN_ACCESS_TOKEN"\]/);
  assert.match(wrangler, /2jog\.dev\/\*/);
  assert.match(wrangler, /www\.2jog\.dev\/\*/);
  assert.match(worker, /fetch\(request/);
  assert.match(edgeAuth, /algorithms:\s*\["RS256"\]/);
  assert.match(edgeAuth, /__Secure-2jog-admin/);
  assert.match(edgeAuth, /payload\.exp - payload\.iat !== 900/);
  assert.match(edgeProxy, /requiresAdminIdentity/);
  assert.match(workflow, /portfolio-edge/);
  assert.match(edgeRelease, /wrangler deploy/);
  assert.match(edgeRelease, /wrangler rollback/);
  assert.match(edgeRelease, /ROUTE_TOOL" snapshot/);
  assert.match(edgeRelease, /ROUTE_TOOL" restore/);
  assert.match(edgeRelease, /--secrets-file/);
  assert.doesNotMatch(edgeRelease, /restore_from_state\s*\|\|\s*true/);
  assert.match(edgeRelease, /Portfolio edge restoration failed; manual intervention is required/);
  assert.match(backend, /createOriginAccessMiddleware/);
  assert.ok(
    backend.indexOf("createOriginAccessMiddleware") < backend.indexOf("express.json"),
    "origin access must run before body parsing and application routes",
  );
});

test("all origin IP consumers reject legacy forwarding headers", () => {
  const routes = read("src/backend/routes.ts");
  const tracking = read("src/backend/tracking.ts");
  const edge = read("infra/cloudflare/portfolio-edge/src/proxy.ts");

  assert.doesNotMatch(routes, /x-forwarded-for|x-client-ip/i);
  assert.doesNotMatch(tracking, /x-forwarded-for|x-client-ip/i);
  for (const header of ["forwarded", "x-client-ip", "x-forwarded-for", "x-real-ip"]) {
    assert.match(edge, new RegExp(`headers\\.delete\\(\\"${header}\\"\\)`));
  }
});

test("legal audit delivery verifies TLS and keeps its history view under invoker security", () => {
  const workflow = read(".github/workflows/legal-audit.yml");
  const recorder = read("src/scripts/legal/record-versions.ts");
  const recorderLoader = read("src/scripts/legal/record-versions-from-bundle.ts");
  const migrationRunner = read("src/scripts/release/run-migrations-from-bundle.ts");
  const postgresTls = read("src/shared/postgres-tls.ts");
  const migration = read("src/migrations/0010_legal_document_view_security.sql");

  assert.match(workflow, /providers\/portfolio-legal-audit-main/);
  assert.match(workflow, /portfolio-legal-audit@personal-brand-501801\.iam\.gserviceaccount\.com/);
  assert.match(workflow, /portfolio-legal-audit-bundle-prod/);
  assert.match(workflow, /PORTFOLIO_LEGAL_AUDIT_BUNDLE_VERSION/);
  assert.doesNotMatch(workflow, /portfolio-deployment-bundle-prod/);
  assert.doesNotMatch(workflow, /portfolio-deploy@/);

  assert.doesNotMatch(recorder, /rejectUnauthorized:\s*false/);
  assert.match(recorder, /postgresConnectionConfig/);
  assert.match(postgresTls, /rejectUnauthorized:\s*true/);
  assert.doesNotMatch(postgresTls, /rejectUnauthorized:\s*false/);
  assert.match(recorderLoader, /SUPABASE_CA_CERT/);
  assert.match(migrationRunner, /SUPABASE_CA_CERT/);
  assert.match(migration, /security_invoker\s*=\s*true/i);
  assert.match(migration, /REVOKE ALL ON legal_document_active_ranges FROM PUBLIC/i);
});
