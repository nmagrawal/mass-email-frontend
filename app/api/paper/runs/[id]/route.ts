import { NextRequest, NextResponse } from "next/server";

import {
  AUTO_SKIP_REASON,
  auditUser,
  canAccessRun,
  canDispatch,
  cleanCount,
  cleanString,
  loadRun,
  paperCollections,
  recordAudit,
  requireUser,
  resolveDriver,
  runTotals,
  serializeEdition,
  serializeRun,
  serializeStopDelivery,
  type DeliveryRunDocument,
  type RunStatus,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function runResponse(run: DeliveryRunDocument) {
  const { stopDeliveries, editions } = await paperCollections();
  const { ObjectId } = await import("mongodb");
  const [stops, edition] = await Promise.all([
    stopDeliveries.find({ run_id: String(run._id) }).sort({ sequence: 1 }).toArray(),
    editions.findOne({ _id: new ObjectId(run.edition_id) }),
  ]);
  return {
    run: serializeRun(run),
    stops: stops.map(serializeStopDelivery),
    totals: runTotals(run, stops),
    edition: edition ? serializeEdition(edition) : null,
  };
}

// GET /api/paper/runs/:id — driver (own run) or dispatcher
export async function GET(_req: NextRequest, { params }: Context) {
  try {
    const me = await requireUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const run = await loadRun(id);
    if (!run || !canAccessRun(me, run)) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(await runResponse(run));
  } catch (err: any) {
    console.error("Run detail error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load run" }, { status: 500 });
  }
}

const DISPATCH_ACTIONS = ["assign", "set_quantities", "remove_stop", "cancel", "rename", "notes"];
const DRIVER_ACTIONS = ["load", "start", "interrupt", "finish"];

