import type { Collection, Db, ObjectId } from "mongodb";

import { getDb } from "@/lib/api/mongo";
import { getSignedInUser, type SignedInUser } from "@/lib/outreach";

/*
 * Newspaper distribution: drop-location directory + route planning.
 * Separate database from the voter data. See docs/knowledge/data-model.md.
 *
 * Stage 1–2 collections: cities, locations, route_templates, audit_events.
 * Planned later: editions, delivery_runs (snapshots of route_templates).
 */

export const PAPER_DB = "paper_distribution";

/*
 * Google Maps Platform terms: Place IDs may be stored indefinitely, but
 * coordinates from Places may only be cached for 30 days. We refresh them
 * from the Place ID before that.
 */
export const COORDINATE_MAX_AGE_MS = 29 * 24 * 60 * 60 * 1000;

/* Routes API limit for intermediate waypoints in one request. */
export const MAX_ROUTE_STOPS = 25;

export const LOCATION_STATUSES = ["active", "paused", "inactive"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type AuditUser = { clerk_user_id: string; name: string };

export type GeoPoint = { type: "Point"; coordinates: [number, number] }; // [lng, lat]

export type GooglePlaceRef = {
  place_id: string;
  name: string;
  formatted_address: string;
  types: string[];
};

export type CityDocument = {
  _id: string; // slug, e.g. "san_ramon_ca"
  name: string;
  state: string;
  google: GooglePlaceRef;
  center: GeoPoint;
  location_fetched_at: Date;
  depot: RoutePoint | null; // default route start
  created_by: AuditUser;
  created_at: Date;
  updated_by: AuditUser;
  updated_at: Date;
};

export type LocationDocument = {
  _id?: ObjectId;
  city_id: string;
  label: string;
  area: string;
  google: GooglePlaceRef;
  location: GeoPoint;
  location_fetched_at: Date;
  default_quantity: number;
  instructions: string;
  contact: { name: string; phone: string };
  availability: { days: Weekday[]; hours: string };
  status: LocationStatus;
  created_by: AuditUser;
  created_at: Date;
  updated_by: AuditUser;
  updated_at: Date;
};

/* A route start/finish: the city depot, a directory location, or any address. */
export type RoutePoint = {
  type: "depot" | "location" | "address";
  label: string;
  location_id?: string;
  place_id?: string;
  formatted_address?: string;
  location: GeoPoint;
  fetched_at?: Date; // when location came from Google (place_id set)
};

export type RouteTemplateStop = {
  location_id: string;
  quantity: number | null; // null → location default
  stop_minutes: number | null; // null → route default
};

export type RouteTemplateDocument = {
  _id?: ObjectId;
  city_id: string;
  name: string;
  status: "active" | "archived";
  stops: RouteTemplateStop[]; // saved order
  start: RoutePoint;
  finish: { return_to_start: boolean; point: RoutePoint | null };
  optimize: boolean;
  default_stop_minutes: number;
  last_summary: {
    distance_meters: number;
    drive_seconds: number;
    computed_at: Date;
  } | null;
  created_by: AuditUser;
  created_at: Date;
  updated_by: AuditUser;
  updated_at: Date;
};

export type AuditEventDocument = {
  entity: "city" | "location" | "route_template";
  entity_id: string;
  action: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  by: AuditUser;
  at: Date;
};

declare global {
  // eslint-disable-next-line no-var
  var _paperIndexesPromise: Promise<void> | undefined;
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("locations").createIndex({ city_id: 1, status: 1, label: 1 }),
    db.collection("locations").createIndex({ city_id: 1, "google.place_id": 1 }),
    db.collection("locations").createIndex({ location: "2dsphere" }),
    db.collection("locations").createIndex({ location_fetched_at: 1 }),
    db.collection("route_templates").createIndex({ city_id: 1, status: 1, name: 1 }),
    db.collection("route_templates").createIndex({ "stops.location_id": 1 }),
    db.collection("audit_events").createIndex({ entity: 1, entity_id: 1, at: -1 }),
  ]);
}

export async function getPaperDb() {
  const db = await getDb(PAPER_DB);

  if (!global._paperIndexesPromise) {
    global._paperIndexesPromise = ensureIndexes(db).catch((err) => {
      global._paperIndexesPromise = undefined;
      console.error("Paper distribution index creation failed:", err);
    });
  }

  await global._paperIndexesPromise;
  return db;
}

