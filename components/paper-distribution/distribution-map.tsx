"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";

import type { ComputedRoute, DropLocation } from "./types";

let googleMapsConfigured = false;

type Point = { lat: number; lng: number; label: string };

type Props = {
  center: { lat: number; lng: number };
  locations: DropLocation[];
  /* locationId → stop number (1-based) for selected stops */
  stopNumbers: Map<string, number>;
  focusedId: string | null;
  route: ComputedRoute | null;
  routeStale: boolean;
  start: Point | null;
  finish: Point | null;
  /* Changing this re-fits the map to the current locations. */
  fitKey: string;
  onPinClick: (locationId: string) => void;
};

const COLORS = {
  selected: "#2563eb",
  active: "#475569",
  paused: "#d97706",
  inactive: "#9ca3af",
};

function makePin(loc: DropLocation, number: number | undefined, focused: boolean) {
  const el = document.createElement("div");
  const selected = number !== undefined;
  const color = selected ? COLORS.selected : COLORS[loc.status];
  const size = selected ? 28 : 18;

  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    background: color,
    border: `${focused ? 4 : 2}px solid ${focused ? "#facc15" : "white"}`,
    boxShadow: "0 1px 4px rgba(0,0,0,.35)",
    color: "white",
    font: "600 12px system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    opacity: loc.status === "inactive" ? "0.7" : "1",
  });
  if (selected) el.textContent = String(number);
  return el;
}

function makeEndpoint(text: string, color: string) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    padding: "2px 6px",
    borderRadius: "6px",
    background: color,
    color: "white",
    font: "600 11px system-ui, sans-serif",
    border: "2px solid white",
    boxShadow: "0 1px 4px rgba(0,0,0,.35)",
    whiteSpace: "nowrap",
  });
  el.textContent = text;
  return el;
}

export function DistributionMap({
  center,
  locations,
  stopNumbers,
  focusedId,
  route,
  routeStale,
  start,
  finish,
  fitKey,
  onPinClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const libsRef = useRef<{
    AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
    Polyline: typeof google.maps.Polyline;
    LatLngBounds: typeof google.maps.LatLngBounds;
  } | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const endpointMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const onPinClickRef = useRef(onPinClick);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  onPinClickRef.current = onPinClick;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        setError("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");
        return;
      }
      if (!googleMapsConfigured) {
        setOptions({ key: apiKey, v: "weekly" });
        googleMapsConfigured = true;
      }

      const [{ Map, Polyline }, { AdvancedMarkerElement }, { LatLngBounds }] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        importLibrary("core"),
      ]);

      if (cancelled || !containerRef.current) return;

      mapRef.current = new Map(containerRef.current, {
        center,
        zoom: 13,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
        clickableIcons: false,
        streetViewControl: false,
        mapTypeControl: false,
      });
      libsRef.current = { AdvancedMarkerElement, Polyline, LatLngBounds };
      setReady(true);
    }

    init().catch((err) => setError(err?.message || "Failed to load Google Maps"));

    return () => {
      cancelled = true;
    };
    // The map is created once; center changes are handled by fitKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Location pins
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;

    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = locations.map((loc) => {
      const number = stopNumbers.get(loc.id);
      const marker = new libs.AdvancedMarkerElement({
        map,
        position: { lat: loc.lat, lng: loc.lng },
        title: loc.label,
        content: makePin(loc, number, loc.id === focusedId),
        zIndex: loc.id === focusedId ? 2000 : number !== undefined ? 1000 + number : 1,
        gmpClickable: true,
      });
      marker.addEventListener("gmp-click", () => onPinClickRef.current(loc.id));
      return marker;
    });
  }, [ready, locations, stopNumbers, focusedId]);

  // Start / finish markers
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;

    endpointMarkersRef.current.forEach((m) => (m.map = null));
    const points: { p: Point; text: string; color: string }[] = [];
    if (start) points.push({ p: start, text: finish ? "Start" : "Start / Finish", color: "#16a34a" });
    if (finish) points.push({ p: finish, text: "Finish", color: "#dc2626" });

    endpointMarkersRef.current = points.map(
      ({ p, text, color }) =>
        new libs.AdvancedMarkerElement({
          map,
          position: { lat: p.lat, lng: p.lng },
          title: `${text}: ${p.label}`,
          content: makeEndpoint(text, color),
          zIndex: 3000,
        }),
    );
  }, [ready, start, finish]);

  // Route path
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;

    polylineRef.current?.setMap(null);
    polylineRef.current = null;

    if (route?.path.length) {
      polylineRef.current = new libs.Polyline({
        map,
        path: route.path,
        strokeColor: routeStale ? "#9ca3af" : "#2563eb",
        strokeOpacity: routeStale ? 0.6 : 0.85,
        strokeWeight: 5,
        ...(routeStale
          ? {
              strokeOpacity: 0,
              icons: [
                {
                  icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, strokeColor: "#6b7280", scale: 3 },
                  offset: "0",
                  repeat: "14px",
                },
              ],
            }
          : {}),
      });
    }
  }, [ready, route, routeStale]);

  // Fit to the route when one is calculated
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs || !route?.path.length) return;
    const bounds = new libs.LatLngBounds();
    route.path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [ready, route]);

  // Fit to locations when the city / filter changes
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;
    if (locations.length === 0) {
      map.setCenter(center);
      map.setZoom(13);
      return;
    }
    const bounds = new libs.LatLngBounds();
    locations.forEach((l) => bounds.extend({ lat: l.lat, lng: l.lng }));
    map.fitBounds(bounds, 48);
    if (locations.length === 1) map.setZoom(16);
    // Only when fitKey changes — not on every selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  // Pan to the focused pin
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focusedId) return;
    const loc = locations.find((l) => l.id === focusedId);
    if (loc) map.panTo({ lat: loc.lat, lng: loc.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusedId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-x-3 top-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 rounded-md bg-background/90 px-2 py-1 text-[11px] shadow">
        <Legend color={COLORS.selected} label="On route" />
        <Legend color={COLORS.active} label="Active" />
        <Legend color={COLORS.paused} label="Paused" />
        <Legend color={COLORS.inactive} label="Inactive" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
