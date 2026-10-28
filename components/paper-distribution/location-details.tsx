"use client";

import { useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { STATUS_STYLES, WEEKDAY_LABELS, postJson, readJson, type DropLocation } from "./types";

type Props = {
  location: DropLocation;
  stopNumber: number | undefined;
  onClose: () => void;
  onToggleStop: () => void;
  onEdit: () => void;
  onUpdated: (location: DropLocation, note?: string) => void;
};

export function LocationDetails({ location, stopNumber, onClose, onToggleStop, onEdit, onUpdated }: Props) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function setStatus(status: DropLocation["status"]) {
    if (status === "inactive" && !window.confirm(`Remove “${location.label}” from the active directory? Its history is kept and you can reactivate it later.`)) {
      return;
    }
    setBusy(status);
    setError("");
    try {
      const data = await readJson<{ location: DropLocation; usedInRoutes: string[] }>(
        await postJson(`/api/paper/locations/${location.id}`, { status }, "PATCH"),
      );
      onUpdated(
        data.location,
        data.usedInRoutes.length ? `Still a stop in: ${data.usedInRoutes.join(", ")}` : undefined,
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const days = WEEKDAY_LABELS.filter((d) => (location.availability?.days as string[] | undefined)?.includes(d.value))
    .map((d) => d.label)
    .join(", ");

  return (
    <div className="w-full max-w-sm rounded-xl border bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{location.label}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_STYLES[location.status])}>
              {location.status}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{location.address}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Quantity</dt>
        <dd className="font-medium">{location.defaultQuantity}</dd>
        {location.area && (
          <>
            <dt className="text-muted-foreground">Area</dt>
            <dd>{location.area}</dd>
          </>
        )}
        {(days || location.availability?.hours) && (
          <>
            <dt className="text-muted-foreground">Receiving</dt>
            <dd>{[days, location.availability?.hours].filter(Boolean).join(" · ")}</dd>
          </>
        )}
        {(location.contact?.name || location.contact?.phone) && (
          <>
            <dt className="text-muted-foreground">Contact</dt>
            <dd>
              {location.contact.name}
              {location.contact.phone && (
                <a href={`tel:${location.contact.phone}`} className="ml-1 text-primary underline">
                  {location.contact.phone}
                </a>
              )}
            </dd>
          </>
        )}
      </dl>
      {location.instructions && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{location.instructions}</p>
      )}
      {location.updatedBy && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Updated by {location.updatedBy}
          {location.updatedAt ? ` · ${new Date(location.updatedAt).toLocaleDateString()}` : ""}
        </div>
      )}

      {error && <div className="mt-2 text-sm text-red-700">{error}</div>}

      <div className="mt-3 flex flex-wrap gap-2">
        {(location.status === "active" || stopNumber !== undefined) && (
          <Button size="sm" variant={stopNumber !== undefined ? "outline" : "default"} onClick={onToggleStop}>
            {stopNumber !== undefined ? `Remove stop ${stopNumber} from route` : "Add to route"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
        {location.status === "active" && (
          <Button size="sm" variant="ghost" onClick={() => setStatus("paused")} disabled={Boolean(busy)}>
            {busy === "paused" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Pause
          </Button>
        )}
        {location.status !== "active" && (
          <Button size="sm" variant="ghost" onClick={() => setStatus("active")} disabled={Boolean(busy)}>
            {busy === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Reactivate
          </Button>
        )}
        {location.status !== "inactive" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-700"
            onClick={() => setStatus("inactive")}
            disabled={Boolean(busy)}
          >
            {busy === "inactive" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Remove
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}&query_place_id=${location.placeId}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Google Maps
          </a>
        </Button>
      </div>
    </div>
  );
}
