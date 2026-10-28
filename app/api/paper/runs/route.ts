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
  type DeliveryRunDocument,
  type RunStopSnapshot,
  type StopDeliveryDocument,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * POST /api/paper/runs
 * { editionId, routeTemplateId, name?, driverId?, confirmDuplicates? }
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
    const templateId = cleanString(body.routeTemplateId, 50);

    if (!ObjectId.isValid(editionId) || !ObjectId.isValid(templateId)) {
      return NextResponse.json({ error: "Choose an edition and a saved route" }, { status: 400 });
    }

    const { editions, routeTemplates, locations, runs, stopDeliveries } = await paperCollections();

    const [edition, template] = await Promise.all([
      editions.findOne({ _id: new ObjectId(editionId) }),
      routeTemplates.findOne({ _id: new ObjectId(templateId) }),
    ]);

    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    if (!template) return NextResponse.json({ error: "Saved route not found" }, { status: 404 });
    if (edition.status === "closed") {
      return NextResponse.json({ error: "This edition is closed" }, { status: 409 });
    }
    if (template.city_id !== edition.city_id) {
      return NextResponse.json({ error: "Route and edition are in different cities" }, { status: 400 });
    }

    const locDocs = await locations
      .find({ _id: { $in: template.stops.filter((s) => ObjectId.isValid(s.location_id)).map((s) => new ObjectId(s.location_id)) } })
      .toArray();
    const locById = new Map(locDocs.map((l) => [String(l._id), l]));

    const excluded: { locationId: string; label: string; reason: string }[] = [];
    const stops: RunStopSnapshot[] = [];

    for (const s of template.stops) {
      const loc = locById.get(s.location_id);
      if (!loc) {
        excluded.push({ locationId: s.location_id, label: "Unknown location", reason: "No longer in the directory" });
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
        stop_minutes: s.stop_minutes ?? template.default_stop_minutes,
      });
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
    const finish = template.finish.return_to_start ? template.start : template.finish.point ?? template.start;

    const run: DeliveryRunDocument = {
      edition_id: editionId,
      city_id: edition.city_id,
      route_template_id: templateId,
      name: cleanString(body.name, 120) || template.name,
      status: driver ? "assigned" : "planned",
      driver,
      snapshot: { start: template.start, finish, stops, taken_at: now },
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
        route_template: { from: null, to: templateId },
        ...(driver ? { driver: { from: null, to: driver.name } } : {}),
      },
      by: user,
    });

    return NextResponse.json({ run: serializeRun({ ...run, _id: result.insertedId }), excluded, duplicates });
  } catch (err: any) {
    console.error("Run create error:", err);
    return NextResponse.json({ error: err?.message || "Failed to create run" }, { status: 500 });
  }
}
