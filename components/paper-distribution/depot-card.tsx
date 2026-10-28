"use client";

import { useState } from "react";
import { Loader2, Warehouse } from "lucide-react";

import { Button } from "@/components/ui/button";

import { PlaceSearch, fetchPlaceDetails } from "./place-search";
import { postJson, readJson, type City, type DropLocation, type RoutePointValue } from "./types";

/* The city's depot = default start for routes. Lives on the Locations tab. */
export function DepotCard({
  city,
  locations,
  onCityUpdated,
}: {
  city: City;
  locations: DropLocation[];
  onCityUpdated: (city: City) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(depot: RoutePointValue | null) {
    setSaving(true);
    setError("");
    try {
      const data = await readJson<{ city: City }>(await postJson(`/api/paper/cities/${city.id}`, { depot }, "PATCH"));
      onCityUpdated({ ...city, ...data.city });
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickAddress(placeId: string, token: string) {
    setSaving(true);
    setError("");
    try {
      const { place } = await fetchPlaceDetails(placeId, token);
      await save({
        type: "depot",
        label: place.name || place.formattedAddress,
        locationId: null,
        placeId: place.placeId,
        formattedAddress: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
      });
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 border-b bg-muted/30 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">Depot (default route start)</div>
            {city.depot ? (
              <>
                <div className="truncate text-sm font-medium">{city.depot.label}</div>
                <div className="truncate text-xs text-muted-foreground">{city.depot.formattedAddress}</div>
              </>
            ) : (
              <div className="text-sm text-amber-700">Not set yet</div>
            )}
          </div>
        </div>
        <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={() => setEditing((e) => !e)}>
          {editing ? "Close" : city.depot ? "Change" : "Set"}
        </Button>
      </div>

      {editing && (
        <div className="space-y-2">
          <PlaceSearch bias={city.center} placeholder="Search depot address" onSelect={(s, t) => pickAddress(s.placeId, t)} />
          <select
            defaultValue=""
            onChange={(e) => {
              const loc = locations.find((l) => l.id === e.target.value);
              if (loc) {
                save({
                  type: "depot",
                  label: loc.label,
                  locationId: null,
                  placeId: loc.placeId,
                  formattedAddress: loc.address,
                  lat: loc.lat,
                  lng: loc.lng,
                });
              }
            }}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">…or use a saved location</option>
            {locations
              .filter((l) => l.status !== "inactive")
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
          </select>
          {city.depot && (
            <button type="button" className="text-xs text-red-700 underline" onClick={() => save(null)} disabled={saving}>
              Clear depot
            </button>
          )}
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}
