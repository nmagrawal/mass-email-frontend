import { NextRequest, NextResponse } from "next/server";

import {
  canDispatch,
  paperCollections,
  requireUser,
  serializeStopDelivery,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * GET /api/paper/locations/:id/history?limit=20
 * Week-by-week record for one drop location: planned, dropped, old papers
 * picked up, status and reason. Pending stops of open runs are included.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser();
    if (!me || !canDispatch(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: me ? 403 : 401 });
    }

    const { id } = await params;
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));

    const { stopDeliveries } = await paperCollections();
    const docs = await stopDeliveries
      .find({ location_id: id })
      .sort({ publish_date: -1, sequence: 1 })
      .limit(limit)
      .toArray();

    const recorded = docs.filter((d) => d.status !== "pending");
    const sum = (k: "delivered_quantity" | "picked_up_quantity") =>
      recorded.reduce((acc, d) => acc + (d[k] ?? 0), 0);

    return NextResponse.json({
      history: docs.map(serializeStopDelivery),
      summary: {
        rounds: recorded.length,
        dropped: sum("delivered_quantity"),
        pickedUp: sum("picked_up_quantity"),
        // Share of dropped papers that came back as leftovers the next time.
        leftoverRate: sum("delivered_quantity") ? sum("picked_up_quantity") / sum("delivered_quantity") : null,
        skipped: recorded.filter((d) => d.status === "skipped").length,
      },
    });
  } catch (err: any) {
    console.error("Location history error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load history" }, { status: 500 });
  }
}
