import { createClient, type Client, type InStatement } from "@libsql/client";

export interface TursoConnectionSettings {
  url: string;
  authToken?: string;
  local: boolean;
}

export function validateTursoConnection(input: {
  url: string;
  authToken?: string;
  remoteRequired?: boolean;
}): TursoConnectionSettings {
  const url = input.url.trim();
  const authToken = input.authToken?.trim() || undefined;
  const local = url === ":memory:" || url.startsWith("file:") || /^[A-Za-z]:[\\/]/.test(url);
  if (local) {
    if (input.remoteRequired) throw new Error("production Portfolio requires a remote Turso database");
    const localUrl = url === ":memory:"
      ? "file::memory:"
      : /^[A-Za-z]:[\\/]/.test(url)
        ? `file:///${url.replace(/\\/g, "/")}`
        : url;
    return { url: localUrl, authToken, local: true };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TURSO_DATABASE_URL must be a local file or Turso URL");
  }
  if (
    !["libsql:", "https:"].includes(parsed.protocol)
    || !parsed.hostname.endsWith(".turso.io")
    || parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new Error("TURSO_DATABASE_URL must be a credential-free Turso Cloud URL");
  }
  if (!authToken) throw new Error("TURSO_AUTH_TOKEN is required for Turso Cloud");
  return { url, authToken, local: false };
}

function statementSql(statement: InStatement): string {
  return typeof statement === "string" ? statement : statement.sql;
}

function withoutLiterals(sql: string): string {
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .trim();
}

export function assertPortfolioRuntimeStatement(sql: string): void {
  const inspected = withoutLiterals(sql);
  if (!inspected || /;\s*\S/.test(inspected)) {
    throw new Error("Portfolio runtime accepts exactly one SQL statement");
  }
  if (/^(?:SELECT|EXPLAIN)\b/i.test(inspected)) return;
  if (
    /^WITH\b/i.test(inspected)
    && !/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|ATTACH|DETACH|PRAGMA|VACUUM)\b/i.test(inspected)
  ) return;
  if (
    /^INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+["`\[]?github_timeline_events["`\]]?\b/i.test(inspected)
    && !/\bDO\s+UPDATE\b/i.test(inspected)
  ) {
    return;
  }
  throw new Error("Portfolio runtime may only read career data or append GitHub activity");
}

export function createPortfolioClient(input: {
  url: string;
  authToken?: string;
  runtimeGuard?: boolean;
}): Client {
  const settings = validateTursoConnection({ url: input.url, authToken: input.authToken });
  const client = createClient({ url: settings.url, authToken: settings.authToken });
  if (!input.runtimeGuard) return client;

  return new Proxy(client, {
    get(target, property) {
      if (property === "execute") {
        return async (statement: InStatement) => {
          assertPortfolioRuntimeStatement(statementSql(statement));
          return await target.execute(statement);
        };
      }
      if (property === "batch" || property === "transaction" || property === "executeMultiple") {
        return () => {
          throw new Error("Portfolio runtime does not expose bulk or transaction write primitives");
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