export async function paperCollections() {
  const db = await getPaperDb();
  return {
    db,
    cities: db.collection<CityDocument>("cities") as Collection<CityDocument>,
    locations: db.collection<LocationDocument>("locations"),
    routeTemplates: db.collection<RouteTemplateDocument>("route_templates"),
    audit: db.collection<AuditEventDocument>("audit_events"),
  };
}

export async function requireUser(): Promise<AuditUser | null> {
  const user: SignedInUser | null = await getSignedInUser();
  return user ? { clerk_user_id: user.id, name: user.name } : null;
}

export async function recordAudit(event: Omit<AuditEventDocument, "at">) {
  const { audit } = await paperCollections();
  await audit.insertOne({ ...event, at: new Date() });
}

/* Field-level diff for audit events (top-level keys only). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] };
    }
  }
  return changes;
}

export function cleanString(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toPoint(lat: number, lng: number): GeoPoint {
  return { type: "Point", coordinates: [lng, lat] };
}

export function fromPoint(point: GeoPoint) {
  return { lat: point.coordinates[1], lng: point.coordinates[0] };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/* Distance in meters between two lat/lng pairs. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Editable fields shared by create and update. Returns an error string or the fields. */
export function parseLocationFields(body: any, partial: boolean) {
  const out: Record<string, unknown> = {};

  if (!partial || "label" in body) {
    const label = cleanString(body.label, 120);
    if (!label) return "Label is required";
    out.label = label;
  }
  if (!partial || "area" in body) out.area = cleanString(body.area, 80);
  if (!partial || "defaultQuantity" in body) {
    const q = Number(body.defaultQuantity ?? 0);
    if (!Number.isInteger(q) || q < 0 || q > 10000) return "Default quantity must be 0–10000";
    out.default_quantity = q;
  }
  if (!partial || "instructions" in body) out.instructions = cleanString(body.instructions, 1000);
  if (!partial || "contact" in body) {
    out.contact = {
      name: cleanString(body.contact?.name, 120),
      phone: cleanString(body.contact?.phone, 40),
    };
  }
  if (!partial || "availability" in body) {
    const days = Array.isArray(body.availability?.days)
      ? (body.availability.days as unknown[]).filter((d): d is Weekday =>
          WEEKDAYS.includes(d as Weekday),
        )
      : [];
    out.availability = { days, hours: cleanString(body.availability?.hours, 120) };
  }
  if (!partial || "status" in body) {
    const status = (body.status ?? "active") as LocationStatus;
    if (!LOCATION_STATUSES.includes(status)) return "Invalid status";
    out.status = status;
  }

  return out;
}

/* ---------------- Google Places (New), server-side ---------------- */

function placesKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is missing");
  return key;
}

export type PlaceDetails = {
  placeId: string;
  name: string;
  formattedAddress: string;
  types: string[];
  lat: number;
  lng: number;
  city: string;
  state: string;
};

const DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "addressComponents",
].join(",");

export async function fetchPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails> {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": placesKey(), "X-Goog-FieldMask": DETAILS_FIELDS },
    cache: "no-store",
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || "Google place lookup failed");
  }

  const components: any[] = data.addressComponents || [];
  const find = (type: string, short = false) => {
    const c = components.find((x) => x.types?.includes(type));
    return (short ? c?.shortText : c?.longText) || "";
  };

  return {
    placeId: data.id,
    name: data.displayName?.text || "",
    formattedAddress: data.formattedAddress || "",
    types: data.types || [],
    lat: Number(data.location?.latitude),
    lng: Number(data.location?.longitude),
    city: find("locality") || find("postal_town") || find("sublocality"),
    state: find("administrative_area_level_1", true),
  };
}

/*
 * Refresh coordinates older than COORDINATE_MAX_AGE_MS from their Place IDs.
 * Called in the background (after()) when a city's locations are listed.
 */
