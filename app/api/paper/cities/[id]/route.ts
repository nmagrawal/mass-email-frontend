import { NextRequest, NextResponse } from "next/server";

import {
  paperCollections,
  recordAudit,
  auditUser,
  requireUser,
  resolveRoutePoint,
  serializeCity,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

// PATCH /api/paper/cities/:id { depot: RoutePoint | null } — default route start
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const user = me && auditUser(me);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    let depot = null;
    if (body.depot) {
      depot = await resolveRoutePoint({ ...body.depot, type: "depot" });
      if (!depot) {
        return NextResponse.json({ error: "Invalid depot" }, { status: 400 });
      }
    }

    const { cities } = await paperCollections();
    const before = await cities.findOne({ _id: id });
    if (!before) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    const updated = await cities.findOneAndUpdate(
      { _id: id },
      { $set: { depot, updated_by: user, updated_at: new Date() } },
      { returnDocument: "after" },
    );

    await recordAudit({
      entity: "city",
      entity_id: id,
      action: "depot_changed",
      changes: { depot: { from: before.depot?.label ?? null, to: depot?.label ?? null } },
      by: user,
    });

    return NextResponse.json({ city: serializeCity(updated!) });
  } catch (err: any) {
    console.error("Paper city update error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update city" }, { status: 500 });
  }
}
