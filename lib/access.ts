/*
 * Role-based access, shared by proxy.ts (enforcement) and the AppBar (which
 * tabs to show). No server-only imports here.
 *
 * Role = Clerk publicMetadata.role:
 *   "admin"      → every page/API
 *   "dispatcher" → volunteer pages + paper distribution (planning, editions,
 *                  runs, reports) + driver screen
 *   "driver"     → volunteer pages + driver screen (own runs only — enforced
 *                  again inside the run APIs)
 *   anything else (signed in) → volunteer pages
 */

export const ADMIN_ROLE = "admin";

export type Role = "admin" | "dispatcher" | "driver" | "volunteer";

export const VOLUNTEER_HOME = "/volunteer-texting";
export const DRIVER_HOME = "/driver";

export const VOLUNTEER_PAGES = [
  "/volunteer-texting",
  "/nearest-voters",
  "/explore-voters",
];

/* APIs used by the volunteer pages. Keep in sync when those pages change. */
export const VOLUNTEER_APIS = [
  // /volunteer-texting
  "/api/outreach",
  // /nearest-voters
  "/api/nearest-voters",
  "/api/geocode-address",
  "/api/walking-route",
  // /explore-voters
  "/api/map-voters",
  "/api/address-voters",
  "/api/voter-interactions",
];

/* Driver screen + the APIs it calls. */
export const DRIVER_PAGES = ["/driver"];
export const DRIVER_APIS = ["/api/paper/my-runs", "/api/paper/runs"];

/* Dispatcher: the whole paper distribution area. */
export const DISPATCHER_PAGES = ["/paper-distribution", ...DRIVER_PAGES];
export const DISPATCHER_APIS = ["/api/paper"];

/* Reachable without signing in. */
export const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/__clerk"];

/* "/a" matches "/a" and "/a/…", but not "/ab". */
export function matchesPath(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getRole(metadata: unknown): Role {
  const role =
    typeof metadata === "object" && metadata !== null
      ? (metadata as { role?: unknown }).role
      : undefined;
  return role === "admin" || role === "dispatcher" || role === "driver" ? role : "volunteer";
}

export function isAdminMetadata(metadata: unknown) {
  return getRole(metadata) === "admin";
}

const ALLOWED: Record<Exclude<Role, "admin">, string[]> = {
  volunteer: [...VOLUNTEER_PAGES, ...VOLUNTEER_APIS],
  driver: [...VOLUNTEER_PAGES, ...VOLUNTEER_APIS, ...DRIVER_PAGES, ...DRIVER_APIS],
  dispatcher: [...VOLUNTEER_PAGES, ...VOLUNTEER_APIS, ...DISPATCHER_PAGES, ...DISPATCHER_APIS],
};

export function canAccess(pathname: string, role: Role) {
  if (role === "admin" || matchesPath(pathname, PUBLIC_PATHS)) {
    return true;
  }
  return matchesPath(pathname, ALLOWED[role]);
}

/* Where to send someone who opened a page they can't use. */
export function homeFor(role: Role) {
  return role === "driver" ? DRIVER_HOME : VOLUNTEER_HOME;
}