/*
 * PATCH /api/paper/runs/:id { action, ... }
 *   dispatcher: assign {driverId|null} · set_quantities {quantities:[{locationId,quantity}]}
 *               remove_stop {locationId} · cancel · rename {name} · notes {notes}
 *   driver/dispatcher: load {loadedCopies} · start · interrupt {reason}
 *               finish {returnedCopies, damagedCopies, loadedCopies?, notes?}
 *
 * Every update is conditional on the current status, so two people acting at
 * once can't push a run into an impossible state.
 */
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const me = await requireUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = auditUser(me);

    const { id } = await params;
    const run = await loadRun(id);
    if (!run || !canAccessRun(me, run)) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const body = await req.json();
    const action = cleanString(body.action, 40);

    if (DISPATCH_ACTIONS.includes(action) && !canDispatch(me)) {
      return NextResponse.json({ error: "Only dispatchers can do that" }, { status: 403 });
    }
    if (!DISPATCH_ACTIONS.includes(action) && !DRIVER_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const { runs, stopDeliveries, editions } = await paperCollections();
    const now = new Date();
    const runId = String(run._id);

    const transition = async (from: RunStatus[], set: Record<string, unknown>, label: string) => {
      const updated = await runs.findOneAndUpdate(
        { _id: run._id, status: { $in: from } },
        { $set: { ...set, updated_by: user, updated_at: now } },
        { returnDocument: "after" },
      );
      if (!updated) {
        return NextResponse.json(
          { error: `Can't ${label} a run that is ${run.status.replace("_", " ")}`, ...(await runResponse(run)) },
          { status: 409 },
        );
      }
      return updated;
    };

    let updated: DeliveryRunDocument | NextResponse;
    let changes: Record<string, { from: unknown; to: unknown }> = {};

    switch (action) {
      case "assign": {
        const driver = body.driverId ? await resolveDriver(cleanString(body.driverId, 100)) : null;
        if (body.driverId && !driver) {
          return NextResponse.json({ error: "That user can't be assigned runs" }, { status: 400 });
        }
        const status: RunStatus =
          run.status === "planned" || run.status === "assigned" ? (driver ? "assigned" : "planned") : run.status;
        updated = await transition(["planned", "assigned", "in_progress", "interrupted"], { driver, status }, "reassign");
        changes = { driver: { from: run.driver?.name ?? null, to: driver?.name ?? null } };
        break;
      }

      case "set_quantities": {
        const quantities: { locationId: string; quantity: number }[] = [];
        for (const q of Array.isArray(body.quantities) ? body.quantities : []) {
          const n = cleanCount(q?.quantity, 10000);
          if (n === "invalid" || n === null) {
            return NextResponse.json({ error: "Quantities must be whole numbers" }, { status: 400 });
          }
          quantities.push({ locationId: cleanString(q.locationId, 50), quantity: n });
        }
        const byId = new Map(quantities.map((q) => [q.locationId, q.quantity]));
        const stops = run.snapshot.stops.map((s) =>
          byId.has(s.location_id) ? { ...s, planned_quantity: byId.get(s.location_id)! } : s,
        );
        updated = await transition(["planned", "assigned"], { "snapshot.stops": stops }, "change quantities on");
        if (!(updated instanceof NextResponse)) {
          await Promise.all(
            quantities.map((q) =>
              stopDeliveries.updateOne({ run_id: runId, location_id: q.locationId }, { $set: { planned_quantity: q.quantity } }),
            ),
          );
        }
        changes = Object.fromEntries(
          run.snapshot.stops
            .filter((s) => byId.has(s.location_id) && byId.get(s.location_id) !== s.planned_quantity)
            .map((s) => [`qty:${s.label}`, { from: s.planned_quantity, to: byId.get(s.location_id) }]),
        );
        break;
      }

      case "remove_stop": {
        const locationId = cleanString(body.locationId, 50);
        const stop = run.snapshot.stops.find((s) => s.location_id === locationId);
        if (!stop) return NextResponse.json({ error: "Stop not in this run" }, { status: 404 });
        if (run.snapshot.stops.length === 1) {
          return NextResponse.json({ error: "A run needs at least one stop — cancel it instead" }, { status: 400 });
        }
        const stops = run.snapshot.stops
          .filter((s) => s.location_id !== locationId)
          .map((s, i) => ({ ...s, sequence: i + 1 }));
        updated = await transition(["planned", "assigned"], { "snapshot.stops": stops }, "remove stops from");
        if (!(updated instanceof NextResponse)) {
          await stopDeliveries.deleteOne({ run_id: runId, location_id: locationId, status: "pending" });
          await Promise.all(
            stops.map((s) => stopDeliveries.updateOne({ run_id: runId, location_id: s.location_id }, { $set: { sequence: s.sequence } })),
          );
        }
        changes = { removed_stop: { from: stop.label, to: null } };
        break;
      }

      case "cancel": {
        updated = await transition(["planned", "assigned"], { status: "cancelled" }, "cancel");
        if (!(updated instanceof NextResponse)) {
          await stopDeliveries.deleteMany({ run_id: runId, status: "pending" });
        }
        changes = { status: { from: run.status, to: "cancelled" } };
        break;
      }

      case "rename": {
        const name = cleanString(body.name, 120);
        if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
        updated = await transition(["planned", "assigned", "in_progress", "interrupted", "completed"], { name }, "rename");
        changes = { name: { from: run.name, to: name } };
        break;
      }

      case "notes": {
        updated = await transition(
          ["planned", "assigned", "in_progress", "interrupted", "completed"],
          { notes: cleanString(body.notes, 2000) },
          "add notes to",
        );
        break;
      }

      case "load": {
        const loaded = cleanCount(body.loadedCopies);
        if (loaded === "invalid" || loaded === null) {
          return NextResponse.json({ error: "Enter how many copies were loaded" }, { status: 400 });
        }
        updated = await transition(["assigned", "in_progress", "interrupted"], { loaded_copies: loaded }, "load");
        changes = { loaded_copies: { from: run.loaded_copies, to: loaded } };
        break;
      }

      case "start": {
        if (!run.driver) return NextResponse.json({ error: "Assign a driver first" }, { status: 400 });
        updated = await transition(
          ["assigned", "interrupted"],
          { status: "in_progress", started_at: run.started_at ?? now, interrupted_reason: "" },
          "start",
        );
        if (!(updated instanceof NextResponse)) {
          const { ObjectId } = await import("mongodb");
          await editions.updateOne(
            { _id: new ObjectId(run.edition_id), status: "planning" },
            { $set: { status: "distributing", updated_at: now } },
          );
        }
        changes = { status: { from: run.status, to: "in_progress" } };
        break;
      }

      case "interrupt": {
        const reason = cleanString(body.reason, 500);
        if (!reason) return NextResponse.json({ error: "Say why the run stopped" }, { status: 400 });
        updated = await transition(["in_progress"], { status: "interrupted", interrupted_reason: reason }, "interrupt");
        changes = { status: { from: run.status, to: "interrupted" }, reason: { from: null, to: reason } };
        break;
      }

      case "finish": {
        const returned = cleanCount(body.returnedCopies);
        const damaged = cleanCount(body.damagedCopies);
        const loaded = body.loadedCopies !== undefined ? cleanCount(body.loadedCopies) : run.loaded_copies;
        if (returned === "invalid" || damaged === "invalid" || loaded === "invalid") {
          return NextResponse.json({ error: "Counts must be whole numbers" }, { status: 400 });
        }
        if (loaded === null) {
          return NextResponse.json({ error: "Enter how many copies were loaded" }, { status: 400 });
        }
        updated = await transition(
          ["in_progress", "interrupted"],
          {
            status: "completed",
            completed_at: now,
            loaded_copies: loaded,
            returned_copies: returned ?? 0,
            damaged_copies: damaged ?? 0,
            ...(body.notes !== undefined ? { notes: cleanString(body.notes, 2000) } : {}),
          },
          "finish",
        );
        if (!(updated instanceof NextResponse)) {
          // Stops never recorded count as skipped, so nothing stays "pending" forever.
          await stopDeliveries.updateMany(
            { run_id: runId, status: "pending" },
            {
              $set: {
                status: "skipped",
                delivered_quantity: 0,
                reason: AUTO_SKIP_REASON,
                recorded_by: user,
                recorded_at: now,
                synced_at: now,
              },
            },
          );
        }
        changes = {
          status: { from: run.status, to: "completed" },
          returned_copies: { from: null, to: returned ?? 0 },
          damaged_copies: { from: null, to: damaged ?? 0 },
        };
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (updated instanceof NextResponse) return updated;

    await recordAudit({ entity: "delivery_run", entity_id: runId, action, changes, by: user });

    return NextResponse.json(await runResponse(updated));
  } catch (err: any) {
    console.error("Run update error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update run" }, { status: 500 });
  }
}
