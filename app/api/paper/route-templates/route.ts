import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  cleanString,
  paperCollections,
  parseRouteTemplateFields,
  recordAudit,
  auditUser,
  requireUser,
  serializeRouteTemplate,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

// GET /api/paper/route-templates?cityId=&includeArchived=true
export async function GET(req: NextRequest) {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    const cityId = cleanString(params.get("cityId"), 100);
    if (!cityId) {
      return NextResponse.json({ error: "cityId is required" }, { status: 400 });
    }

    const { routeTemplates } = await paperCollections();
    const docs = await routeTemplates
      .find({
        city_id: cityId,
        ...(params.get("includeArchived") === "true" ? {} : { status: "active" }),
      })
      .sort({ status: 1, name: 1 })
      .toArray();

    return NextResponse.json({ routes: docs.map(serializeRouteTemplate) });
  } catch (err: any) {
    console.error("Route templates list error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load routes" }, { status: 500 });
  }
}

/*
 * POST /api/paper/route-templates
 *   { cityId, name, stops, start, finish, optimize, defaultStopMinutes, lastSummary? }
 *   or { duplicateOf: id, name? }
 */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const user = me && auditUser(me);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { routeTemplates, cities } = await paperCollections();
    const now = new Date();

    if (body.duplicateOf) {
      const sourceId = cleanString(body.duplicateOf, 50);
      if (!ObjectId.isValid(sourceId)) {
        return NextResponse.json({ error: "Invalid route id" }, { status: 400 });
      }
      const source = await routeTemplates.findOne({ _id: new ObjectId(sourceId) });
      if (!source) {
        return NextResponse.json({ error: "Route not found" }, { status: 404 });
      }

      const { _id, ...rest } = source;
      const copy = {
        ...rest,
        name: cleanString(body.name, 120) || `${source.name} (copy)`,
        status: "active" as const,
        created_by: user,
        created_at: now,
        updated_by: user,
        updated_at: now,
      };
      const result = await routeTemplates.insertOne(copy);
      await recordAudit({
        entity: "route_template",
        entity_id: String(result.insertedId),
        action: "duplicated",
        changes: { source: { from: null, to: sourceId } },
        by: user,
      });
      return NextResponse.json({ route: serializeRouteTemplate({ ...copy, _id: result.insertedId }) });
    }

    const cityId = cleanString(body.cityId, 100);
    const city = await cities.findOne({ _id: cityId });
    if (!city) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    const fields = await parseRouteTemplateFields(body, false, city.depot);
    if (typeof fields === "string") {
      return NextResponse.json({ error: fields }, { status: 400 });
    }

    const doc = {
      city_id: cityId,
      status: "active" as const,
      ...(fields as any),
      created_by: user,
      created_at: now,
      updated_by: user,
      updated_at: now,
    };

    const result = await routeTemplates.insertOne(doc);
    await recordAudit({
      entity: "route_template",
      entity_id: String(result.insertedId),
      action: "created",
      by: user,
    });

    return NextResponse.json({ route: serializeRouteTemplate({ ...doc, _id: result.insertedId }) });
  } catch (err: any) {
    console.error("Route template create error:", err);
    return NextResponse.json({ error: err?.message || "Failed to save route" }, { status: 500 });
  }
}