export async function refreshStaleCoordinates(cityId: string, limit = 25) {
  const { locations, cities } = await paperCollections();
  const cutoff = new Date(Date.now() - COORDINATE_MAX_AGE_MS);

  const city = await cities.findOne({ _id: cityId, location_fetched_at: { $lt: cutoff } });
  if (city) {
    try {
      const d = await fetchPlaceDetails(city.google.place_id);
      await cities.updateOne(
        { _id: city._id },
        { $set: { center: toPoint(d.lat, d.lng), location_fetched_at: new Date() } },
      );
    } catch (err) {
      console.error("City coordinate refresh failed:", cityId, err);
    }
  }

  // Depot and saved route start/finish points that came from Google.
  async function refreshPoint(point: RoutePoint | null | undefined) {
    if (!point?.place_id || point.type === "location") return null;
    if (point.fetched_at && point.fetched_at >= cutoff) return null;
    const d = await fetchPlaceDetails(point.place_id);
    return { ...point, location: toPoint(d.lat, d.lng), fetched_at: new Date() };
  }

  try {
    const cityDoc = await cities.findOne({ _id: cityId });
    const depot = await refreshPoint(cityDoc?.depot);
    if (depot) await cities.updateOne({ _id: cityId }, { $set: { depot } });

    const { routeTemplates } = await paperCollections();
    const templates = await routeTemplates
      .find({
        city_id: cityId,
        $or: [
          { "start.place_id": { $exists: true }, "start.fetched_at": { $not: { $gte: cutoff } } },
          { "finish.point.place_id": { $exists: true }, "finish.point.fetched_at": { $not: { $gte: cutoff } } },
        ],
      })
      .limit(limit)
      .toArray();

    for (const t of templates) {
      const start = await refreshPoint(t.start);
      const finishPoint = await refreshPoint(t.finish.point);
      if (start || finishPoint) {
        await routeTemplates.updateOne(
          { _id: t._id },
          {
            $set: {
              ...(start ? { start } : {}),
              ...(finishPoint ? { "finish.point": finishPoint } : {}),
            },
          },
        );
      }
    }
  } catch (err) {
    console.error("Route point refresh failed:", cityId, err);
  }

  const stale = await locations
    .find({ city_id: cityId, location_fetched_at: { $lt: cutoff } })
    .limit(limit)
    .toArray();

  for (const loc of stale) {
    try {
      const d = await fetchPlaceDetails(loc.google.place_id);
      await locations.updateOne(
        { _id: loc._id },
        {
          $set: {
            location: toPoint(d.lat, d.lng),
            location_fetched_at: new Date(),
            "google.formatted_address": d.formattedAddress || loc.google.formatted_address,
          },
        },
      );
    } catch (err) {
      console.error("Location coordinate refresh failed:", String(loc._id), err);
    }
  }
}

/* ---------------- Serialization ---------------- */

export function serializeCity(city: CityDocument) {
  return {
    id: city._id,
    name: city.name,
    state: city.state,
    placeId: city.google.place_id,
    center: fromPoint(city.center),
    depot: city.depot ? serializeRoutePoint(city.depot) : null,
  };
}

export function serializeRoutePoint(point: RoutePoint) {
  return {
    type: point.type,
    label: point.label,
    locationId: point.location_id ?? null,
    placeId: point.place_id ?? null,
    formattedAddress: point.formatted_address ?? "",
    ...fromPoint(point.location),
  };
}

export function serializeLocation(loc: LocationDocument) {
  return {
    id: String(loc._id),
    cityId: loc.city_id,
    label: loc.label,
    area: loc.area,
    placeId: loc.google.place_id,
    googleName: loc.google.name,
    address: loc.google.formatted_address,
    types: loc.google.types,
    ...fromPoint(loc.location),
    defaultQuantity: loc.default_quantity,
    instructions: loc.instructions,
    contact: loc.contact,
    availability: loc.availability,
    status: loc.status,
    updatedAt: loc.updated_at?.toISOString() ?? null,
    updatedBy: loc.updated_by?.name ?? null,
  };
}

export function serializeRouteTemplate(route: RouteTemplateDocument) {
  return {
    id: String(route._id),
    cityId: route.city_id,
    name: route.name,
    status: route.status,
    stops: route.stops.map((s) => ({
      locationId: s.location_id,
      quantity: s.quantity,
      stopMinutes: s.stop_minutes,
    })),
    start: serializeRoutePoint(route.start),
    finish: {
      returnToStart: route.finish.return_to_start,
      point: route.finish.point ? serializeRoutePoint(route.finish.point) : null,
    },
    optimize: route.optimize,
    defaultStopMinutes: route.default_stop_minutes,
    lastSummary: route.last_summary
      ? {
          distanceMeters: route.last_summary.distance_meters,
          driveSeconds: route.last_summary.drive_seconds,
          computedAt: route.last_summary.computed_at.toISOString(),
        }
      : null,
    updatedAt: route.updated_at?.toISOString() ?? null,
    updatedBy: route.updated_by?.name ?? null,
  };
}

export type SerializedCity = ReturnType<typeof serializeCity>;
export type SerializedLocation = ReturnType<typeof serializeLocation>;
export type SerializedRoutePoint = ReturnType<typeof serializeRoutePoint>;
export type SerializedRouteTemplate = ReturnType<typeof serializeRouteTemplate>;

