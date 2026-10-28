import { after, NextRequest, NextResponse } from "next/server";

import {
  LOCATION_STATUSES,
  cleanString,
  escapeRegex,
  paperCollections,
  parseLocationFields,
  recordAudit,
  refreshStaleCoordinates,
  requireUser,
  serializeLocation,
  toPoint,
  type LocationStatus,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * GET /api/paper/locations?cityId=&status=active|paused|inactive|current|all&search=
 * "current" (default) = active + paused.
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    const cityId = cleanString(params.get("cityId"), 100);
    const status = params.get("status") || "current";
    const search = cleanString(params.get("search"), 100);

    if (!cityId) {
      return NextResponse.json({ error: "cityId is required" }, { status: 400 });
    }

    const filter: Record<string, unknown> = { city_id: cityId };
    if (status === "current") filter.status = { $in: ["active", "paused"] };
    else if (LOCATION_STATUSES.includes(status as LocationStatus)) filter.status = status;

    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { label: { $regex: safe, $options: "i" } },
        { area: { $regex: safe, $options: "i" } },
        { "google.formatted_address": { $regex: safe, $options: "i" } },
        { "google.name": { $regex: safe, $options: "i" } },
      ];
    }

    const { locations } = await paperCollections();
    const docs = await locations.find(filter).sort({ area: 1, label: 1 }).limit(2000).toArray();

    // Keep Google coordinates within their 30-day cache limit.
    after(() => refreshStaleCoordinates(cityId).catch((e) => console.error(e)));

    return NextResponse.json({ locations: docs.map(serializeLocation) });
  } catch (err: any) {
    console.error("Paper locations list error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load locations" }, { status: 500 });
  }
}

/*
 * POST /api/paper/locations
 * { cityId, place: {placeId,name,formattedAddress,types,lat,lng}, label, area,
 *   defaultQuantity, instructions, contact, availability, status, confirmDuplicate? }
 * `place` is what /api/paper/places/details returned moments earlier.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const cityId = cleanString(body.cityId, 100);
    const placeId = cleanString(body.place?.placeId, 300);
    const lat = Number(body.place?.lat);
    const lng = Number(body.place?.lng);

    if (!cityId || !placeId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Pick a place from the search results" }, { status: 400 });
    }

    const fields = parseLocationFields(body, false);
    if (typeof fields === "string") {
      return NextResponse.json({ error: fields }, { status: 400 });
    }

    const { cities, locations } = await paperCollections();

    if (!(await cities.findOne({ _id: cityId }, { projection: { _id: 1 } }))) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    // The UI shows look-alikes before saving; the exact same place needs confirmation.
    const samePlace = await locations.findOne({ city_id: cityId, "google.place_id": placeId });
    if (samePlace && body.confirmDuplicate !== true) {
      return NextResponse.json(
        {
          error: `This place is already in the directory as “${samePlace.label}” (${samePlace.status})`,
          code: "duplicate",
          existing: serializeLocation(samePlace),
        },
        { status: 409 },
      );
    }

    const now = new Date();
    const doc = {
      city_id: cityId,
      ...(fields as any),
      google: {
        place_id: placeId,
        name: cleanString(body.place?.name, 200),
        formatted_address: cleanString(body.place?.formattedAddress, 300),
        types: Array.isArray(body.place?.types)
          ? body.place.types.slice(0, 20).map((t: unknown) => cleanString(t, 60))
          : [],
      },
      location: toPoint(lat, lng),
      location_fetched_at: now,
      created_by: user,
      created_at: now,
      updated_by: user,
      updated_at: now,
    };

    const result = await locations.insertOne(doc);
    await recordAudit({
      entity: "location",
      entity_id: String(result.insertedId),
      action: "created",
      by: user,
    });

    return NextResponse.json({ location: serializeLocation({ ...doc, _id: result.insertedId }) });
  } catch (err: any) {
    console.error("Paper location create error:", err);
    return NextResponse.json({ error: err?.message || "Failed to add location" }, { status: 500 });
  }
}
