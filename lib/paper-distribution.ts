import type { Collection, Db, ObjectId } from "mongodb";
import { clerkClient, currentUser } from "@clerk/nextjs/server";

import { getRole, type Role } from "@/lib/access";
import { getDb } from "@/lib/api/mongo";

/*
 * Newspaper distribution: drop-location directory + route planning.
 * Separate database from the voter data. See docs/knowledge/data-model.md.
 *
 * Planning: cities, locations, route_templates.
 * Delivering: editions (weekly issue/round) → delivery_runs (a driver trip,
 * snapshot of a route) → stop_deliveries (one per location per run: papers
 * dropped + old papers picked up). audit_events records changes.
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

/*
 * A route start/finish: the city depot, a directory location, any address, or
 * the device's GPS position ("current" — captured when the route was planned;
 * not Google data, so no refresh needed).
 */
export type RoutePoint = {
  type: "depot" | "location" | "address" | "current";
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
  // Fixed first / last stop when optimizing (Google orders the rest).
  first_location_id?: string | null;
  last_location_id?: string | null;
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
  entity: "city" | "location" | "route_template" | "edition" | "delivery_run" | "stop_delivery";
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
    db.collection("editions").createIndex({ city_id: 1, publish_date: -1 }),
    db.collection("delivery_runs").createIndex({ edition_id: 1 }),
    db.collection("delivery_runs").createIndex({ "driver.clerk_user_id": 1, status: 1 }),
    db.collection("stop_deliveries").createIndex({ run_id: 1, location_id: 1 }, { unique: true }),
    db.collection("stop_deliveries").createIndex({ edition_id: 1, location_id: 1 }),
    db.collection("stop_deliveries").createIndex({ location_id: 1, recorded_at: -1 }),
    db.collection("stop_deliveries").createIndex({ city_id: 1, publish_date: -1 }),
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
    editions: db.collection<EditionDocument>("editions"),
    runs: db.collection<DeliveryRunDocument>("delivery_runs"),
    stopDeliveries: db.collection<StopDeliveryDocument>("stop_deliveries"),
  };
}

export type PaperUser = AuditUser & { role: Role };

/* Signed-in user with their role (Clerk publicMetadata.role), or null. */
export async function requireUser(): Promise<PaperUser | null> {
  const user = await currentUser();
  if (!user) return null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    "Unknown user";

  return { clerk_user_id: user.id, name, role: getRole(user.publicMetadata) };
}

export function canDispatch(user: PaperUser) {
  return user.role === "admin" || user.role === "dispatcher";
}

/* The audit fields stored on documents (no role). */
export function auditUser(user: PaperUser): AuditUser {
  return { clerk_user_id: user.clerk_user_id, name: user.name };
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


/* ---------------- Editions, runs, stop deliveries ---------------- */

export const EDITION_STATUSES = ["planning", "distributing", "closed"] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];

/* One publication issue / weekly round in one city. */
export type EditionDocument = {
  _id?: ObjectId;
  city_id: string;
  name: string; // e.g. "Week of Oct 27"
  publish_date: Date; // date of the round
  copies_available: number;
  status: EditionStatus;
  notes: string;
  created_by: AuditUser;
  created_at: Date;
  updated_by: AuditUser;
  updated_at: Date;
};