/* Validate a client-supplied route point ({type,label,lat,lng,...}). */
export function parseRoutePoint(raw: any): RoutePoint | null {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type;
  if (!["depot", "location", "address"].includes(type)) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return {
    type,
    label: cleanString(raw.label, 200) || "Start",
    ...(raw.locationId ? { location_id: cleanString(raw.locationId, 50) } : {}),
    ...(raw.placeId ? { place_id: cleanString(raw.placeId, 300) } : {}),
    ...(raw.formattedAddress ? { formatted_address: cleanString(raw.formattedAddress, 300) } : {}),
    location: toPoint(lat, lng),
  };
}

/*
 * Server-authoritative coordinates for a route point:
 *  - "location": taken from the directory entry (kept fresh separately)
 *  - with a Place ID: fetched now from Google, so the 30-day clock is real
 *  - otherwise: as supplied (e.g. a dropped pin) — no Google data cached
 */
export async function resolveRoutePoint(raw: any): Promise<RoutePoint | null> {
  const point = parseRoutePoint(raw);
  if (!point) return null;

  if (point.type === "location" && point.location_id) {
    const { locations } = await paperCollections();
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(point.location_id)) return null;
    const loc = await locations.findOne({ _id: new ObjectId(point.location_id) });
    if (!loc) return null;
    return {
      ...point,
      label: point.label || loc.label,
      place_id: loc.google.place_id,
      formatted_address: loc.google.formatted_address,
      location: loc.location,
    };
  }

  if (point.place_id) {
    const d = await fetchPlaceDetails(point.place_id);
    return {
      ...point,
      formatted_address: d.formattedAddress || point.formatted_address,
      location: toPoint(d.lat, d.lng),
      fetched_at: new Date(),
    };
  }

  return point;
}

/*
 * Saved-route fields shared by create (partial=false) and update (partial=true).
 * Returns an error string, or the Mongo fields to $set.
 */
export async function parseRouteTemplateFields(
  body: any,
  partial: boolean,
  cityDepot: RoutePoint | null,
): Promise<Record<string, unknown> | string> {
  const out: Record<string, unknown> = {};

  if (!partial || "name" in body) {
    const name = cleanString(body.name, 120);
    if (!name) return "Route name is required";
    out.name = name;
  }

  if (!partial || "stops" in body) {
    if (!Array.isArray(body.stops) || body.stops.length === 0) return "A route needs at least one stop";
    if (body.stops.length > MAX_ROUTE_STOPS) return `At most ${MAX_ROUTE_STOPS} stops per route`;

    const stops: RouteTemplateStop[] = [];
    for (const raw of body.stops) {
      const id = cleanString(raw?.locationId, 50);
      if (!id) return "Invalid stop";
      const quantity = raw?.quantity == null || raw.quantity === "" ? null : Number(raw.quantity);
      const minutes = raw?.stopMinutes == null || raw.stopMinutes === "" ? null : Number(raw.stopMinutes);
      if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000)) {
        return "Stop quantity must be 0–10000";
      }
      if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 240)) {
        return "Stop minutes must be 0–240";
      }
      stops.push({ location_id: id, quantity, stop_minutes: minutes });
    }
    if (new Set(stops.map((s) => s.location_id)).size !== stops.length) return "A stop is listed twice";
    out.stops = stops;
  }

  const resolve = async (raw: any) => (raw?.type === "depot" ? cityDepot : resolveRoutePoint(raw));

  if (!partial || "start" in body) {
    const start = await resolve(body.start);
    if (!start) return "Choose a valid starting point";
    out.start = start;
  }

  if (!partial || "finish" in body) {
    const returnToStart = body.finish?.returnToStart !== false;
    const point = returnToStart ? null : await resolve(body.finish?.point);
    if (!returnToStart && !point) return "Choose a valid finishing point";
    out.finish = { return_to_start: returnToStart, point };
  }

  if (!partial || "optimize" in body) out.optimize = body.optimize === true;

  if (!partial || "defaultStopMinutes" in body) {
    const m = Number(body.defaultStopMinutes ?? 3);
    if (!Number.isFinite(m) || m < 0 || m > 240) return "Default stop time must be 0–240 minutes";
    out.default_stop_minutes = m;
  }

  if (!partial || "lastSummary" in body) {
    const d = Number(body.lastSummary?.distanceMeters);
    const t = Number(body.lastSummary?.driveSeconds);
    out.last_summary =
      Number.isFinite(d) && Number.isFinite(t)
        ? { distance_meters: d, drive_seconds: t, computed_at: new Date() }
        : null;
  }

  return out;
}
