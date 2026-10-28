"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { newSessionToken, postJson, readJson, type PlaceSuggestion } from "./types";

type Props = {
  placeholder?: string;
  bias?: { lat: number; lng: number } | null;
  citiesOnly?: boolean;
  autoFocus?: boolean;
  /* sessionToken must be sent with the details request that follows. */
  onSelect: (suggestion: PlaceSuggestion, sessionToken: string) => void;
};

/*
 * Google business/address dropdown (Places API New, via our server).
 * One session token per search → selection, as Google bills per session.
 */
export function PlaceSearch({ placeholder, bias, citiesOnly, autoFocus, onSelect }: Props) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const sessionRef = useRef(newSessionToken());
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = input.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/paper/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: query, sessionToken: sessionRef.current, bias, citiesOnly }),
          signal: controller.signal,
        });
        const data = await readJson<{ suggestions: PlaceSuggestion[] }>(res);
        setSuggestions(data.suggestions);
        setHighlight(0);
        setOpen(true);
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
    // bias is an object; only its values matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, bias?.lat, bias?.lng, citiesOnly]);

  function choose(suggestion: PlaceSuggestion) {
    onSelect(suggestion, sessionRef.current);
    sessionRef.current = newSessionToken();
    setInput("");
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !suggestions.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(suggestions[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder || "Search a business or address"}
        className="pl-9 pr-8"
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {error && <div className="mt-1 text-xs text-red-700">{error}</div>}

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
                  i === highlight && "bg-accent",
                )}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.primary}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-right text-[10px] text-muted-foreground">Powered by Google</li>
        </ul>
      )}
    </div>
  );
}

/* Fetch details for a chosen suggestion (closes the Google session). */
export async function fetchPlaceDetails(placeId: string, sessionToken: string, cityId?: string) {
  return readJson<{ place: import("./types").PlaceDetails; duplicates: import("./types").DropLocation[] }>(
    await postJson("/api/paper/places/details", { placeId, sessionToken, cityId }),
  );
}
