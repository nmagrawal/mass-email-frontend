"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { PlaceSearch, fetchPlaceDetails } from "./place-search";
import { postJson, readJson, type City, type DropLocation, type RoutePointValue } from "./types";

type Mode = "depot" | "location" | "address";

type Props = {
  label: string;
  city: City;
  value: RoutePointValue | null;
  locations: DropLocation[];
  onChange: (value: RoutePointValue | null) => void;
  onCityUpdated: (city: City) => void;
};

/* Start/finish chooser: city depot, a directory location, or any address. */
export function RoutePointPicker({ label, city, value, locations, onChange, onCityUpdated }: Props) {
  const [mode, setMode] = useState<Mode>(value?.type ?? (city.depot ? "depot" : "address"));
  const [loading, setLoading] = useState(false);
  const [savingDepot, setSavingDepot] = useState(false);
  const [error, setError] = useState("");

  // Follow the value when it's replaced from outside (e.g. a saved route loads).
  useEffect(() => {
    if (value?.type) setMode(value.type);
  }, [value?.type]);

  function selectMode(next: Mode) {
    setMode(next);
    setError("");
    if (next === "depot") onChange(city.depot ? { ...city.depot, type: "depot" } : null);
    else if (value?.type !== next) onChange(null);
  }

  async function pickAddress(placeId: string, token: string) {
    setLoading(true);
    setError("");
    try {
      const { place } = await fetchPlaceDetails(placeId, token);
      onChange({
        type: "address",
        label: place.name || place.formattedAddress,
        locationId: null,
        placeId: place.placeId,
        formattedAddress: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAsDepot() {
    if (!value) return;
    setSavingDepot(true);
    setError("");
    try {
      const data = await readJson<{ city: City }>(
        await postJson(`/api/paper/cities/${city.id}`, { depot: { ...value, type: "depot" } }, "PATCH"),
      );
      onCityUpdated({ ...city, ...data.city });
      setMode("depot");
      onChange(data.city.depot);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingDepot(false);
    }
  }

  const activeLocations = locations.filter((l) => l.status === "active");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <select
          value={mode}
          onChange={(e) => selectMode(e.target.value as Mode)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="depot" disabled={!city.depot}>
            Depot{city.depot ? "" : " (not set)"}
          </option>
          <option value="location">Saved location</option>
          <option value="address">Address…</option>
        </select>
      </div>

      {mode === "depot" && city.depot && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div className="font-medium">{city.depot.label}</div>
          <div className="text-xs text-muted-foreground">{city.depot.formattedAddress}</div>
        </div>
      )}

      {mode === "location" && (
        <select
          value={value?.type === "location" ? value.locationId ?? "" : ""}
          onChange={(e) => {
            const loc = activeLocations.find((l) => l.id === e.target.value);
            onChange(
              loc
                ? {
                    type: "location",
                    label: loc.label,
                    locationId: loc.id,
                    placeId: loc.placeId,
                    formattedAddress: loc.address,
                    lat: loc.lat,
                    lng: loc.lng,
                  }
                : null,
            );
          }}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Choose a location…</option>
          {activeLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      )}

      {mode === "address" && (
        <>
          {value?.type === "address" ? (
            <div className="flex items-start justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{value.label}</div>
                <div className="truncate text-xs text-muted-foreground">{value.formattedAddress}</div>
              </div>
              <button type="button" className="text-xs underline" onClick={() => onChange(null)}>
                Change
              </button>
            </div>
          ) : (
            <PlaceSearch bias={city.center} placeholder="Search start address" onSelect={(s, t) => pickAddress(s.placeId, t)} />
          )}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {value?.type === "address" && (
            <Button type="button" size="sm" variant="ghost" onClick={saveAsDepot} disabled={savingDepot}>
              {savingDepot && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Make this the {city.name} depot
            </Button>
          )}
        </>
      )}

      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}
