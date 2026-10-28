import { NextRequest, NextResponse } from "next/server";

import {
  cleanString,
  fetchPlaceDetails,
  paperCollections,
  recordAudit,
  auditUser,
  requireUser,
  serializeCity,
  slugify,
  toPoint,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

// GET /api/paper/cities → all cities with active location counts
export async function GET() {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cities, locations } = await paperCollections();
    const [docs, counts] = await Promise.all([
      cities.find({}).sort({ name: 1 }).toArray(),
      locations
        .aggregate<{ _id: string; count: number }>([
          { $match: { status: { $ne: "inactive" } } },
          { $group: { _id: "$city_id", count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const countByCity = new Map(counts.map((c) => [c._id, c.count]));

    return NextResponse.json({
      cities: docs.map((c) => ({ ...serializeCity(c), locationCount: countByCity.get(c._id) ?? 0 })),
    });
  } catch (err: any) {
    console.error("Paper cities list error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load cities" }, { status: 500 });
  }
}

// POST /api/paper/cities { placeId, sessionToken } — a Google "locality" place
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const user = me && auditUser(me);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const placeId = cleanString(body.placeId, 300);
    if (!placeId) {
      return NextResponse.json({ error: "Pick a city from the list" }, { status: 400 });
    }

    const place = await fetchPlaceDetails(placeId, cleanString(body.sessionToken, 100) || undefined);
    const name = place.city || place.name;

    if (!name || !Number.isFinite(place.lat)) {
      return NextResponse.json({ error: "That place is not a city" }, { status: 400 });
    }

    const id = slugify(`${name} ${place.state}`);
    const { cities } = await paperCollections();

    const existing = await cities.findOne({ _id: id });
    if (existing) {
      return NextResponse.json({ city: serializeCity(existing), existed: true });
    }

    const now = new Date();
    const doc = {
      _id: id,
      name,
      state: place.state,
      google: {
        place_id: place.placeId,
        name: place.name,
        formatted_address: place.formattedAddress,
        types: place.types,
      },
      center: toPoint(place.lat, place.lng),
      location_fetched_at: now,
      depot: null,
      created_by: user,
      created_at: now,
      updated_by: user,
      updated_at: now,
    };

    await cities.insertOne(doc);
    await recordAudit({ entity: "city", entity_id: id, action: "created", by: user });

    return NextResponse.json({ city: { ...serializeCity(doc), locationCount: 0 } });
  } catch (err: any) {
    console.error("Paper city create error:", err);
    return NextResponse.json({ error: err?.message || "Failed to add city" }, { status: 500 });
  }
}
