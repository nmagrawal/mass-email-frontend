import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

const dbName = "voter_db";
const collectionName = "voters";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb(dbName);
    const collection = db.collection(collectionName);
    const { searchParams } = new URL(req.url);
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // Only fetch inbound_unmatched messages
    const projection = {
      full_name: 1,
      "demographics.PhoneNumber": 1,
      "sms_chats.inbound_unmatched": 1,
    };
    // Only get voters with at least one inbound_unmatched message
    const filter = { "sms_chats.inbound_unmatched.0": { $exists: true } };
    // Get total count of all inbound_unmatched messages
    const votersAll = await collection.find(filter, { projection }).toArray();
    let allMessages = votersAll.flatMap((voter) => {
      const phone = voter.demographics?.PhoneNumber || "";
      const name = voter.full_name || "";
      return (voter.sms_chats?.inbound_unmatched || []).map((msg: any) => ({
        full_name: name,
        phone,
        text: msg.text,
        timestamp: msg.timestamp,
      }));
    });
    // Sort descending by timestamp
    allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const total = allMessages.length;
    // Paginate
    const messages = allMessages.slice(skip, skip + limit);
    return NextResponse.json({ messages, total });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : err }, { status: 500 });
  }
}
