import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  MAX_ROUTE_STOPS,
  cleanString,
  fromPoint,
  paperCollections,
  requireUser,
  resolveRoutePoint,
  type RoutePoint,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

function durationToSeconds(duration?: string) {
  return duration ? Number(duration.replace("s", "")) || 0 : 0;
}

function waypoint(point: { lat: number; lng: number }) {
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

/*
 * POST /api/paper/route/compute
 * { cityId, start, finish: { returnToStart, point }, stops: [locationId, …],
 *   optimize, departureTime? }
 *
 * Stops are taken from the directory (never client coordinates). If any stop
 * can't be routed, nothing is sent to Google and the problem stops are listed.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const cityId = cleanString(body.cityId, 100);
    const stopIds: string[] = Array.isArray(body.stops)
      ? body.stops.map((s: unknown) => cleanString(s, 50)).filter(Boolean)
      : [];
    const optimize = body.optimize === true;

    if (stopIds.length === 0) {
      return NextResponse.json({ error: "Select at least one stop" }, { status: 400 });
    }
    if (stopIds.length > MAX_ROUTE_STOPS) {
      return NextResponse.json(
        { error: `Google allows at most ${MAX_ROUTE_STOPS} stops per route — split it into two routes` },
        { status: 400 },
      );
    }
    if (new Set(stopIds).size !== stopIds.length) {
      return NextResponse.json({ error: "A stop is listed twice" }, { status: 400 });
    }

    const { cities, locations } = await paperCollections();
    const city = await cities.findOne({ _id: cityId });
    if (!city) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    // Depot comes from the city record (kept fresh there); others are resolved now.
    const resolvePoint = async (raw: any): Promise<RoutePoint | null> =>
      raw?.type === "depot" ? city.depot : resolveRoutePoint(raw);

    const start = await resolvePoint(body.start);
    if (!start) {
      return NextResponse.json({ error: "Choose a valid starting point" }, { status: 400 });
    }

    const returnToStart = body.finish?.returnToStart !== false;
    const finish = returnToStart ? start : await resolvePoint(body.finish?.point);
    if (!finish) {
      return NextResponse.json({ error: "Choose a valid finishing point" }, { status: 400 });
    }

    const validIds = stopIds.filter((id) => ObjectId.isValid(id));
    const docs = await locations
      .find({ _id: { $in: validIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const byId = new Map(docs.map((d) => [String(d._id), d]));

    const unroutable = stopIds.flatMap((id) => {
      const doc = byId.get(id);
      if (!doc) return [{ locationId: id, label: "Unknown location", reason: "Not found in the directory" }];
      if (doc.city_id !== cityId) return [{ locationId: id, label: doc.label, reason: "Belongs to another city" }];
      if (doc.status === "inactive") return [{ locationId: id, label: doc.label, reason: "Location is inactive" }];
      const c = doc.location?.coordinates;
      if (!c || c.length !== 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
        return [{ locationId: id, label: doc.label, reason: "Missing coordinates" }];
      }
      return [];
    });

    if (unroutable.length) {
      return NextResponse.json(
        { error: "Some stops can't be routed", code: "unroutable", unroutable },
        { status: 422 },
      );
    }

    const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_ROUTES_API_KEY is missing");

    const departure = body.departureTime ? new Date(body.departureTime) : null;
    const useTraffic = departure && !Number.isNaN(departure.getTime()) && departure.getTime() > Date.now() + 60_000;

    const googleBody = {
      origin: waypoint(fromPoint(start.location)),
      destination: waypoint(fromPoint(finish.location)),
      intermediates: stopIds.map((id) => waypoint(fromPoint(byId.get(id)!.location))),
      travelMode: "DRIVE",
      routingPreference: useTraffic ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
      ...(useTraffic ? { departureTime: departure!.toISOString() } : {}),
      optimizeWaypointOrder: optimize && stopIds.length > 1,
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "GEO_JSON_LINESTRING",
      units: "IMPERIAL",
    };

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
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
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Google Routes API:", data);
      return NextResponse.json(
        { error: data?.error?.message || "Google could not create the route" },
        { status: 502 },
      );
    }

    const route = data.routes?.[0];
    if (!route) {
      return NextResponse.json(
        { error: "Google found no driving route through these stops" },
        { status: 404 },
      );
    }

    const order: number[] =
      googleBody.optimizeWaypointOrder &&
      Array.isArray(route.optimizedIntermediateWaypointIndex) &&
      route.optimizedIntermediateWaypointIndex.length === stopIds.length
        ? route.optimizedIntermediateWaypointIndex
        : stopIds.map((_, i) => i);

    const legs = (route.legs || []).map((leg: any) => ({
      distanceMeters: Number(leg.distanceMeters || 0),
      durationSeconds: durationToSeconds(leg.duration),
    }));

    return NextResponse.json({
      orderedLocationIds: order.map((i) => stopIds[i]),
      path: (route.polyline?.geoJsonLinestring?.coordinates || []).map((c: number[]) => ({
        lng: Number(c[0]),
        lat: Number(c[1]),
      })),
      distanceMeters: Number(route.distanceMeters || 0),
      driveSeconds: durationToSeconds(route.duration),
      legs, // legs[i] = drive to stop i; last leg = to finish
      trafficAware: Boolean(useTraffic),
      start: { label: start.label, ...fromPoint(start.location) },
      finish: { label: finish.label, ...fromPoint(finish.location) },
      warnings: Array.isArray(route.warnings) ? route.warnings : [],
    });
  } catch (err: any) {
    console.error("Paper route compute error:", err);
    return NextResponse.json({ error: err?.message || "Failed to calculate route" }, { status: 500 });
  }
}
