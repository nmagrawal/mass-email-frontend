import type {
  SerializedCity,
  SerializedLocation,
  SerializedRoutePoint,
  SerializedRouteTemplate,
} from "@/lib/paper-distribution";

export type City = SerializedCity & { locationCount?: number };
export type DropLocation = SerializedLocation;
export type RoutePointValue = SerializedRoutePoint;
export type RouteTemplate = SerializedRouteTemplate;

export type LocationStatusFilter = "current" | "active" | "paused" | "inactive" | "all";

export type PlannedStop = {
  locationId: string;
  quantity: number | null; // null → location default
  stopMinutes: number | null; // null → route default
};

export type ComputedRoute = {
  orderedLocationIds: string[];
  path: { lat: number; lng: number }[];
  distanceMeters: number;
  driveSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
  trafficAware: boolean;
  start: { label: string; lat: number; lng: number };
  finish: { label: string; lat: number; lng: number };
  warnings: string[];
};

export type Unroutable = { locationId: string; label: string; reason: string };

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
  types: string[];
};

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

export const WEEKDAY_LABELS: { value: string; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export async function readJson<T = any>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      data?: any;
    };
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data as T;
}

export function postJson(url: string, body: unknown, method = "POST") {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function newSessionToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatMiles(meters: number) {
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatClock(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  inactive: "bg-gray-200 text-gray-600",
};
