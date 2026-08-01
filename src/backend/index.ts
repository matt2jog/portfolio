import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { isSameOriginMutation } from "./auth0Web";
import { dynamicResponseCachePolicy } from "./cache-policy";
import {
  createCanonicalHostMiddleware,
  discardVisitorNetworkHeaders,
} from "./ingress-policy";
import {
  createChatRateLimitMiddleware,
  requestContextMiddleware,
  structuredRequestLogMiddleware,
} from "./request-observability";
import { portfolioHealth, resolveReleaseSha } from "./release-provenance";

const app = express();
const httpServer = createServer(app);
const isProd = process.env.NODE_ENV === "production";
const health = portfolioHealth(resolveReleaseSha());

app.use(requestContextMiddleware);
app.use(structuredRequestLogMiddleware);
app.use(discardVisitorNetworkHeaders);

app.use((_req, res, next) => {
  res.set({
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  next();
});

app.use(dynamicResponseCachePolicy);

app.get("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(health);
});
app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(health);
});

if (isProd || Boolean(process.env.K_SERVICE)) {
  app.use(createCanonicalHostMiddleware(
    process.env.PUBLIC_BASE_URL || "https://2jog.dev",
  ));
}
app.use(createChatRateLimitMiddleware());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
setupAuth(app);
app.use((req, res, next) => {
  if (
    req.user
    && !isSameOriginMutation(
      req,
      process.env.PUBLIC_BASE_URL || (isProd ? "https://2jog.dev" : "http://localhost:3000"),
    )
  ) {
    return res.status(403).json({ error: "cross_site_request_rejected" });
  }
  return next();
});
export function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

(async () => {
  await registerRoutes(httpServer, app);

  app.use(["/api", "/auth"], (_req, res) => {
    res.locals.failureCode = "route_not_found";
    res.status(404).json({ error: "route_not_found" });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const isServerError = status >= 500;
    const code = typeof err === "object" && err !== null && "code" in err
      ? boundedFailureCode(err.code)
      : "request_failed";
    res.locals.failureCode = code;
    console.error(JSON.stringify({
      event: "portfolio.request.error",
      request_id: req.requestId,
      correlation_id: req.correlationId,
      status,
      code,
    }));

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({
      message: isServerError
        ? "Internal Server Error"
        : (typeof err?.message === "string" ? err.message : "Request failed"),
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "3000", 10);
  
  // reusePort is not supported on Windows, so use simple listen for development
  if (process.platform === "win32") {
    httpServer.listen(port, () => {
      log("portfolio.service_started", { port });
    });
  } else {
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log("portfolio.service_started", { port });
      },
    );
  }
})();

function boundedFailureCode(value: unknown): string {
  const candidate = String(value ?? "");
  return /^[A-Za-z0-9._:-]{1,80}$/.test(candidate) ? candidate : "request_failed";
}
