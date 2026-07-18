import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { db } from "./data/db";
import { extractClientCountry, extractClientIp, isLocalIp, markEdgeOriginAuthenticated } from "./geoip";
import { uuidCookieMiddleware, requestLogMiddleware, ipRateLogMiddleware } from "./tracking";
import {
  CAREER_PUBSUB_PATH,
  createCareerPubSubHandler,
  createPostgresCareerEventStore,
} from "./consumers/career-pubsub";
import {
  createCareerPushIdentityMiddleware,
  validateCareerPushIdentityConfig,
} from "./consumers/career-pubsub-auth";
import { createOriginAccessMiddleware } from "./origin-access";
import {
  createDatabaseAuditContextMiddleware,
  createServiceDatabaseAuditContextMiddleware,
} from "./data/database-audit";

const app = express();
const httpServer = createServer(app);
const isProd = process.env.NODE_ENV === "production";

const careerPushAudience = process.env.CAREER_PUBSUB_PUSH_AUDIENCE;
const careerPushServiceAccount = process.env.CAREER_PUBSUB_PUSH_SERVICE_ACCOUNT;
const careerPushSubscription = process.env.CAREER_PUBSUB_SUBSCRIPTION;
const careerPushSettingCount = [
  careerPushAudience,
  careerPushServiceAccount,
  careerPushSubscription,
].filter(Boolean).length;

if (careerPushSettingCount > 0 && careerPushSettingCount < 3) {
  throw new Error("Career Pub/Sub runtime settings must be configured together");
}

if (careerPushAudience && careerPushServiceAccount && careerPushSubscription) {
  const identityConfig = validateCareerPushIdentityConfig({
    audience: careerPushAudience,
    serviceAccountEmail: careerPushServiceAccount,
  });
  app.post(
    CAREER_PUBSUB_PATH,
    createCareerPushIdentityMiddleware(identityConfig),
    express.json({ limit: "2mb", strict: true }),
    createServiceDatabaseAuditContextMiddleware(),
    createCareerPubSubHandler(
      createPostgresCareerEventStore(db),
      careerPushSubscription,
    ),
  );
} else if (isProd || Boolean(process.env.K_SERVICE)) {
  throw new Error(
    "CAREER_PUBSUB_PUSH_AUDIENCE, CAREER_PUBSUB_PUSH_SERVICE_ACCOUNT, and "
      + "CAREER_PUBSUB_SUBSCRIPTION are required in Cloud Run",
  );
} else {
  app.post(CAREER_PUBSUB_PATH, (_request, response) => {
    response.status(503).json({ error: "career_pubsub_not_configured" });
  });
}

if (isProd || Boolean(process.env.K_SERVICE)) {
  app.use(createOriginAccessMiddleware(
    process.env.EDGE_ORIGIN_TOKEN,
    process.env.EDGE_ORIGIN_PREVIOUS_TOKEN,
  ));
  app.use(markEdgeOriginAuthenticated);
}

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
app.use(uuidCookieMiddleware);
app.use(createDatabaseAuditContextMiddleware());
app.use(requestLogMiddleware);
app.use(ipRateLogMiddleware);

const enforceUsOnly = process.env.ENFORCE_US_ONLY !== "false";

if (enforceUsOnly) {
  app.use((req, res, next) => {
    // Exempt static files from geoblocking so asset bots (like LogRocket) can fetch styles
    if (
      req.path.startsWith("/assets/") || 
      req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)
    ) {
      return next();
    }

    const ip = extractClientIp(req);
    if (isLocalIp(ip)) {
      return next();
    }

    const countryCode = extractClientCountry(req);
    if (countryCode === "US") {
      return next();
    }

    return res.status(451).json({
      message: "This service is currently available only to users in the United States.",
      country_code: countryCode || null,
    });
  });
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (!isProd && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
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
      log(`serving on port ${port}`);
      log(`US-only mode: ${enforceUsOnly ? "ON" : "OFF"}`);
    });
  } else {
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
        log(`US-only mode: ${enforceUsOnly ? "ON" : "OFF"}`);
      },
    );
  }
})();
