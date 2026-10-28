import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  diffFields,
  paperCollections,
  parseLocationFields,
  recordAudit,
  auditUser,
  requireUser,
  serializeLocation,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * PATCH /api/paper/locations/:id  { label?, area?, defaultQuantity?, instructions?,
 *   contact?, availability?, status? }
 * "Removing" a location = status "inactive"; locations are never deleted so
 * saved routes and future delivery history keep their references.
 */
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
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid location id" }, { status: 400 });
    }

    const fields = parseLocationFields(await req.json(), true);
    if (typeof fields === "string") {
      return NextResponse.json({ error: fields }, { status: 400 });
    }
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { locations, routeTemplates } = await paperCollections();
    const _id = new ObjectId(id);
    const before = await locations.findOne({ _id });

    if (!before) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    const updated = await locations.findOneAndUpdate(
      { _id },
      { $set: { ...fields, updated_by: user, updated_at: new Date() } },
      { returnDocument: "after" },
    );

    const changes = diffFields(before as any, fields);
    if (Object.keys(changes).length) {
      await recordAudit({
        entity: "location",
        entity_id: id,
        action: "status" in changes ? `status_${fields.status}` : "updated",
        changes,
        by: user,
      });
    }

    // Tell the dispatcher which saved routes still include a deactivated stop.
    const usedIn =
      fields.status && fields.status !== "active"
        ? await routeTemplates
            .find({ "stops.location_id": id, status: "active" }, { projection: { name: 1 } })
            .toArray()
        : [];

    return NextResponse.json({
      location: serializeLocation(updated!),
      usedInRoutes: usedIn.map((r) => r.name),
    });
  } catch (err: any) {
    console.error("Paper location update error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update location" }, { status: 500 });
  }
}
