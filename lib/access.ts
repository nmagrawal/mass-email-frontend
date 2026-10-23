/*
 * Role-based access, shared by proxy.ts (enforcement) and the AppBar (which
 * tabs to show). No server-only imports here.
 *
 * Admins: Clerk user with publicMetadata.role === "admin" → every page/API.
 * Everyone else (signed in): the volunteer pages below + the APIs they call.
 */

export const ADMIN_ROLE = "admin";

export const VOLUNTEER_HOME = "/volunteer-texting";

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

/* Reachable without signing in. */
export const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/__clerk"];

/* "/a" matches "/a" and "/a/…", but not "/ab". */
export function matchesPath(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAdminMetadata(metadata: unknown) {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as { role?: unknown }).role === ADMIN_ROLE
  );
}

export function canAccess(pathname: string, isAdmin: boolean) {
  if (isAdmin || matchesPath(pathname, PUBLIC_PATHS)) {
    return true;
  }

  return matchesPath(pathname, [...VOLUNTEER_PAGES, ...VOLUNTEER_APIS]);
}
