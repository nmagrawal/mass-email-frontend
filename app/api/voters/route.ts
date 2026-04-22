import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const dbName = "voter_db";
const collectionName = "voters";

export async function GET(req: NextRequest) {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Get city filter from query params
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    // Only include voters with a non-empty email field
    const filter: Record<string, any> = city
      ? { "demographics.city": city, email: { $exists: true, $ne: "" } }
      : { email: { $exists: true, $ne: "" } };

    // Get all unique cities for filter dropdown
    const cities = await collection.distinct("demographics.city");

    // Get voters for the city (or all if no city)
    const voters = await collection.find(filter).limit(100).toArray();

    return NextResponse.json({ voters, cities });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : err }, { status: 500 });
  } finally {
    await client.close();
  }
}
