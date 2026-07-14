import { describe, expect, it, vi } from "vitest";
import { proxyRequest } from "../src/proxy";

const env: Env = {
  ORIGIN_URL: "https://portfolio--prod-hqojlnvxwa-uk.a.run.app",
  ORIGIN_ACCESS_TOKEN: `edge-${"x".repeat(35)}`,
};

describe("portfolio-edge", () => {
  it("serves an edge-owned health response", async () => {
    const response = await proxyRequest(
      new Request("https://2jog.dev/__edge/health"),
      env,
      vi.fn(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-2jog-edge")).toBe("portfolio-edge");
    await expect(response.json()).resolves.toEqual({ ok: true, worker: "portfolio-edge" });
  });

  it("streams the request to the configured origin while preserving path and query", async () => {
    const fetcher = vi.fn(async (upstream: Request) => {
      expect(upstream.url).toBe("https://portfolio--prod-hqojlnvxwa-uk.a.run.app/api/projects?limit=3");
      expect(upstream.method).toBe("POST");
      expect(upstream.headers.get("x-forwarded-host")).toBe("www.2jog.dev");
      expect(upstream.headers.get("x-2jog-origin-token")).toBe(env.ORIGIN_ACCESS_TOKEN);
      expect(upstream.headers.get("x-2jog-client-ip")).toBe("203.0.113.9");
      expect(upstream.headers.get("x-2jog-client-country")).toBe("US");
      expect(upstream.headers.get("x-client-ip")).toBeNull();
      expect(upstream.headers.get("x-forwarded-for")).toBeNull();
      expect(upstream.headers.get("x-real-ip")).toBeNull();
      expect(upstream.headers.get("forwarded")).toBeNull();
      expect(await upstream.text()).toBe("payload");
      return new Response("origin-response", { status: 201, headers: { "cache-control": "no-store" } });
    });

    const request = new Request("https://www.2jog.dev/api/projects?limit=3", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.9",
          "forwarded": "for=192.0.2.1",
          "x-client-ip": "192.0.2.2",
          "x-forwarded-for": "192.0.2.3",
          "x-real-ip": "192.0.2.4",
          "x-2jog-client-country": "CA",
          "x-2jog-client-ip": "198.51.100.20",
          "x-2jog-origin-token": "attacker-controlled",
        },
        body: "payload",
      });
    Object.defineProperty(request, "cf", { value: { country: "US" } });

    const response = await proxyRequest(
      request,
      env,
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-2jog-edge")).toBe("portfolio-edge");
    await expect(response.text()).resolves.toBe("origin-response");
  });

  it("rejects unknown hosts and fails closed when the origin is unavailable", async () => {
    const forbidden = await proxyRequest(
      new Request("https://attacker.example/"),
      env,
      vi.fn(),
    );
    expect(forbidden.status).toBe(421);

    const unavailable = await proxyRequest(
      new Request("https://2jog.dev/"),
      env,
      vi.fn(async () => {
        throw new TypeError("network failure");
      }),
    );
    expect(unavailable.status).toBe(502);
    expect(unavailable.headers.get("x-2jog-edge")).toBe("portfolio-edge");
  });

  it("validates Admin identity at the edge before protected requests reach the origin", async () => {
    const fetcher = vi.fn(async () => new Response("protected"));
    const verifier = vi.fn(async () => ({ role: "admin" as const }));

    const missing = await proxyRequest(
      new Request("https://2jog.dev/api/admin/projects"),
      env,
      fetcher,
      verifier,
    );
    expect(missing.status).toBe(401);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).not.toHaveBeenCalled();
    expect(verifier).not.toHaveBeenCalled();

    const login = await proxyRequest(
      new Request("https://2jog.dev/admin"),
      env,
      fetcher,
      verifier,
    );
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toContain("https://admin.2jog.dev/auth/google");

    const allowed = await proxyRequest(
      new Request("https://2jog.dev/api/admin/projects", {
        headers: { cookie: "__Secure-2jog-admin=signed-admin-token" },
      }),
      env,
      fetcher,
      verifier,
    );
    expect(allowed.status).toBe(200);
    expect(verifier).toHaveBeenCalledWith("signed-admin-token");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
