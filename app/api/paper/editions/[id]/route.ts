import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  EDITION_STATUSES,
  auditUser,
  canDispatch,
  cleanCount,
  cleanString,
  diffFields,
  paperCollections,
  recordAudit,
  requireUser,
  runTotals,
  serializeEdition,
  serializeRun,
  serializeStopDelivery,
  type EditionStatus,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/*
 * GET /api/paper/editions/:id → edition, its runs (with totals), every stop
 * record, edition totals, and locations included in more than one run.
 */
export async function GET(_req: NextRequest, { params }: Context) {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { editions, runs, stopDeliveries } = await paperCollections();
    const edition = await editions.findOne({ _id: new ObjectId(id) });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    const [runDocs, stopDocs] = await Promise.all([
      runs.find({ edition_id: id }).sort({ created_at: 1 }).toArray(),
      stopDeliveries.find({ edition_id: id }).sort({ sequence: 1 }).toArray(),
    ]);

    const stopsByRun = new Map<string, typeof stopDocs>();
    for (const s of stopDocs) {
      const list = stopsByRun.get(s.run_id) ?? [];
      list.push(s);
      stopsByRun.set(s.run_id, list);
    }

    const activeRuns = runDocs.filter((r) => r.status !== "cancelled");
    const runsOut = runDocs.map((r) => ({
      ...serializeRun(r),
      totals: runTotals(r, stopsByRun.get(String(r._id)) ?? []),
    }));

    // A location planned in two live runs of the same edition is usually a mistake.
    const seen = new Map<string, { label: string; runs: string[] }>();
    for (const r of activeRuns) {
      for (const s of r.snapshot.stops) {
        const entry = seen.get(s.location_id) ?? { label: s.label, runs: [] };
        entry.runs.push(r.name);
        seen.set(s.location_id, entry);
      }
    }
    const duplicates = [...seen.entries()]
      .filter(([, v]) => v.runs.length > 1)
      .map(([locationId, v]) => ({ locationId, ...v }));

    const sum = (key: "planned" | "delivered" | "pickedUp") =>
      runsOut.filter((r) => r.status !== "cancelled").reduce((acc, r) => acc + r.totals[key], 0);
    const sumNullable = (key: "loaded" | "returned" | "damaged") =>
      runsOut.filter((r) => r.status !== "cancelled").reduce((acc, r) => acc + (r.totals[key] ?? 0), 0);

    const allocated = sum("planned");

    return NextResponse.json({
      edition: serializeEdition(edition),
      runs: runsOut,
      stops: stopDocs.map(serializeStopDelivery),
      totals: {
        copiesAvailable: edition.copies_available,
        allocated,
        unallocated: edition.copies_available - allocated,
        loaded: sumNullable("loaded"),
        delivered: sum("delivered"),
        pickedUp: sum("pickedUp"),
        returned: sumNullable("returned"),
        damaged: sumNullable("damaged"),
        unaccounted: runsOut.reduce((acc, r) => acc + (r.totals.unaccounted ?? 0), 0),
        runs: activeRuns.length,
        unassignedRuns: activeRuns.filter((r) => !r.driver).length,
        completedRuns: activeRuns.filter((r) => r.status === "completed").length,
        inProgressRuns: activeRuns.filter((r) => r.status === "in_progress").length,
      },
      duplicates,
    });
  } catch (err: any) {
    console.error("Edition detail error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load edition" }, { status: 500 });
  }
}

// PATCH /api/paper/editions/:id { name?, publishDate?, copiesAvailable?, status?, notes? }
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }
    const user = auditUser(me);

    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await req.json();
    const set: Record<string, unknown> = {};

    if ("name" in body) {
      const name = cleanString(body.name, 120);
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      set.name = name;
    }
    if ("publishDate" in body) {
      const d = new Date(body.publishDate);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      set.publish_date = d;
    }
    if ("copiesAvailable" in body) {
      const c = cleanCount(body.copiesAvailable, 1_000_000);
      if (c === "invalid" || c === null) {
        return NextResponse.json({ error: "Copies available must be a whole number" }, { status: 400 });
      }
      set.copies_available = c;
    }
    if ("status" in body) {
      if (!EDITION_STATUSES.includes(body.status as EditionStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      set.status = body.status;
    }
    if ("notes" in body) set.notes = cleanString(body.notes, 2000);

    if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const { editions, stopDeliveries } = await paperCollections();
    const _id = new ObjectId(id);
    const before = await editions.findOne({ _id });
    if (!before) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    const updated = await editions.findOneAndUpdate(
      { _id },
      { $set: { ...set, updated_by: user, updated_at: new Date() } },
      { returnDocument: "after" },
    );

    // Stop records carry the date for fast per-location history.
    if (set.publish_date) {
      await stopDeliveries.updateMany({ edition_id: id }, { $set: { publish_date: set.publish_date as Date } });
    }

    const changes = diffFields(before as any, set);
    if (Object.keys(changes).length) {
      await recordAudit({ entity: "edition", entity_id: id, action: "updated", changes, by: user });
    }

    return NextResponse.json({ edition: serializeEdition(updated!) });
  } catch (err: any) {
    console.error("Edition update error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update edition" }, { status: 500 });
  }
}