export const RUN_STATUSES = [
  "planned", // no driver yet
  "assigned",
  "in_progress",
  "interrupted", // driver stopped early; can resume
  "completed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/* Frozen copy of a stop at the moment the run was created. */
export type RunStopSnapshot = {
  location_id: string;
  sequence: number; // 1-based
  label: string;
  address: string;
  location: GeoPoint;
  instructions: string;
  contact: { name: string; phone: string };
  planned_quantity: number;
  stop_minutes: number;
};

export type DeliveryRunDocument = {
  _id?: ObjectId;
  edition_id: string;
  city_id: string;
  route_template_id: string | null;
  name: string;
  status: RunStatus;
  driver: AuditUser | null;
  snapshot: {
    start: RoutePoint;
    finish: RoutePoint;
    stops: RunStopSnapshot[];
    taken_at: Date;
  };
  // Copy accounting (run level). Old papers picked up are per stop.
  loaded_copies: number | null;
  returned_copies: number | null; // today's papers brought back
  damaged_copies: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  interrupted_reason: string;
  notes: string;
  created_by: AuditUser;
  created_at: Date;
  updated_by: AuditUser;
  updated_at: Date;
};

/* Reason set on stops still pending when a run is finished. */
export const AUTO_SKIP_REASON = "Not visited (run finished)";

export const STOP_DELIVERY_STATUSES = ["pending", "delivered", "partial", "skipped"] as const;
export type StopDeliveryStatus = (typeof STOP_DELIVERY_STATUSES)[number];

/*
 * One per location per run. The weekly record of what happened at a drop
 * location: new papers dropped and old papers picked up.
 */
export type StopDeliveryDocument = {
  _id?: ObjectId;
  run_id: string;
  edition_id: string;
  city_id: string;
  location_id: string;
  location_label: string; // snapshot, for history/reports
  publish_date: Date; // copied from the edition for fast history queries
  sequence: number;
  planned_quantity: number;
  status: StopDeliveryStatus;
  delivered_quantity: number | null; // new papers dropped
  picked_up_quantity: number | null; // old papers collected from this location
  reason: string; // required for partial / skipped
  notes: string;
  recorded_by: AuditUser | null;
  recorded_at: Date | null; // when the driver recorded it (device time)
  synced_at: Date | null; // when the server received it
  client_update_id: string | null; // idempotency key from the driver app
  corrections: {
    changes: Record<string, { from: unknown; to: unknown }>;
    reason: string;
    by: AuditUser;
    at: Date;
  }[];
};

export function serializeEdition(e: EditionDocument) {
  return {
    id: String(e._id),
    cityId: e.city_id,
    name: e.name,
    publishDate: e.publish_date.toISOString(),
    copiesAvailable: e.copies_available,
    status: e.status,
    notes: e.notes,
    updatedBy: e.updated_by?.name ?? null,
    updatedAt: e.updated_at?.toISOString() ?? null,
  };
}

export function serializeRun(r: DeliveryRunDocument) {
  return {
    id: String(r._id),
    editionId: r.edition_id,
    cityId: r.city_id,
    routeTemplateId: r.route_template_id,
    name: r.name,
    status: r.status,
    driver: r.driver ? { clerkUserId: r.driver.clerk_user_id, name: r.driver.name } : null,
    start: serializeRoutePoint(r.snapshot.start),
    finish: serializeRoutePoint(r.snapshot.finish),
    stops: r.snapshot.stops.map((s) => ({
      locationId: s.location_id,
      sequence: s.sequence,
      label: s.label,
      address: s.address,
      ...fromPoint(s.location),
      instructions: s.instructions,
      contact: s.contact,
      plannedQuantity: s.planned_quantity,
      stopMinutes: s.stop_minutes,
    })),
    snapshotAt: r.snapshot.taken_at.toISOString(),
    loadedCopies: r.loaded_copies,
    returnedCopies: r.returned_copies,
    damagedCopies: r.damaged_copies,
    startedAt: r.started_at?.toISOString() ?? null,
    completedAt: r.completed_at?.toISOString() ?? null,
    interruptedReason: r.interrupted_reason,
    notes: r.notes,
    updatedAt: r.updated_at?.toISOString() ?? null,
  };
}

export function serializeStopDelivery(d: StopDeliveryDocument) {
  return {
    id: String(d._id),
    runId: d.run_id,
    editionId: d.edition_id,
    locationId: d.location_id,
    locationLabel: d.location_label,
    publishDate: d.publish_date.toISOString(),
    sequence: d.sequence,
    plannedQuantity: d.planned_quantity,
    status: d.status,
    deliveredQuantity: d.delivered_quantity,
    pickedUpQuantity: d.picked_up_quantity,
    reason: d.reason,
    notes: d.notes,
    recordedBy: d.recorded_by?.name ?? null,
    recordedAt: d.recorded_at?.toISOString() ?? null,
    syncedAt: d.synced_at?.toISOString() ?? null,
    clientUpdateId: d.client_update_id,
    corrections: d.corrections.map((c) => ({
      changes: c.changes,
      reason: c.reason,
      by: c.by.name,
      at: c.at.toISOString(),
    })),
  };
}

export type SerializedEdition = ReturnType<typeof serializeEdition>;
export type SerializedRun = ReturnType<typeof serializeRun>;
export type SerializedStopDelivery = ReturnType<typeof serializeStopDelivery>;

export function cleanCount(value: unknown, max = 100000): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : "invalid";
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
    firstLocationId: route.first_location_id ?? null,
    lastLocationId: route.last_location_id ?? null,
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
  if (!["depot", "location", "address", "current"].includes(type)) return null;
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

  if (!partial || "firstLocationId" in body || "lastLocationId" in body) {
    const stopIds = new Set(
      ((out.stops as RouteTemplateStop[] | undefined) ?? []).map((s) => s.location_id),
    );
    const pin = (v: unknown) => {
      const id = cleanString(v, 50);
      // On partial updates without stops we can't check membership; keep as given.
      return id && (stopIds.size === 0 || stopIds.has(id)) ? id : null;
    };
    out.first_location_id = pin(body.firstLocationId);
    out.last_location_id = pin(body.lastLocationId);
    if (out.first_location_id && out.first_location_id === out.last_location_id) {
      return "First and last stop must be different";
    }
  }

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

/* ---------------- Runs: permissions + copy accounting ---------------- */

/* Drivers may only see and act on runs assigned to them. */
export function canAccessRun(user: PaperUser, run: DeliveryRunDocument) {
  return canDispatch(user) || run.driver?.clerk_user_id === user.clerk_user_id;
}

export async function loadRun(id: string) {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(id)) return null;
  const { runs } = await paperCollections();
  return runs.findOne({ _id: new ObjectId(id) });
}

