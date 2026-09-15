import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

export const runtime = "nodejs";
type RouteVoterDocument = {
  _id: string;

  residence?: {
    city?: string;

    location?: {
      type: "Point";
      coordinates: [number, number];
    };
  };

  flags?: {
    super_voter?: boolean;
    frequent_voter?: boolean;
  };
};
type Coordinate = {
  lat: number;
  lng: number;
};

function durationToSeconds(duration?: string) {
  if (!duration) {
    return 0;
  }

  return Number(duration.replace("s", "")) || 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const lat = Number(body.origin?.lat);
    const lng = Number(body.origin?.lng);

    const voterIds: string[] = Array.isArray(body.voterIds)
      ? body.voterIds
      : [];

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return NextResponse.json(
        {
          error: "Invalid starting location",
        },
        {
          status: 400,
        },
      );
    }

    if (voterIds.length < 1) {
      return NextResponse.json(
        {
          error: "No address stops were provided",
        },
        {
          status: 400,
        },
      );
    }

    if (voterIds.length > 10) {
      return NextResponse.json(
        {
          error: "Maximum 10 address stops per route",
        },
        {
          status: 400,
        },
      );
    }

    const apiKey = process.env.GOOGLE_ROUTES_API_KEY;

    if (!apiKey) {
      throw new Error("GOOGLE_ROUTES_API_KEY is missing");
    }

    const db = await getDb("voter_db_v2");

    const docs = await db
      .collection<RouteVoterDocument>("voters")
      .find(
        {
          _id: {
            $in: voterIds,
          },
          "residence.city": "San Ramon",
          $or: [
            {
              "flags.super_voter": true,
            },
            {
              "flags.frequent_voter": true,
            },
          ],
          "residence.location": {
            $exists: true,
          },
        },
        {
          projection: {
            _id: 1,
            "residence.location": 1,
          },
        },
      )
      .toArray();

    const voterMap = new Map(
      docs.map((voter) => [String(voter._id), voter]),
    );

    const orderedDocs = voterIds
      .map((id) => voterMap.get(id))
      .filter(Boolean);

    if (orderedDocs.length !== voterIds.length) {
      return NextResponse.json(
        {
          error:
            "One or more address stops no longer have valid San Ramon coordinates",
        },
        {
          status: 400,
        },
      );
    }

    const intermediates = orderedDocs.map((voter: any) => {
      const coordinates = voter.residence?.location?.coordinates;

      if (!coordinates || coordinates.length !== 2) {
        throw new Error(`Missing coordinates for ${String(voter._id)}`);
      }

      const stopLng = Number(coordinates[0]);
      const stopLat = Number(coordinates[1]);

      if (!Number.isFinite(stopLat) || !Number.isFinite(stopLng)) {
        throw new Error(`Invalid coordinates for ${String(voter._id)}`);
      }

      return {
        location: {
          latLng: {
            latitude: stopLat,
            longitude: stopLng,
          },
        },
      };
    });

    const googleBody = {
      origin: {
        location: {
          latLng: {
            latitude: lat,
            longitude: lng,
          },
        },
      },

      destination: {
        location: {
          latLng: {
            latitude: lat,
            longitude: lng,
          },
        },
      },

      intermediates,

      travelMode: "WALK",

      optimizeWaypointOrder: true,

      polylineQuality: "HIGH_QUALITY",

      polylineEncoding: "GEO_JSON_LINESTRING",

      units: "IMPERIAL",
    };

    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Server-Timeout": "10",
          "X-Goog-FieldMask": [
            "routes.distanceMeters",
            "routes.duration",
            "routes.polyline.geoJsonLinestring",
            "routes.optimizedIntermediateWaypointIndex",
            "routes.legs.distanceMeters",
            "routes.legs.duration",
            "routes.warnings",
          ].join(","),
        },

        body: JSON.stringify(googleBody),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Google Routes API:", data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Google could not create the walking route",
        },
        {
          status: 500,
        },
      );
    }

    const route = data.routes?.[0];

    if (!route) {
      return NextResponse.json(
        {
          error: "No walking route was found",
        },
        {
          status: 404,
        },
      );
    }

    const optimizedIndexes: number[] =
      Array.isArray(route.optimizedIntermediateWaypointIndex) &&
      route.optimizedIntermediateWaypointIndex.length === voterIds.length
        ? route.optimizedIntermediateWaypointIndex
        : voterIds.map((_, index) => index);

    const optimizedVoterIds = optimizedIndexes.map(
      (index) => voterIds[index],
    );

    const geoJson = route.polyline?.geoJsonLinestring;

    const routePath: Coordinate[] = (geoJson?.coordinates || []).map(
      (coordinate: number[]) => ({
        lng: Number(coordinate[0]),
        lat: Number(coordinate[1]),
      }),
    );

    const legs = (route.legs || []).map((leg: any) => ({
      distanceMeters: Number(leg.distanceMeters || 0),
      durationSeconds: durationToSeconds(leg.duration),
    }));

    return NextResponse.json({
      orderedVoterIds: optimizedVoterIds,
      routePath,
      distanceMeters: Number(route.distanceMeters || 0),
      durationSeconds: durationToSeconds(route.duration),
      legs,
      warnings: Array.isArray(route.warnings) ? route.warnings : [],
      returnLeg: legs.length ? legs[legs.length - 1] : null,
    });
  } catch (err: any) {
    console.error("Walking route error:", err);

    return NextResponse.json(
      {
        error: err?.message || "Failed to create walking route",
      },
      {
        status: 500,
      },
    );
  }
}
