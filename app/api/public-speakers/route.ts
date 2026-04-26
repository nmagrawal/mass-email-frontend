import { NextRequest } from "next/server";
import { getDb } from "@/lib/api/mongo";
import { MongoClient } from "mongodb";

// Helper to get opgov-prod DB from a different URI
async function getOpgovProdDb() {
  const uri = process.env.MONGODB_URI_1;
  if (!uri) throw new Error("MONGODB_URI_1 not set");
  const client = new MongoClient(uri);
  await client.connect();
  return client.db("opgov-prod");
}

export async function GET(req: NextRequest) {
  try {
    const mainDb = await getDb("voter_db");
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const filter: any = { public_speaker: true };
    if (city) {
      filter["demographics.city"] = city;
    }
    const total = await mainDb.collection("voters").countDocuments(filter);
    const voters = await mainDb.collection("voters")
      .find(filter)
      .skip(skip)
      .limit(limit)
      .toArray();
    return new Response(
      JSON.stringify({ voters, total }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}