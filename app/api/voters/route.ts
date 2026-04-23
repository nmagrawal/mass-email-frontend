
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";


const dbName = "voter_db";
const collectionName = "voters";

declare global {
  // eslint-disable-next-line no-var
  var _citiesCache: string[] | undefined;
  // eslint-disable-next-line no-var
  var _citiesCacheTime: number | undefined;
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb(dbName);
    const collection = db.collection(collectionName);

    // Get city filter from query params
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    // Only include voters with a non-empty email field
    const filter: Record<string, any> = city
      ? { "demographics.city": city, email: { $exists: true, $ne: "" } }
      : { email: { $exists: true, $ne: "" } };

    // Pagination
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // Cache cities in memory for 5 minutes (simple in-memory cache)
    if (!global._citiesCache || !global._citiesCacheTime || Date.now() - global._citiesCacheTime > 5 * 60 * 1000) {
      global._citiesCache = await collection.distinct("demographics.city");
      global._citiesCacheTime = Date.now();
    }
    const cities = global._citiesCache;

    // Get total count for pagination
    const total = await collection.countDocuments(filter);


    // Use projection to only return needed fields, including full_name for UI
    const projection = { email: 1, first_name: 1, full_name: 1, demographics: 1 };
    const voters = await collection
      .find(filter, { projection })
      .skip(skip)
      .limit(limit)
      .toArray();

    return NextResponse.json({ voters, cities, total });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : err }, { status: 500 });
  }
}
