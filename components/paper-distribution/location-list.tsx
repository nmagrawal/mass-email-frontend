"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { STATUS_STYLES, type DropLocation } from "./types";

type Props = {
  locations: DropLocation[];
  loading: boolean;
  error: string;
  stopNumbers: Map<string, number>;
  focusedId: string | null;
  onToggle: (location: DropLocation) => void;
  onFocus: (location: DropLocation) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

export function LocationList({
  locations,
  loading,
  error,
  stopNumbers,
  focusedId,
  onToggle,
  onFocus,
  onSelectAll,
  onClear,
}: Props) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  // Clicking a pin on the map scrolls its row into view.
  useEffect(() => {
    if (focusedId) itemRefs.current.get(focusedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedId]);

  const selectable = locations.filter((l) => l.status === "active");
  const selectedInView = locations.filter((l) => stopNumbers.has(l.id)).length;
  const totalCopies = locations
    .filter((l) => l.status === "active")
    .reduce((sum, l) => sum + l.defaultQuantity, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>
          {locations.length} location{locations.length === 1 ? "" : "s"} · {totalCopies.toLocaleString()} copies/active
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={selectable.length === 0}
            className="font-medium text-primary hover:underline disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={stopNumbers.size === 0}
            className="font-medium hover:underline disabled:opacity-40"
          >
            Clear{stopNumbers.size ? ` (${stopNumbers.size})` : ""}
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <div className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading locations…
          </div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No locations match.</div>
        ) : (
          <ul className="divide-y">
            {locations.map((loc) => {
              const number = stopNumbers.get(loc.id);
              const canSelect = loc.status === "active" || number !== undefined;
              return (
                <li
                  key={loc.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(loc.id, el);
                    else itemRefs.current.delete(loc.id);
                  }}
                  className={cn("flex items-start gap-2 px-3 py-2.5", loc.id === focusedId && "bg-accent")}
                >
                  <label className="flex shrink-0 items-center pt-0.5" title="Add to route">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={number !== undefined}
                      disabled={!canSelect}
                      onChange={() => onToggle(loc)}
                      aria-label={`Add ${loc.label} to route`}
                    />
                  </label>
                  <button type="button" onClick={() => onFocus(loc)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      {number !== undefined && (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                          {number}
                        </span>
                      )}
                      <span className="truncate text-sm font-medium">{loc.label}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {loc.area ? `${loc.area} · ` : ""}
                      {loc.address}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{loc.defaultQuantity}</span>
                    {loc.status !== "active" && (
                      <span className={cn("rounded-full px-1.5 text-[10px]", STATUS_STYLES[loc.status])}>
                        {loc.status}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedInView < stopNumbers.size && (
        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          {stopNumbers.size - selectedInView} selected stop(s) hidden by the current filter
        </div>
      )}
    </div>
  );
}
