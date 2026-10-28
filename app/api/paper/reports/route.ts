import { NextRequest, NextResponse } from "next/server";

import {
  AUTO_SKIP_REASON,
  canDispatch,
  cleanString,
  paperCollections,
  requireUser,
  runTotals,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;

/*
 * GET /api/paper/reports?cityId=&from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 8 weeks)
 *
 * - byEdition: copies planned / loaded / dropped / picked up / returned / damaged / unaccounted
 * - byLocation: weekly totals per location incl. old papers picked up (leftovers)
 * - problems: skipped and partial stops with reasons
 * - notPlanned: active locations missing from the latest edition
 * - runStatus: run status counts for the latest edition
 */
export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }

    const params = req.nextUrl.searchParams;
    const cityId = cleanString(params.get("cityId"), 100);
    if (!cityId) return NextResponse.json({ error: "cityId is required" }, { status: 400 });

    const to = params.get("to") ? new Date(`${params.get("to")}T23:59:59`) : new Date(Date.now() + 7 * DAY);
    const from = params.get("from") ? new Date(`${params.get("from")}T00:00:00`) : new Date(Date.now() - 56 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const { editions, runs, stopDeliveries, locations } = await paperCollections();

    const editionDocs = await editions
      .find({ city_id: cityId, publish_date: { $gte: from, $lte: to } })
      .sort({ publish_date: -1 })
      .toArray();
    const editionIds = editionDocs.map((e) => String(e._id));

    const [runDocs, stopDocs, activeLocations] = await Promise.all([
      runs.find({ edition_id: { $in: editionIds }, status: { $ne: "cancelled" } }).toArray(),
      stopDeliveries.find({ edition_id: { $in: editionIds } }).toArray(),
      locations.find({ city_id: cityId, status: "active" }, { projection: { label: 1, area: 1 } }).toArray(),
    ]);

    const stopsByRun = new Map<string, typeof stopDocs>();
    for (const s of stopDocs) {
      const list = stopsByRun.get(s.run_id) ?? [];
      list.push(s);
      stopsByRun.set(s.run_id, list);
    }
    const liveRunIds = new Set(runDocs.map((r) => String(r._id)));
    const liveStops = stopDocs.filter((s) => liveRunIds.has(s.run_id));

    const byEdition = editionDocs.map((e) => {
      const id = String(e._id);
      const totals = runDocs
        .filter((r) => r.edition_id === id)
        .map((r) => ({ status: r.status, ...runTotals(r, stopsByRun.get(String(r._id)) ?? []) }));
      const sum = (k: "planned" | "delivered" | "pickedUp") => totals.reduce((a, t) => a + t[k], 0);
      const sumN = (k: "loaded" | "returned" | "damaged" | "unaccounted") => totals.reduce((a, t) => a + (t[k] ?? 0), 0);
      return {
        editionId: id,
        name: e.name,
        publishDate: e.publish_date.toISOString(),
        status: e.status,
        copiesAvailable: e.copies_available,
        allocated: sum("planned"),
        loaded: sumN("loaded"),
        delivered: sum("delivered"),
        pickedUp: sum("pickedUp"),
        returned: sumN("returned"),
        damaged: sumN("damaged"),
        unaccounted: sumN("unaccounted"),
        runs: totals.length,
        completedRuns: totals.filter((t) => t.status === "completed").length,
        skippedStops: totals.reduce((a, t) => a + t.skippedStops, 0),
        partialStops: totals.reduce((a, t) => a + t.partialStops, 0),
      };
    });

    const locMap = new Map<
      string,
      { locationId: string; label: string; rounds: number; planned: number; dropped: number; pickedUp: number; skipped: number; partial: number; last: { date: string; dropped: number | null; pickedUp: number | null } | null }
    >();
    for (const s of liveStops.sort((a, b) => a.publish_date.getTime() - b.publish_date.getTime())) {
      const row =
        locMap.get(s.location_id) ??
        { locationId: s.location_id, label: s.location_label, rounds: 0, planned: 0, dropped: 0, pickedUp: 0, skipped: 0, partial: 0, last: null };
      row.planned += s.planned_quantity;
      if (s.status !== "pending") {
        row.rounds++;
        row.dropped += s.delivered_quantity ?? 0;
        row.pickedUp += s.picked_up_quantity ?? 0;
        if (s.status === "skipped") row.skipped++;
        if (s.status === "partial") row.partial++;
        row.last = { date: s.publish_date.toISOString(), dropped: s.delivered_quantity, pickedUp: s.picked_up_quantity };
      }
      locMap.set(s.location_id, row);
    }
    const byLocation = [...locMap.values()]
      .map((r) => ({ ...r, leftoverRate: r.dropped ? r.pickedUp / r.dropped : null }))
      .sort((a, b) => (b.leftoverRate ?? -1) - (a.leftoverRate ?? -1) || a.label.localeCompare(b.label));

    const editionName = new Map(editionDocs.map((e) => [String(e._id), e.name]));
    const problems = liveStops
      .filter((s) => s.status === "skipped" || s.status === "partial")
      .sort((a, b) => b.publish_date.getTime() - a.publish_date.getTime())
      .slice(0, 200)
      .map((s) => ({
        editionName: editionName.get(s.edition_id) ?? "",
        publishDate: s.publish_date.toISOString(),
        runId: s.run_id,
        locationId: s.location_id,
        label: s.location_label,
        status: s.status,
        planned: s.planned_quantity,
        delivered: s.delivered_quantity,
        reason: s.reason,
        autoSkipped: s.reason === AUTO_SKIP_REASON,
        recordedBy: s.recorded_by?.name ?? null,
      }));

    const latest = editionDocs[0] ?? null;
    let notPlanned: { locationId: string; label: string; area: string }[] = [];
    let runStatus: Record<string, number> = {};
    if (latest) {
      const latestId = String(latest._id);
      const latestRuns = runDocs.filter((r) => r.edition_id === latestId);
      const planned = new Set(latestRuns.flatMap((r) => r.snapshot.stops.map((s) => s.location_id)));
      notPlanned = activeLocations
        .filter((l) => !planned.has(String(l._id)))
        .map((l) => ({ locationId: String(l._id), label: l.label, area: l.area }));
      runStatus = latestRuns.reduce<Record<string, number>>((acc, r) => {
        const key = r.status === "assigned" || r.status === "planned" ? (r.driver ? "assigned" : "unassigned") : r.status;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
    }

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      latestEdition: latest ? { id: String(latest._id), name: latest.name, publishDate: latest.publish_date.toISOString() } : null,
      runStatus,
      byEdition,
      byLocation,
      problems,
      notPlanned,
    });
  } catch (err: any) {
    console.error("Reports error:", err);
    return NextResponse.json({ error: err?.message || "Failed to build report" }, { status: 500 });
  }
}
