import { NextRequest } from "next/server";
import { getDb } from "@/lib/api/mongo";

export async function POST(req: NextRequest) {
  try {
    const db = await getDb("voter_db");
    // Voters collection indexes
    await db.collection("voters").createIndex({ "demographics.city": 1 });
    await db.collection("voters").createIndex({ email: 1 });
    // Emails collection index
    await db.collection("emails").createIndex({ sequence: 1 });
    return new Response(
      JSON.stringify({ success: true, message: "Indexes created successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


// curl -X POST http://localhost:3000/api/create-indexes