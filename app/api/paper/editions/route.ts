import { NextRequest, NextResponse } from "next/server";

import {
  auditUser,
  canDispatch,
  cleanCount,
  cleanString,
  paperCollections,
  recordAudit,
  requireUser,
  serializeEdition,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

// GET /api/paper/editions?cityId= → newest first, with run/copy summary
export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }

    const cityId = cleanString(req.nextUrl.searchParams.get("cityId"), 100);
    if (!cityId) {
      return NextResponse.json({ error: "cityId is required" }, { status: 400 });
    }

    const { editions, runs, stopDeliveries } = await paperCollections();
    const docs = await editions.find({ city_id: cityId }).sort({ publish_date: -1 }).limit(100).toArray();
    const ids = docs.map((e) => String(e._id));

    const [runSummary, stopSummary] = await Promise.all([
      runs
        .aggregate<{ _id: string; runs: number; unassigned: number; completed: number; planned: number }>([
          { $match: { edition_id: { $in: ids }, status: { $ne: "cancelled" } } },
          {
            $group: {
              _id: "$edition_id",
              runs: { $sum: 1 },
              unassigned: { $sum: { $cond: [{ $eq: ["$driver", null] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
              planned: { $sum: { $sum: "$snapshot.stops.planned_quantity" } },
            },
          },
        ])
        .toArray(),
      stopDeliveries
        .aggregate<{ _id: string; delivered: number; pickedUp: number }>([
          { $match: { edition_id: { $in: ids } } },
          {
            $group: {
              _id: "$edition_id",
              delivered: { $sum: { $ifNull: ["$delivered_quantity", 0] } },
              pickedUp: { $sum: { $ifNull: ["$picked_up_quantity", 0] } },
            },
          },
        ])
        .toArray(),
    ]);

    const runsBy = new Map(runSummary.map((r) => [r._id, r]));
    const stopsBy = new Map(stopSummary.map((s) => [s._id, s]));

    return NextResponse.json({
      editions: docs.map((e) => {
        const id = String(e._id);
        const r = runsBy.get(id);
        const s = stopsBy.get(id);
        return {
          ...serializeEdition(e),
          summary: {
            runs: r?.runs ?? 0,
            unassignedRuns: r?.unassigned ?? 0,
            completedRuns: r?.completed ?? 0,
            allocated: r?.planned ?? 0,
            delivered: s?.delivered ?? 0,
            pickedUp: s?.pickedUp ?? 0,
          },
        };
      }),
    });
  } catch (err: any) {
    console.error("Editions list error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load editions" }, { status: 500 });
  }
}

// POST /api/paper/editions { cityId, name, publishDate, copiesAvailable, notes? }
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }
    const user = auditUser(me);

    const body = await req.json();
    const cityId = cleanString(body.cityId, 100);
    const name = cleanString(body.name, 120);
    const publishDate = new Date(body.publishDate);
    const copies = cleanCount(body.copiesAvailable, 1_000_000);

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (Number.isNaN(publishDate.getTime())) {
      return NextResponse.json({ error: "Choose a date" }, { status: 400 });
    }
    if (copies === "invalid") {
      return NextResponse.json({ error: "Copies available must be a whole number" }, { status: 400 });
    }

    const { cities, editions } = await paperCollections();
    if (!(await cities.findOne({ _id: cityId }, { projection: { _id: 1 } }))) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    const now = new Date();
    const doc = {
      city_id: cityId,
      name,
      publish_date: publishDate,
      copies_available: copies ?? 0,
      status: "planning" as const,
      notes: cleanString(body.notes, 2000),
      created_by: user,
      created_at: now,
      updated_by: user,
      updated_at: now,
    };
    const result = await editions.insertOne(doc);
    await recordAudit({ entity: "edition", entity_id: String(result.insertedId), action: "created", by: user });

    return NextResponse.json({
      edition: {
        ...serializeEdition({ ...doc, _id: result.insertedId }),
        summary: { runs: 0, unassignedRuns: 0, completedRuns: 0, allocated: 0, delivered: 0, pickedUp: 0 },
      },
    });
  } catch (err: any) {
    console.error("Edition create error:", err);
    return NextResponse.json({ error: err?.message || "Failed to create edition" }, { status: 500 });
  }
}
