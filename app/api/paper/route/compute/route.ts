import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import {
  MAX_ROUTE_STOPS,
  RouteError,
  cleanString,
  computeDriveRoute,
  fromPoint,
  paperCollections,
  requireUser,
  resolveRoutePoint,
  type RoutePoint,
} from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * POST /api/paper/route/compute
 * { cityId, start, finish: { returnToStart, point }, stops: [locationId, …],
 *   optimize, firstStopId?, lastStopId?, departureTime? }
 * With optimize, Google orders the stops; a fixed first/last stop stays put.
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

    const firstId = cleanString(body.firstStopId, 50) || null;
    const lastId = cleanString(body.lastStopId, 50) || null;
    if ((firstId && !stopIds.includes(firstId)) || (lastId && !stopIds.includes(lastId))) {
      return NextResponse.json({ error: "The first/last stop must be one of the selected stops" }, { status: 400 });
    }
    if (firstId && firstId === lastId) {
      return NextResponse.json({ error: "First and last stop must be different" }, { status: 400 });
    }

    const departure = body.departureTime ? new Date(body.departureTime) : null;

    let result;
    try {
      result = await computeDriveRoute({
        start: fromPoint(start.location),
        finish: fromPoint(finish.location),
        stops: stopIds.map((id) => ({ id, point: fromPoint(byId.get(id)!.location) })),
        optimize,
        firstId,
        lastId,
        departure,
      });
    } catch (err) {
      if (err instanceof RouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    return NextResponse.json({
      ...result, // legs[i] = drive to stop i; last leg = to finish
      start: { label: start.label, ...fromPoint(start.location) },
      finish: { label: finish.label, ...fromPoint(finish.location) },
    });
  } catch (err: any) {
    console.error("Paper route compute error:", err);
    return NextResponse.json({ error: err?.message || "Failed to calculate route" }, { status: 500 });
  }
}