/*
 * Copy accounting for one run.
 *   planned   = sum of stop allocations
 *   delivered = new papers dropped
 *   pickedUp  = old papers collected from locations (kept separate from returned)
 *   unaccounted = loaded − delivered − returned − damaged (once the run is done)
 */
export function runTotals(run: DeliveryRunDocument, stops: StopDeliveryDocument[]) {
  const planned = run.snapshot.stops.reduce((sum, s) => sum + s.planned_quantity, 0);
  const delivered = stops.reduce((sum, s) => sum + (s.delivered_quantity ?? 0), 0);
  const pickedUp = stops.reduce((sum, s) => sum + (s.picked_up_quantity ?? 0), 0);
  const counts = { pendingStops: 0, deliveredStops: 0, partialStops: 0, skippedStops: 0 };
  for (const s of stops) counts[`${s.status}Stops` as keyof typeof counts]++;

  const done = run.status === "completed";
  const unaccounted =
    done && run.loaded_copies != null
      ? run.loaded_copies - delivered - (run.returned_copies ?? 0) - (run.damaged_copies ?? 0)
      : null;

  return {
    stops: run.snapshot.stops.length,
    planned,
    loaded: run.loaded_copies,
    delivered,
    pickedUp,
    returned: run.returned_copies,
    damaged: run.damaged_copies,
    unaccounted,
    ...counts,
  };
}

export type RunTotals = ReturnType<typeof runTotals>;

/* ---------------- Drivers (Clerk users) ---------------- */

function displayName(u: { firstName: string | null; lastName: string | null; username: string | null; primaryEmailAddress?: { emailAddress: string } | null }) {
  return (
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
    u.username ||
    u.primaryEmailAddress?.emailAddress ||
    "Unknown user"
  );
}

/* Users who can be assigned a run: drivers, dispatchers and admins. */
export async function listAssignableUsers() {
  const client = await clerkClient();
  const out: { clerkUserId: string; name: string; role: Role; email: string }[] = [];

  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await client.users.getUserList({ limit: 100, offset });
    for (const u of page.data) {
      const role = getRole(u.publicMetadata);
      if (role === "volunteer") continue;
      out.push({
        clerkUserId: u.id,
        name: displayName(u),
        role,
        email: u.primaryEmailAddress?.emailAddress ?? "",
      });
    }
    if (page.data.length < 100) break;
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveDriver(clerkUserId: string): Promise<AuditUser | null> {
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(clerkUserId);
    if (getRole(u.publicMetadata) === "volunteer") return null;
    return { clerk_user_id: u.id, name: displayName(u) };
  } catch {
    return null;
  }
}

/* ---------------- Google Routes (driving) ---------------- */

type LatLng = { lat: number; lng: number };

function routesKey() {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  if (!key) throw new Error("GOOGLE_ROUTES_API_KEY is missing");
  return key;
}

const durationToSeconds = (d?: string) => (d ? Number(d.replace("s", "")) || 0 : 0);
const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

