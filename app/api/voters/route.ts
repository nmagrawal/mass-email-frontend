import { ObjectId } from "mongodb";
// PATCH: Mark voter as invalid phone
export async function PATCH(req: NextRequest) {
  try {
    const db = await getDb(dbName);
    const collection = db.collection(collectionName);
    const body = await req.json();
    const { voterId, invalid_phone } = body;
    if (!voterId) {
      return NextResponse.json({ error: "Missing voterId" }, { status: 400 });
    }
    const _id = typeof voterId === "string" ? new ObjectId(voterId) : voterId;
    const result = await collection.updateOne(
      { _id },
      { $set: { invalid_phone: !!invalid_phone } }
    );
    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: "Voter not found or not updated" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : err }, { status: 500 });
  }
}

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

    // Get city, mapped, and search filter from query params
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    const mapped = searchParams.get("mapped");
    const search = searchParams.get("search");
    // Build filter
    const filter: Record<string, any> = { invalid_phone: { $ne: true } };
    if (city) {
      filter["demographics.city"] = city;
    }
    if (mapped === "true") {
      filter["opgovUserId"] = { $exists: true, $ne: null };
    }
    // Add search by full_name (case-insensitive, partial match)
    if (search) {
      filter["$or"] = [
        { full_name: { $regex: search, $options: "i" } },
        { first_name: { $regex: search, $options: "i" } },
        { last_name: { $regex: search, $options: "i" } }
      ];
    }

    // Only return mapped voters if mapped param is set, otherwise default to previous logic
    let voters: any[] = [];
    if (mapped === "true") {
      // Only mapped voters, no pagination, just required fields
      const projection = {
        opgovUserId: 1,
        "demographics.name_first": 1,
        "demographics.name_last": 1,
        "demographics.city": 1,
        "demographics.house_number": 1,
        "demographics.street": 1,
        "demographics.type": 1,
        "demographics.state": 1,
        "demographics.zip": 1
      };
      voters = await collection.find(filter, { projection }).toArray();
      voters = voters.map((v: any) => {
        const d = v.demographics || {};
        const address = [d.house_number, d.street, d.type, d.city, d.state, d.zip]
          .filter(Boolean)
          .join(" ");
        return {
          voterId: v._id,
          opgovUserId: v.opgovUserId,
          first_name: d.name_first || "",
          last_name: d.name_last || "",
          city: d.city || null,
          address,
        };
      });
      return NextResponse.json({ voters });
    } else {
      // Default: paginated, all voters with email
      filter.email = { $exists: true, $ne: "" };
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
      voters = await collection
        .find(filter, { projection })
        .skip(skip)
        .limit(limit)
        .toArray();

      return NextResponse.json({ voters, cities, total });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : err }, { status: 500 });
  }
}
