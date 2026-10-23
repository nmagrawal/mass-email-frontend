import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  FINAL_STATUSES,
  getOutreachHistoryCollection,
  getSignedInUser,
  invalidateOutreachCounts,
  serializeHistory,
  type OutreachStatus,
} from "@/lib/outreach";

export const runtime = "nodejs";

/*
 * PATCH /api/outreach/history/:id  { status: "sent" | "cancelled" | "failed" }
 * Only initiated → final is allowed; a final record never changes again.
 * A later message to the same voter is a new record.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSignedInUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
    }

    const body = await req.json();
    const status = body.status as OutreachStatus;

    if (!FINAL_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const history = await getOutreachHistoryCollection();
    const now = new Date();

    const updated = await history.findOneAndUpdate(
      { _id: new ObjectId(id), status: "initiated" },
      {
        $set: {
          status,
          confirmed_by: user.id,
          confirmed_by_name: user.name,
          status_updated_at: now,
          ...(status === "sent" ? { sent_at: now } : {}),
        },
      },
      { returnDocument: "after" },
    );

    if (!updated) {
      const existing = await history.findOne({ _id: new ObjectId(id) });

      if (!existing) {
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
      }

      return NextResponse.json(
        {
          error: `This attempt is already ${existing.status}`,
          record: serializeHistory(existing),
        },
        { status: 409 },
      );
    }

    invalidateOutreachCounts();

    return NextResponse.json({ record: serializeHistory(updated) });
  } catch (err: any) {
    console.error("Outreach history update error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update outreach" },
      { status: 500 },
    );
  }
}
