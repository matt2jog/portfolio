import LogRocket from "logrocket";

type MaybeUser = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
} | null | undefined;

let initialized = false;
let lastRoute = "";
let lastIdentity = "";

function getAnonymousId() {
  if (typeof window === "undefined") return "";

  const key = "__lr_anon_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const generated = `anon_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

export function initLogRocket() {
  if (initialized || typeof window === "undefined") return;

  LogRocket.init("ltznbv/portfolio");
  LogRocket.getSessionURL((url) => {
    (window as any).__logrocketSessionURL = url;
  });

  initialized = true;
}

export function identifyLogRocketUser(user: MaybeUser) {
  if (typeof window === "undefined") return;
  initLogRocket();

  if (user?.id) {
    const identity = `user:${user.id}`;
    if (identity === lastIdentity) return;

    const traits: Record<string, string | number | boolean> = {};
    if (user.email) traits.email = user.email;
    if (user.name) traits.name = user.name;
    if (user.role) traits.role = user.role;

    LogRocket.identify(user.id, traits);
    lastIdentity = identity;
    return;
  }

  const anonId = getAnonymousId();
  const identity = `anon:${anonId}`;
  if (identity === lastIdentity) return;

  LogRocket.identify(identity, {
    role: "guest",
  });
  lastIdentity = identity;
}

export function trackLogRocketRoute(path: string) {
  if (typeof window === "undefined") return;
  initLogRocket();

  if (!path || path === lastRoute) return;
  lastRoute = path;

  LogRocket.track("route_change", {
    path,
    at: new Date().toISOString(),
  });
}
