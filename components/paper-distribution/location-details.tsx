"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { STOP_STATUS_STYLE, formatDate, n, type StopRecord } from "./delivery-types";
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
  const [history, setHistory] = useState<{
    history: StopRecord[];
    summary: { rounds: number; dropped: number; pickedUp: number; leftoverRate: number | null };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    fetch(`/api/paper/locations/${location.id}/history?limit=6`)
      .then((r) => readJson(r))
      .then((d: any) => !cancelled && setHistory(d))
      .catch(() => !cancelled && setHistory(null));
    return () => {
      cancelled = true;
    };
  }, [location.id]);

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

      {history && history.history.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Recent rounds</span>
            {history.summary.leftoverRate != null && (
              <span>{Math.round(history.summary.leftoverRate * 100)}% picked up as leftovers</span>
            )}
          </div>
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="font-normal">Date</th>
                <th className="text-right font-normal">Dropped</th>
                <th className="text-right font-normal">Old picked up</th>
                <th className="pl-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.history.map((h) => (
                <tr key={h.id} title={h.reason || undefined}>
                  <td>{formatDate(h.publishDate)}</td>
                  <td className="text-right tabular-nums">{n(h.deliveredQuantity)}</td>
                  <td className="text-right tabular-nums">{n(h.pickedUpQuantity)}</td>
                  <td className="pl-2">
                    <span className={cn("rounded-full px-1.5", STOP_STATUS_STYLE[h.status])}>{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
