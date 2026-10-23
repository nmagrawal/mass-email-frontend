import { clerkClient, clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  PUBLIC_PATHS,
  VOLUNTEER_HOME,
  canAccess,
  isAdminMetadata,
  matchesPath,
} from "@/lib/access";

/*
 * Role lookup. Fast path: the session token carries public metadata when the
 * Clerk session token is customized with {"metadata": "{{user.public_metadata}}"}.
 * Fallback: fetch the user from Clerk, cached briefly per user so page loads
 * and their API calls don't each hit the Clerk API.
 */
const ROLE_CACHE_TTL_MS = 60_000;
const roleCache = new Map<string, { isAdmin: boolean; at: number }>();

async function isAdminUser(
  userId: string,
  sessionClaims: Record<string, unknown> | null | undefined,
) {
  const claimMetadata = sessionClaims?.metadata;

  if (claimMetadata && typeof claimMetadata === "object") {
    return isAdminMetadata(claimMetadata);
  }

  const cached = roleCache.get(userId);

  if (cached && Date.now() - cached.at < ROLE_CACHE_TTL_MS) {
    return cached.isAdmin;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = isAdminMetadata(user.publicMetadata);

  roleCache.set(userId, { isAdmin, at: Date.now() });

  if (roleCache.size > 1000) {
    roleCache.delete(roleCache.keys().next().value!);
  }

  return isAdmin;
}

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  if (matchesPath(pathname, PUBLIC_PATHS)) {
    return;
  }

  await auth.protect();

  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return;
  }

  const isAdmin = await isAdminUser(userId, sessionClaims);

  if (canAccess(pathname, isAdmin)) {
    return;
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/trpc/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.redirect(new URL(VOLUNTEER_HOME, req.url));
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
