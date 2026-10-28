import { NextResponse } from "next/server";

import { canDispatch, listAssignableUsers, requireUser } from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * GET /api/paper/drivers → Clerk users who can be assigned runs
 * (publicMetadata.role = driver, dispatcher or admin). Cached briefly.
 */
let cache: { at: number; users: Awaited<ReturnType<typeof listAssignableUsers>> } | null = null;
const TTL_MS = 60_000;

export async function GET() {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }

    if (!cache || Date.now() - cache.at > TTL_MS) {
      cache = { at: Date.now(), users: await listAssignableUsers() };
    }

    return NextResponse.json({ drivers: cache.users });
  } catch (err: any) {
    console.error("Drivers list error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load drivers" }, { status: 500 });
  }
}
