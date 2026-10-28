import { NextRequest, NextResponse } from "next/server";

import {
  cleanString,
  escapeRegex,
  fetchPlaceDetails,
  paperCollections,
  requireUser,
  serializeLocation,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

const DUPLICATE_RADIUS_METERS = 40;
const EARTH_RADIUS_METERS = 6378100;

/*
 * POST /api/paper/places/details { placeId, sessionToken, cityId? }
 * Place details (ends the autocomplete session). With cityId, also returns
 * directory locations that look like duplicates: same Place ID, within 40 m,
 * or the same name.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const placeId = cleanString(body.placeId, 300);
    const sessionToken = cleanString(body.sessionToken, 100);
    const cityId = cleanString(body.cityId, 100);

    if (!placeId) {
      return NextResponse.json({ error: "placeId is required" }, { status: 400 });
    }

    const place = await fetchPlaceDetails(placeId, sessionToken || undefined);

    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
      return NextResponse.json({ error: "Google returned no coordinates for this place" }, { status: 422 });
    }

    let duplicates: ReturnType<typeof serializeLocation>[] = [];

    if (cityId) {
      const { locations } = await paperCollections();
      const candidates = await locations
        .find({
          city_id: cityId,
          $or: [
            { "google.place_id": placeId },
            {
              // $geoWithin (unlike $nearSphere) is allowed inside $or.
              location: {
                $geoWithin: {
                  $centerSphere: [[place.lng, place.lat], DUPLICATE_RADIUS_METERS / EARTH_RADIUS_METERS],
                },
              },
            },
            ...(place.name
              ? [{ label: { $regex: `^${escapeRegex(place.name)}$`, $options: "i" } }]
              : []),
          ],
        })
        .limit(10)
        .toArray();

      duplicates = candidates.map(serializeLocation);
    }

    return NextResponse.json({ place, duplicates });
  } catch (err: any) {
    console.error("Place details error:", err);
    return NextResponse.json({ error: err?.message || "Place lookup failed" }, { status: 500 });
  }
}