async function callRoutes(body: Record<string, unknown>) {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": routesKey(),
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
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Google Routes API:", data);
    throw new RouteError(data?.error?.message || "Google could not create the route", 502);
  }
  const route = data.routes?.[0];
  if (!route) throw new RouteError("Google found no driving route through these stops", 404);
  return route;
}

export class RouteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/*
 * Driving route start → stops → finish.
 *
 * optimize=false: stops in the given order.
 * optimize=true:  Google reorders the stops. With a fixed first and/or last
 *   stop, Google only reorders the stops between them: one call optimizes the
 *   middle (from the first stop, or start, to the last stop, or finish), a
 *   second call gets the real path and times for the final order.
 */
export async function computeDriveRoute(opts: {
  start: LatLng;
  finish: LatLng;
  stops: { id: string; point: LatLng }[];
  optimize: boolean;
  firstId?: string | null;
  lastId?: string | null;
  departure?: Date | null;
}) {
  const { start, finish, stops, optimize } = opts;
  const useTraffic =
    opts.departure && !Number.isNaN(opts.departure.getTime()) && opts.departure.getTime() > Date.now() + 60_000;
  const common = {
    travelMode: "DRIVE",
    routingPreference: useTraffic ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
    ...(useTraffic ? { departureTime: opts.departure!.toISOString() } : {}),
    units: "IMPERIAL",
  };

  const byId = new Map(stops.map((s) => [s.id, s]));
  const first = opts.firstId ? byId.get(opts.firstId) : undefined;
  const last = opts.lastId ? byId.get(opts.lastId) : undefined;

  let ordered = stops;

  if (optimize && stops.length > 1) {
    if (first || last) {
      const middle = stops.filter((s) => s !== first && s !== last);
      let middleOrdered = middle;
      if (middle.length > 1) {
        const r = await callRoutes({
          ...common,
          origin: waypoint(first?.point ?? start),
          destination: waypoint(last?.point ?? finish),
          intermediates: middle.map((s) => waypoint(s.point)),
          optimizeWaypointOrder: true,
        });
        const idx: number[] = Array.isArray(r.optimizedIntermediateWaypointIndex) &&
          r.optimizedIntermediateWaypointIndex.length === middle.length
          ? r.optimizedIntermediateWaypointIndex
          : middle.map((_, i) => i);
        middleOrdered = idx.map((i) => middle[i]);
      }
      ordered = [...(first ? [first] : []), ...middleOrdered, ...(last ? [last] : [])];
    } else {
      const r = await callRoutes({
        ...common,
        origin: waypoint(start),
        destination: waypoint(finish),
        intermediates: stops.map((s) => waypoint(s.point)),
        optimizeWaypointOrder: true,
        polylineQuality: "HIGH_QUALITY",
        polylineEncoding: "GEO_JSON_LINESTRING",
      });
      const idx: number[] = Array.isArray(r.optimizedIntermediateWaypointIndex) &&
        r.optimizedIntermediateWaypointIndex.length === stops.length
        ? r.optimizedIntermediateWaypointIndex
        : stops.map((_, i) => i);
      return shapeRoute(r, idx.map((i) => stops[i]), Boolean(useTraffic));
    }
  }

  const r = await callRoutes({
    ...common,
    origin: waypoint(start),
    destination: waypoint(finish),
    intermediates: ordered.map((s) => waypoint(s.point)),
    polylineQuality: "HIGH_QUALITY",
    polylineEncoding: "GEO_JSON_LINESTRING",
  });
  return shapeRoute(r, ordered, Boolean(useTraffic));
}

function shapeRoute(route: any, ordered: { id: string }[], trafficAware: boolean) {
  return {
    orderedLocationIds: ordered.map((s) => s.id),
    path: (route.polyline?.geoJsonLinestring?.coordinates || []).map((c: number[]) => ({
      lng: Number(c[0]),
      lat: Number(c[1]),
    })) as LatLng[],
    distanceMeters: Number(route.distanceMeters || 0),
    driveSeconds: durationToSeconds(route.duration),
    legs: (route.legs || []).map((leg: any) => ({
      distanceMeters: Number(leg.distanceMeters || 0),
      durationSeconds: durationToSeconds(leg.duration),
    })) as { distanceMeters: number; durationSeconds: number }[],
    trafficAware,
    warnings: Array.isArray(route.warnings) ? (route.warnings as string[]) : [],
  };
}
