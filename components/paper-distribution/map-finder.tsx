"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

import type { DropLocation } from "./types";

/* Search box over the Plan map: find a location and jump to its pin. */
export function MapFinder({
  locations,
  stopNumbers,
  onPick,
}: {
  locations: DropLocation[];
  stopNumbers: Map<string, number>;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return locations
      .filter((l) => [l.label, l.area, l.address].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [locations, query]);

  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Find a location on the map"
        className="h-9 bg-background pl-9 shadow"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {matches.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(l.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {stopNumbers.has(l.id) && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                    {stopNumbers.get(l.id)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.area || l.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
