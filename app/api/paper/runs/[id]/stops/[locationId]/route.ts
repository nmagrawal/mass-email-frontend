import { NextRequest, NextResponse } from "next/server";

import {
  AUTO_SKIP_REASON,
  STOP_DELIVERY_STATUSES,
  auditUser,
  canAccessRun,
  canDispatch,
  cleanCount,
  cleanString,
  loadRun,
  paperCollections,
  recordAudit,
  requireUser,
  runTotals,
  serializeStopDelivery,
  type StopDeliveryDocument,
  type StopDeliveryStatus,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/* Drivers can still sync queued (offline) updates for a while after finishing. */
const LATE_SYNC_WINDOW_MS = 48 * 60 * 60 * 1000;

type Context = { params: Promise<{ id: string; locationId: string }> };

/*
 * PATCH /api/paper/runs/:id/stops/:locationId
 *
 * Driver:     { status: delivered|partial|skipped, deliveredQuantity?, pickedUpQuantity?,
 *               reason?, notes?, clientUpdateId, recordedAt }
 * Dispatcher: same fields + { correction: true, reason (why it's being corrected) }
 *
 * - deliveredQuantity = new papers dropped; pickedUpQuantity = old papers collected.
 * - Retries with the same clientUpdateId are no-ops.
 * - Updates recorded on the device before the current value are ignored
 *   (queued offline updates may arrive out of order).
 * - Changing an already recorded stop keeps the previous values in `corrections`.
 */
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const me = await requireUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = auditUser(me);

    const { id, locationId } = await params;
    const run = await loadRun(id);
    if (!run || !canAccessRun(me, run)) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const body = await req.json();
    const isCorrection = body.correction === true;

    if (isCorrection && !canDispatch(me)) {
      return NextResponse.json({ error: "Only dispatchers can correct records" }, { status: 403 });
    }

    if (!isCorrection) {
      const lateOk =
        run.status === "completed" &&
        run.completed_at &&
        Date.now() - run.completed_at.getTime() < LATE_SYNC_WINDOW_MS;
      if (run.status !== "in_progress" && run.status !== "interrupted" && !lateOk) {
        return NextResponse.json(
          { error: run.status === "completed" ? "This run is closed — ask a dispatcher to correct it" : "Start the run first" },
          { status: 409 },
        );
      }
    }

    const { stopDeliveries } = await paperCollections();
    const runId = String(run._id);
    const existing = await stopDeliveries.findOne({ run_id: runId, location_id: locationId });
    if (!existing) return NextResponse.json({ error: "Stop not in this run" }, { status: 404 });

    const respond = async (stop: StopDeliveryDocument, extra: Record<string, unknown> = {}) => {
      const all = await stopDeliveries.find({ run_id: runId }).toArray();
      return NextResponse.json({ stop: serializeStopDelivery(stop), totals: runTotals(run, all), ...extra });
    };

    const clientUpdateId = cleanString(body.clientUpdateId, 100) || null;
    if (!isCorrection && clientUpdateId && existing.client_update_id === clientUpdateId) {
      return respond(existing, { duplicate: true });
    }

    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
    if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > Date.now() + 5 * 60_000) {
      return NextResponse.json({ error: "Invalid recordedAt" }, { status: 400 });
    }

    if (
      !isCorrection &&
      existing.recorded_at &&
      existing.reason !== AUTO_SKIP_REASON &&
      recordedAt < existing.recorded_at
    ) {
      // A newer update already landed; keep it.
      return respond(existing, { stale: true });
    }

    const status = body.status as StopDeliveryStatus;
    if (!STOP_DELIVERY_STATUSES.includes(status) || status === "pending") {
      return NextResponse.json({ error: "Choose delivered, partial or skipped" }, { status: 400 });
    }

    const delivered = cleanCount(body.deliveredQuantity, 10000);
    const pickedUp = cleanCount(body.pickedUpQuantity, 10000);
    if (delivered === "invalid" || pickedUp === "invalid") {
      return NextResponse.json({ error: "Counts must be whole numbers" }, { status: 400 });
    }

    // For a correction, `reason` explains the correction; the stop reason is `stopReason`.
    const stopReason = cleanString(isCorrection ? body.stopReason ?? existing.reason : body.reason, 500);
    const notes = body.notes !== undefined ? cleanString(body.notes, 1000) : existing.notes;

    let deliveredQuantity: number;
    if (status === "skipped") deliveredQuantity = 0;
    else if (status === "delivered") deliveredQuantity = delivered ?? existing.planned_quantity;
    else {
      if (delivered === null) {
        return NextResponse.json({ error: "Enter how many papers were dropped" }, { status: 400 });
      }
      deliveredQuantity = delivered;
    }

    if ((status === "partial" || status === "skipped") && !stopReason) {
      return NextResponse.json({ error: `Give a reason for a ${status} stop` }, { status: 400 });
    }

    const next = {
      status,
      delivered_quantity: deliveredQuantity,
      picked_up_quantity: pickedUp ?? existing.picked_up_quantity ?? 0,
      reason: status === "delivered" && !isCorrection ? stopReason || "" : stopReason,
      notes,
    };

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, value] of Object.entries(next)) {
      const before = (existing as any)[key];
      if (JSON.stringify(before ?? null) !== JSON.stringify(value ?? null)) changes[key] = { from: before ?? null, to: value };
    }

    const wasRecorded = existing.status !== "pending" && existing.reason !== AUTO_SKIP_REASON;
    const correctionReason = isCorrection
      ? cleanString(body.reason, 500)
      : wasRecorded && Object.keys(changes).length
        ? "Updated by driver"
        : "";

    if (isCorrection && !correctionReason) {
      return NextResponse.json({ error: "Say why the record is being corrected" }, { status: 400 });
    }

    const now = new Date();
    const update: Record<string, unknown> = {
      $set: {
        ...next,
        synced_at: now,
        ...(isCorrection
          ? {}
          : { recorded_by: user, recorded_at: recordedAt, client_update_id: clientUpdateId }),
      },
    };
    if (correctionReason && Object.keys(changes).length) {
      update.$push = { corrections: { changes, reason: correctionReason, by: user, at: now } };
    }

    const saved = await stopDeliveries.findOneAndUpdate({ _id: existing._id }, update, { returnDocument: "after" });

    if (isCorrection && Object.keys(changes).length) {
      await recordAudit({
        entity: "stop_delivery",
        entity_id: String(existing._id),
        action: "corrected",
        changes: { ...changes, reason: { from: null, to: correctionReason } },
        by: user,
      });
    }

    return respond(saved!);
  } catch (err: any) {
    console.error("Stop record error:", err);
    return NextResponse.json({ error: err?.message || "Failed to save stop" }, { status: 500 });
  }
}
