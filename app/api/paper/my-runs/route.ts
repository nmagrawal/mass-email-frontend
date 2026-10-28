import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import {
  paperCollections,
  requireUser,
  runTotals,
  serializeEdition,
  serializeRun,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

const RECENT_COMPLETED_MS = 3 * 24 * 60 * 60 * 1000;

// GET /api/paper/my-runs → runs assigned to the signed-in user (open + recently completed)
export async function GET() {
  try {
    const me = await requireUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { runs, editions, stopDeliveries, cities } = await paperCollections();
    const docs = await runs
      .find({
        "driver.clerk_user_id": me.clerk_user_id,
        $or: [
          { status: { $in: ["assigned", "in_progress", "interrupted"] } },
          { status: "completed", completed_at: { $gte: new Date(Date.now() - RECENT_COMPLETED_MS) } },
        ],
      })
      .toArray();

    const editionIds = [...new Set(docs.map((r) => r.edition_id))].filter((id) => ObjectId.isValid(id));
    const runIds = docs.map((r) => String(r._id));

    const [editionDocs, stopDocs, cityDocs] = await Promise.all([
      editions.find({ _id: { $in: editionIds.map((id) => new ObjectId(id)) } }).toArray(),
      stopDeliveries.find({ run_id: { $in: runIds } }).toArray(),
      cities.find({ _id: { $in: [...new Set(docs.map((r) => r.city_id))] } }, { projection: { name: 1 } }).toArray(),
    ]);

    const editionById = new Map(editionDocs.map((e) => [String(e._id), e]));
    const cityName = new Map(cityDocs.map((c) => [c._id, c.name]));

    const order: Record<string, number> = { in_progress: 0, interrupted: 1, assigned: 2, completed: 3 };

    const out = docs
      .map((r) => {
        const edition = editionById.get(r.edition_id);
        return {
          ...serializeRun(r),
          cityName: cityName.get(r.city_id) ?? r.city_id,
          edition: edition ? serializeEdition(edition) : null,
          totals: runTotals(r, stopDocs.filter((s) => s.run_id === String(r._id))),
        };
      })
      .sort(
        (a, b) =>
          (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
          (a.edition?.publishDate ?? "").localeCompare(b.edition?.publishDate ?? ""),
      );

    return NextResponse.json({ runs: out });
  } catch (err: any) {
    console.error("My runs error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load your runs" }, { status: 500 });
  }
}
