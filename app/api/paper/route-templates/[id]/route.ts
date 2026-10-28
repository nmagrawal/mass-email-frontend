import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  diffFields,
  paperCollections,
  parseRouteTemplateFields,
  recordAudit,
  requireUser,
  serializeRouteTemplate,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * PATCH /api/paper/route-templates/:id
 * { name?, stops?, start?, finish?, optimize?, defaultStopMinutes?, lastSummary?,
 *   status?: "active" | "archived" }
 * Edits affect future use only; delivery runs (later stage) keep snapshots.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid route id" }, { status: 400 });
    }

    const body = await req.json();
    const { routeTemplates, cities } = await paperCollections();
    const _id = new ObjectId(id);
    const before = await routeTemplates.findOne({ _id });
    if (!before) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    const city = await cities.findOne({ _id: before.city_id });
    const fields = await parseRouteTemplateFields(body, true, city?.depot ?? null);
    if (typeof fields === "string") {
      return NextResponse.json({ error: fields }, { status: 400 });
    }

    if (body.status === "active" || body.status === "archived") {
      fields.status = body.status;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await routeTemplates.findOneAndUpdate(
      { _id },
      { $set: { ...fields, updated_by: user, updated_at: new Date() } },
      { returnDocument: "after" },
    );

    const changes = diffFields(before as any, fields);
    delete changes.last_summary;
    if (Object.keys(changes).length) {
      await recordAudit({
        entity: "route_template",
        entity_id: id,
        action: "status" in changes ? (fields.status === "archived" ? "archived" : "restored") : "updated",
        changes,
        by: user,
      });
    }

    return NextResponse.json({ route: serializeRouteTemplate(updated!) });
  } catch (err: any) {
    console.error("Route template update error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update route" }, { status: 500 });
  }
}
