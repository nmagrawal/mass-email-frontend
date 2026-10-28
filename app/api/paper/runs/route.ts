import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  auditUser,
  canDispatch,
  cleanString,
  paperCollections,
  recordAudit,
  requireUser,
  resolveDriver,
  serializeRun,
  parseRouteTemplateFields,
  type DeliveryRunDocument,
  type RoutePoint,
  type RouteTemplateStop,
  type RunStopSnapshot,
  type StopDeliveryDocument,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * POST /api/paper/runs
 * From a saved route: { editionId, routeTemplateId, name?, driverId?, confirmDuplicates? }
 * Custom (planned in the UI): { editionId, stops: [{locationId, quantity, stopMinutes}] in
 *   final order, start, finish, optimize, firstLocationId?, lastLocationId?,
 *   defaultStopMinutes, lastSummary?, name?, driverId?, confirmDuplicates?,
 *   routeTemplateId? (the route it started from), saveAsRoute?: { name } }
 *
 * Creates a delivery run as a SNAPSHOT of the saved route: stops, order,
 * quantities and instructions are frozen, so later route edits don't change
 * this round. Paused/inactive locations are left out (and reported).
 * One pending stop_deliveries record is created per stop.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }
    const user = auditUser(me);

    const body = await req.json();
    const editionId = cleanString(body.editionId, 50);
    const custom = Array.isArray(body.stops);

    if (!ObjectId.isValid(editionId)) {
      return NextResponse.json({ error: "Choose an edition" }, { status: 400 });
    }

    const { editions, routeTemplates, locations, runs, stopDeliveries, cities } = await paperCollections();
    const edition = await editions.findOne({ _id: new ObjectId(editionId) });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    if (edition.status === "closed") {
      return NextResponse.json({ error: "This edition is closed" }, { status: 409 });
    }

    // Where the stops, order and endpoints come from.
    let source: {
      templateId: string | null;
      name: string;
      stops: RouteTemplateStop[];
      defaultMinutes: number;
      start: RoutePoint;
      finish: RoutePoint;
      optimize: boolean;
      firstId: string | null;
      lastId: string | null;
    };

    let customFields: any = null;

    if (custom) {
      // Custom run planned in the UI: stops already in the calculated order.
      const city = await cities.findOne({ _id: edition.city_id });
      const fields = await parseRouteTemplateFields(
        { ...body, name: cleanString(body.name, 120) || "Custom run" },
        false,
        city?.depot ?? null,
      );
      if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
      const f = fields as any;
      customFields = f;
      const refId = cleanString(body.routeTemplateId, 50);
      source = {
        templateId: ObjectId.isValid(refId) ? refId : null,
        name: f.name,
        stops: f.stops,
        defaultMinutes: f.default_stop_minutes,
        start: f.start,
        finish: f.finish.return_to_start ? f.start : f.finish.point,
        optimize: f.optimize,
        firstId: f.first_location_id,
        lastId: f.last_location_id,
      };
    } else {
      const templateId = cleanString(body.routeTemplateId, 50);
      if (!ObjectId.isValid(templateId)) {
        return NextResponse.json({ error: "Choose a saved route" }, { status: 400 });
      }
      const template = await routeTemplates.findOne({ _id: new ObjectId(templateId) });
      if (!template) return NextResponse.json({ error: "Saved route not found" }, { status: 404 });
      if (template.city_id !== edition.city_id) {
        return NextResponse.json({ error: "Route and edition are in different cities" }, { status: 400 });
      }
      source = {
        templateId,
        name: cleanString(body.name, 120) || template.name,
        stops: template.stops,
        defaultMinutes: template.default_stop_minutes,
        start: template.start,
        finish: template.finish.return_to_start ? template.start : template.finish.point ?? template.start,
        optimize: template.optimize,
        firstId: template.first_location_id ?? null,
        lastId: template.last_location_id ?? null,
      };
    }

    const locDocs = await locations
      .find({ _id: { $in: source.stops.filter((s) => ObjectId.isValid(s.location_id)).map((s) => new ObjectId(s.location_id)) } })
      .toArray();
    const locById = new Map(locDocs.map((l) => [String(l._id), l]));

    const excluded: { locationId: string; label: string; reason: string }[] = [];
    const stops: RunStopSnapshot[] = [];

    for (const s of source.stops) {
      const loc = locById.get(s.location_id);
      if (!loc || loc.city_id !== edition.city_id) {
        excluded.push({ locationId: s.location_id, label: loc?.label ?? "Unknown location", reason: loc ? "Belongs to another city" : "No longer in the directory" });
        continue;
      }
      if (loc.status !== "active") {
        excluded.push({ locationId: s.location_id, label: loc.label, reason: `Location is ${loc.status}` });
        continue;
      }
      stops.push({
        location_id: s.location_id,
        sequence: stops.length + 1,
        label: loc.label,
        address: loc.google.formatted_address,
        location: loc.location,
        instructions: loc.instructions,
        contact: loc.contact,
        planned_quantity: s.quantity ?? loc.default_quantity,
        stop_minutes: s.stop_minutes ?? source.defaultMinutes,
      });
    }

    // Stops picked by hand must all be deliverable — don't drop them silently.
    if (custom && excluded.length) {
      return NextResponse.json(
        { error: "Some selected stops can't be delivered", code: "unroutable", unroutable: excluded },
        { status: 422 },
      );
    }

    if (stops.length === 0) {
      return NextResponse.json({ error: "None of this route's stops are active", excluded }, { status: 400 });
    }

    // Same location already planned in another live run of this edition?
    const existingRuns = await runs
      .find({ edition_id: editionId, status: { $ne: "cancelled" } }, { projection: { name: 1, "snapshot.stops.location_id": 1 } })
      .toArray();
    const duplicates = stops.flatMap((s) => {
      const inRuns = existingRuns
        .filter((r) => r.snapshot.stops.some((x) => x.location_id === s.location_id))
        .map((r) => r.name);
      return inRuns.length ? [{ locationId: s.location_id, label: s.label, runs: inRuns }] : [];
    });

    if (duplicates.length && body.confirmDuplicates !== true) {
      return NextResponse.json(
        {
          error: `${duplicates.length} stop(s) are already planned in another run of this edition`,
          code: "duplicates",
          duplicates,
        },
        { status: 409 },
      );
    }

    let driver = null;
    if (body.driverId) {
      driver = await resolveDriver(cleanString(body.driverId, 100));
      if (!driver) return NextResponse.json({ error: "That user can't be assigned runs" }, { status: 400 });
    }

    const now = new Date();

    // Optionally keep this selection as a reusable saved route.
    let savedRoute: { id: string; name: string } | null = null;
    const saveName = custom ? cleanString(body.saveAsRoute?.name, 120) : "";
    if (custom && body.saveAsRoute && !saveName) {
      return NextResponse.json({ error: "Give the saved route a name" }, { status: 400 });
    }
    if (saveName) {
      const templateDoc = {
        city_id: edition.city_id,
        status: "active" as const,
        ...customFields,
        name: saveName,
        created_by: user,
        created_at: now,
        updated_by: user,
        updated_at: now,
      };
      const saved = await routeTemplates.insertOne(templateDoc);
      savedRoute = { id: String(saved.insertedId), name: saveName };
      source.templateId = savedRoute.id;
      await recordAudit({
        entity: "route_template",
        entity_id: savedRoute.id,
        action: "created",
        changes: { from_run_planning: { from: null, to: editionId } },
        by: user,
      });
    }

    const run: DeliveryRunDocument = {
      edition_id: editionId,
      city_id: edition.city_id,
      route_template_id: source.templateId,
      name: source.name,
      status: driver ? "assigned" : "planned",
      driver,
      snapshot: { start: source.start, finish: source.finish, stops, taken_at: now },
      loaded_copies: null,
      returned_copies: null,
      damaged_copies: null,
      started_at: null,
      completed_at: null,
      interrupted_reason: "",
      notes: "",
      created_by: user,
      created_at: now,
      updated_by: user,
      updated_at: now,
    };

    const result = await runs.insertOne(run);
    const runId = String(result.insertedId);

    const stopDocs: StopDeliveryDocument[] = stops.map((s) => ({
      run_id: runId,
      edition_id: editionId,
      city_id: edition.city_id,
      location_id: s.location_id,
      location_label: s.label,
      publish_date: edition.publish_date,
      sequence: s.sequence,
      planned_quantity: s.planned_quantity,
      status: "pending",
      delivered_quantity: null,
      picked_up_quantity: null,
      reason: "",
      notes: "",
      recorded_by: null,
      recorded_at: null,
      synced_at: null,
      client_update_id: null,
      corrections: [],
    }));
    await stopDeliveries.insertMany(stopDocs);

    await recordAudit({
      entity: "delivery_run",
      entity_id: runId,
      action: "created",
      changes: {
        route_template: { from: null, to: source.templateId },
        ...(custom ? { custom_stops: { from: null, to: stops.length } } : {}),
        ...(driver ? { driver: { from: null, to: driver.name } } : {}),
      },
      by: user,
    });

    return NextResponse.json({
      run: serializeRun({ ...run, _id: result.insertedId }),
      excluded,
      duplicates,
      savedRoute,
    });
  } catch (err: any) {
    console.error("Run create error:", err);
    return NextResponse.json({ error: err?.message || "Failed to create run" }, { status: 500 });
  }
}
